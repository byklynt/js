import { createHmac, timingSafeEqual } from "node:crypto";
import type { AdminDb, AdminDeposit } from "@/lib/admin-data";
import { applyLedgerEntry } from "./ledger";
import { logSystem, notifyDeposit, rupiah } from "./notifications";
import { sendAlert } from "./notify";
import { bonusPercentFor } from "./rules";
import { ServiceError, withTransaction } from "./tx";

export type WebhookPayload = { transactionId: string; reference: string; amount: number; status: "paid" | "failed" | "expired" };

/**
 * Credit a successful deposit (+ bonus by tier) exactly once.
 * Idempotent three ways: external transaction ID is UNIQUE, deposit status, and ledger keys.
 * The webhook and the admin "konfirmasi manual" button both call this.
 */
export function creditDeposit(
  db: AdminDb,
  input: { depositId: string; externalId: string | null; amount?: number; by: string },
  now = new Date()
): { deposit: AdminDeposit; duplicate: boolean; bonus: number } {
  return withTransaction(db, () => {
    const deposit = db.deposits.find((d) => d.id === input.depositId);
    if (!deposit) throw new ServiceError("Deposit tidak ditemukan.", "no_deposit");
    if (input.externalId) {
      const used = db.deposits.find((d) => d.externalId === input.externalId && d.id !== deposit.id);
      if (used) throw new ServiceError("ID transaksi sudah dipakai deposit lain.", "duplicate_external_id");
    }
    if (deposit.status === "berhasil") return { deposit, duplicate: true, bonus: 0 };
    if (input.amount !== undefined && input.amount !== deposit.amount) throw new ServiceError("Nominal tidak cocok dengan deposit.", "amount_mismatch");

    applyLedgerEntry(db, { userId: deposit.userId, type: "deposit", amount: deposit.amount, refType: "deposit", refId: deposit.id, note: `Deposit ${deposit.method}`, createdBy: input.by, now });
    const percent = bonusPercentFor(deposit.amount, db.settings.payments.bonusTiers);
    const bonus = Math.floor((deposit.amount * percent) / 100);
    if (bonus > 0) {
      applyLedgerEntry(db, { userId: deposit.userId, type: "bonus", amount: bonus, refType: "deposit_bonus", refId: deposit.id, note: `Bonus deposit ${percent}%`, createdBy: input.by, now });
    }
    deposit.status = "berhasil";
    if (deposit.amount >= db.settings.notifications.largeDepositAmount) {
      sendAlert(db, "large_deposit", `Deposit besar ${rupiah(deposit.amount)} dari ${deposit.username}.`, now);
    }
    if (input.externalId) deposit.externalId = input.externalId;
    notifyDeposit(db, { id: deposit.id, userId: deposit.userId, amount: deposit.amount, ok: true, bonus }, now);
    return { deposit, duplicate: false, bonus };
  });
}

/**
 * TODO(gateway): replace with the payment gateway's real signature scheme. This placeholder checks
 * HMAC-SHA256(rawBody, PAYMENT_WEBHOOK_SECRET) as hex. With no secret configured, every webhook is rejected.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null, secret: string | undefined): boolean {
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type WebhookResult = { status: number; body: { ok: boolean; message: string } };

/** Handles one webhook call. Every call is logged; duplicates are acknowledged but ignored. */
export function handlePaymentWebhook(db: AdminDb, rawBody: string, signature: string | null, secret: string | undefined, now = new Date()): WebhookResult {
  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    logSystem(db, "webhook.rejected", "deposit", "-", null, { reason: "signature" }, now);
    return { status: 401, body: { ok: false, message: "Signature tidak valid." } };
  }
  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    return { status: 400, body: { ok: false, message: "Payload tidak valid." } };
  }
  if (!payload.transactionId || !payload.reference || !Number.isInteger(payload.amount)) {
    return { status: 400, body: { ok: false, message: "Payload tidak lengkap." } };
  }
  if (payload.status !== "paid") {
    logSystem(db, "webhook.ignored", "deposit", payload.reference, null, { status: payload.status }, now);
    return { status: 200, body: { ok: true, message: "Status diabaikan." } };
  }
  try {
    const res = creditDeposit(db, { depositId: payload.reference, externalId: payload.transactionId, amount: payload.amount, by: "webhook" }, now);
    logSystem(db, res.duplicate ? "webhook.duplicate" : "webhook.credited", "deposit", payload.reference, null, { transactionId: payload.transactionId, bonus: res.bonus }, now);
    return { status: 200, body: { ok: true, message: res.duplicate ? "Duplikat diabaikan." : "Saldo ditambahkan." } };
  } catch (e) {
    const message = e instanceof ServiceError ? e.message : "Gagal memproses.";
    logSystem(db, "webhook.failed", "deposit", payload.reference, null, { message }, now);
    return { status: e instanceof ServiceError ? 422 : 500, body: { ok: false, message } };
  }
}
