import type { AdminDb, AdminOrder } from "@/lib/admin-data";
import { applyLedgerEntry } from "./ledger";
import { logSystem, notifyOrderStatus, notifyRefund, notifyUser, rupiah } from "./notifications";
import { computeExpectedRefund, computeUserCancelRefund, isActiveStatus, refundReasonFor } from "./rules";
import { ServiceError, withTransaction } from "./tx";
import type { RefundRecord, RefundSource } from "./types";

let counter = 0;
const newId = () => `rf_${Date.now().toString(36)}_${++counter}`;

/** What can still be refunded for an order. Never more than the charge. */
export function refundableRemaining(order: AdminOrder): number {
  return Math.max(0, order.charge - order.refundedAmount);
}

function assertWithinCharge(order: AdminOrder, amount: number) {
  if (!Number.isInteger(amount) || amount <= 0) throw new ServiceError("Nominal refund harus lebih dari nol.", "bad_amount");
  if (amount > refundableRemaining(order)) {
    throw new ServiceError(`Refund melebihi sisa yang bisa dikembalikan (${rupiah(refundableRemaining(order))}).`, "refund_exceeds_charge");
  }
}

/**
 * Credit one refund row to the user. Idempotent: the ledger entry is keyed on the refund id, and a
 * refund that is already "selesai" is returned unchanged. Runs inside the caller's transaction.
 */
function settle(db: AdminDb, refund: RefundRecord, processedBy: string | null, now: Date): { refund: RefundRecord; duplicate: boolean } {
  if (refund.status === "selesai") return { refund, duplicate: true };
  const order = db.orders.find((o) => o.id === refund.orderId);
  if (!order) throw new ServiceError("Pesanan tidak ditemukan.", "no_order");
  assertWithinCharge(order, refund.amount);
  const { duplicate } = applyLedgerEntry(db, {
    userId: refund.userId,
    type: "refund",
    amount: refund.amount,
    refType: "refund",
    refId: refund.id,
    note: `Refund pesanan #${order.id} (${refund.reason})`,
    createdBy: processedBy ?? "system",
    now,
  });
  if (!duplicate) order.refundedAmount += refund.amount;
  refund.status = "selesai";
  refund.processedBy = processedBy;
  refund.processedAt = now.toISOString();
  notifyRefund(db, { id: refund.id, userId: refund.userId, orderId: order.id, amount: refund.amount }, now);
  return { refund, duplicate };
}

/**
 * Automatic refund for an order that ended as dibatalkan / sebagian / gagal_kirim.
 * UNIQUE(order_id, reason): running it twice (double sync) creates and credits exactly once.
 */
export function autoRefundForOrder(db: AdminDb, orderId: string, now = new Date()): { refund: RefundRecord | null; created: boolean } {
  return withTransaction(db, () => {
    const order = db.orders.find((o) => o.id === orderId);
    if (!order) throw new ServiceError("Pesanan tidak ditemukan.", "no_order");
    const reason = refundReasonFor(order.status);
    // A cancellation the USER asked for is never refunded automatically at 100%: it goes through approveRefund() and the policy.
    if (order.cancelledBy === "user") return { refund: null, created: false };
    if (!reason) return { refund: null, created: false };
    const existing = db.refunds.find((r) => r.orderId === order.id && r.reason === reason && !r.reversed);
    if (existing) return { refund: existing, created: false };
    const amount = Math.min(computeExpectedRefund(order), refundableRemaining(order));
    if (amount <= 0) return { refund: null, created: false };
    const refund: RefundRecord = {
      id: newId(), orderId: order.id, userId: order.userId, username: order.username, amount, reason, source: "auto",
      status: "menunggu", processedBy: null, rejectReason: null, note: null, createdAt: now.toISOString(), processedAt: null, reversed: false,
    };
    db.refunds.unshift(refund);
    // Users under review: the refund is created but an admin must approve it.
    if (db.users.find((u) => u.id === order.userId)?.manualApproval) {
      logSystem(db, "refund.auto_held", "refund", refund.id, null, { orderId: order.id, amount }, now);
      return { refund, created: true };
    }
    settle(db, refund, null, now);
    logSystem(db, "refund.auto", "refund", refund.id, null, { orderId: order.id, amount, reason }, now);
    return { refund, created: true };
  });
}

/** Manual / user-requested refund waiting for an admin decision (or settled right away by an admin). */
export function createManualRefund(
  db: AdminDb,
  input: { orderId: string; amount: number; note: string; source: Extract<RefundSource, "admin" | "user_request">; adminId?: string; settleNow?: boolean },
  now = new Date()
): RefundRecord {
  return withTransaction(db, () => {
    const order = db.orders.find((o) => o.id === input.orderId);
    if (!order) throw new ServiceError("Pesanan tidak ditemukan.", "no_order");
    if (input.note.trim().length < 10) throw new ServiceError("Alasan minimal 10 karakter.", "note_too_short");
    assertWithinCharge(order, input.amount);
    const open = db.refunds.some((r) => r.orderId === order.id && r.reason === "manual" && r.status === "menunggu");
    if (open) throw new ServiceError("Masih ada refund manual yang menunggu untuk pesanan ini.", "refund_pending");
    const refund: RefundRecord = {
      id: newId(), orderId: order.id, userId: order.userId, username: order.username, amount: input.amount, reason: "manual",
      source: input.source, status: "menunggu", processedBy: null, rejectReason: null, note: input.note.trim(), createdAt: now.toISOString(), processedAt: null, reversed: false,
    };
    db.refunds.unshift(refund);
    if (input.settleNow) settle(db, refund, input.adminId ?? null, now);
    return refund;
  });
}

