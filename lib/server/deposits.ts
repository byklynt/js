import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { callFn } from "./repo/rpc";
import { logSystem, rupiah } from "./repo/notify";
import { loadSettings } from "./repo/settings";
import { ServiceError } from "./tx";
import { supabaseAdmin } from "./supabase-admin";

export type WebhookPayload = { transactionId: string; reference: string; amount: number; status: "paid" | "failed" | "expired" };

/**
 * Credit a successful deposit (+ bonus by tier) exactly once, inside Postgres (credit_deposit).
 * Idempotent three ways: external transaction id is UNIQUE, deposit status, and ledger keys.
 * The webhook and the admin "konfirmasi manual" button both call this.
 */
export async function creditDeposit(input: { depositId: string; externalId: string | null; amount?: number; by: string }): Promise<{ duplicate: boolean; bonus: number }> {
  const { data: dep } = await supabaseAdmin().from("deposits").select("user_id,amount,method").eq("id", input.depositId).maybeSingle();
  if (!dep) throw new ServiceError("Deposit tidak ditemukan.", "no_deposit");
  const [row] = await callFn("credit_deposit", {
    p_external_id: (input.externalId ?? null) as string, p_user_id: dep.user_id, p_amount: input.amount ?? Number(dep.amount), p_method: dep.method, p_deposit_id: input.depositId, p_by: input.by,
  });
  return { duplicate: row.duplicate, bonus: Number(row.bonus) };
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
export async function handlePaymentWebhook(rawBody: string, signature: string | null, secret: string | undefined): Promise<WebhookResult> {
  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    await logSystem("webhook.rejected", "deposit", "-", null, { reason: "signature" });
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
  const db = supabaseAdmin();
  // Every delivery is stored once per gateway transaction id (UNIQUE): a replay is recognised even before crediting.
  await db.from("webhook_events").upsert({ external_id: payload.transactionId, payload: payload as never }, { onConflict: "external_id", ignoreDuplicates: true });
  if (payload.status !== "paid") {
    await logSystem("webhook.ignored", "deposit", payload.reference, null, { status: payload.status });
    return { status: 200, body: { ok: true, message: "Status diabaikan." } };
  }
  try {
    const res = await creditDeposit({ depositId: payload.reference, externalId: payload.transactionId, amount: payload.amount, by: "webhook" });
    await db.from("webhook_events").update({ processed: true }).eq("external_id", payload.transactionId);
    await logSystem(res.duplicate ? "webhook.duplicate" : "webhook.credited", "deposit", payload.reference, null, { transactionId: payload.transactionId, bonus: res.bonus });
    return { status: 200, body: { ok: true, message: res.duplicate ? "Duplikat diabaikan." : "Saldo ditambahkan." } };
  } catch (e) {
    const message = e instanceof ServiceError ? e.message : "Gagal memproses.";
    await logSystem("webhook.failed", "deposit", payload.reference, null, { message });
    return { status: e instanceof ServiceError ? 422 : 500, body: { ok: false, message } };
  }
}

export const MAX_PENDING_DEPOSITS = 5;

/** A user asks to top up. With no payment gateway this is a pending row an admin confirms (creditDeposit) after the money arrived. */
export async function createDepositRequest(input: { userId: string; amount: number; methodId: string }): Promise<{ id: string; username: string; amount: number }> {
  const db = supabaseAdmin();
  const { data: user } = await db.from("profiles").select("username,status").eq("id", input.userId).maybeSingle();
  if (!user) throw new ServiceError("Pengguna tidak ditemukan.", "no_user");
  if (user.status !== "aktif") throw new ServiceError("Akunmu sedang diblokir.", "blocked");
  const { minDeposit, activeMethods } = (await loadSettings()).payments;
  if (!Number.isInteger(input.amount) || input.amount < minDeposit) throw new ServiceError(`Minimal deposit ${rupiah(minDeposit)}.`, "below_min");
  if (input.amount > 100_000_000) throw new ServiceError("Maksimal deposit Rp 100.000.000 per permintaan.", "above_max");
  if (!activeMethods.includes(input.methodId)) throw new ServiceError("Metode pembayaran tidak tersedia.", "bad_method");
  const { count } = await db.from("deposits").select("id", { count: "exact", head: true }).eq("user_id", input.userId).eq("status", "menunggu");
  if ((count ?? 0) >= MAX_PENDING_DEPOSITS) throw new ServiceError("Masih ada beberapa deposit yang menunggu konfirmasi. Tunggu atau hubungi support.", "too_many_pending");
  const { data, error } = await db.from("deposits").insert({ user_id: input.userId, method: methodLabel(input.methodId), amount: input.amount, status: "menunggu" }).select("id").single();
  if (error) throw new Error(`deposits: ${error.message}`);
  await logSystem("deposit.request", "deposit", data.id, null, { amount: input.amount, method: methodLabel(input.methodId) });
  return { id: data.id, username: user.username, amount: input.amount };
}

const METHOD_LABELS: Record<string, string> = { manual: "Transfer manual", qris: "QRIS", bank: "Transfer Bank", ewallet: "E-Wallet", va: "Virtual Account" };
export const methodLabel = (id: string) => METHOD_LABELS[id] ?? id;