export type ApproveOptions = { overrideAmount?: number; overrideReason?: string };

/**
 * For a user_cancel refund: validate the order, apply the policy formula to the CURRENT state of the order (or the admin's
 * override), then cancel the order. Runs inside approveRefund's transaction.
 */
function applyUserCancel(db: AdminDb, refund: RefundRecord, opts: ApproveOptions, now: Date) {
  const order = db.orders.find((o) => o.id === refund.orderId);
  if (!order) throw new ServiceError("Pesanan tidak ditemukan.", "no_order");
  if (!isActiveStatus(order.status)) throw new ServiceError("Pesanan sudah selesai atau dibatalkan. Tolak permintaan ini.", "not_cancellable");
  const percent = refund.policyPercent ?? db.settings.cancelPolicy.refundPercent;
  let amount = computeUserCancelRefund(order, percent);
  if (opts.overrideAmount !== undefined) {
    if ((opts.overrideReason ?? "").trim().length < 10) throw new ServiceError("Alasan mengubah nominal minimal 10 karakter.", "override_reason");
    if (!Number.isInteger(opts.overrideAmount) || opts.overrideAmount <= 0) throw new ServiceError("Nominal harus lebih dari nol.", "bad_amount");
    if (opts.overrideAmount > refundableRemaining(order)) throw new ServiceError(`Nominal melebihi sisa yang bisa direfund (${rupiah(refundableRemaining(order))}).`, "refund_exceeds_charge");
    amount = opts.overrideAmount;
    refund.overridden = true;
    refund.note = `${refund.note ?? ""} Nominal diubah admin: ${opts.overrideReason!.trim()}`.trim();
  }
  if (amount <= 0) throw new ServiceError("Tidak ada bagian yang belum terkirim, jadi tidak ada yang direfund. Tolak permintaan ini.", "nothing_to_refund");
  refund.amount = amount;
  refund.policyPercent = percent;
  order.status = "dibatalkan";
  order.cancelledBy = "user";
  order.cancelPolicyPercent = percent;
  order.completedAt = now.toISOString();
  const request = db.cancelRequests.find((c) => c.id === refund.cancelRequestId);
  if (request) request.status = "selesai";
  notifyOrderStatus(db, order, now);
}

/**
 * Admin approves a waiting refund. Idempotent: approving twice credits once (the second call sees status "selesai"
 * before anything else happens). For user_cancel refunds this also cancels the order using the policy formula.
 */
export function approveRefund(db: AdminDb, refundId: string, adminId: string, now = new Date(), opts: ApproveOptions = {}): { refund: RefundRecord; duplicate: boolean } {
  return withTransaction(db, () => {
    const refund = db.refunds.find((r) => r.id === refundId);
    if (!refund) throw new ServiceError("Refund tidak ditemukan.", "no_refund");
    if (refund.status === "ditolak") throw new ServiceError("Refund ini sudah ditolak.", "already_rejected");
    if (refund.status === "selesai") return { refund, duplicate: true };
    if (refund.reason === "user_cancel") applyUserCancel(db, refund, opts, now);
    return settle(db, refund, adminId, now);
  });
}

export function rejectRefund(db: AdminDb, refundId: string, adminId: string, reason: string, now = new Date()): RefundRecord {
  return withTransaction(db, () => {
    const refund = db.refunds.find((r) => r.id === refundId);
    if (!refund) throw new ServiceError("Refund tidak ditemukan.", "no_refund");
    if (refund.status !== "menunggu") throw new ServiceError("Refund ini sudah diproses.", "already_processed");
    if (reason.trim().length < 3) throw new ServiceError("Alasan penolakan wajib diisi.", "reason_required");
    refund.status = "ditolak";
    refund.processedBy = adminId;
    refund.rejectReason = reason.trim();
    refund.processedAt = now.toISOString();
    const request = db.cancelRequests.find((c) => c.id === refund.cancelRequestId);
    if (request) {
      request.status = "ditolak";
      request.rejectReason = refund.rejectReason;
    }
    notifyUser(db, refund.userId, { type: "refund", title: refund.reason === "user_cancel" ? "Pembatalan ditolak" : "Permintaan refund ditolak", body: `Pesanan #${refund.orderId}: ${refund.rejectReason}`, href: "/dashboard/refunds", dedupeKey: `refund-rejected:${refund.id}` }, now);
    return refund;
  });
}

/** Orders in a refundable final status whose refunded amount differs from the calculated refund. */
export function refundMismatches(db: AdminDb): { orderId: string; expected: number; actual: number }[] {
  const out: { orderId: string; expected: number; actual: number }[] = [];
  for (const o of db.orders) {
    if (!refundReasonFor(o.status) || o.needsManualCheck) continue;
    let expected = computeExpectedRefund(o);
    // An amount an admin set on purpose (password + reason) is not a mismatch.
    if (db.refunds.some((r) => r.orderId === o.id && r.reason === "user_cancel" && r.status === "selesai" && r.overridden)) expected = o.refundedAmount;
    if (o.refundedAmount !== expected) out.push({ orderId: o.id, expected, actual: o.refundedAmount });
  }
  return out;
}
