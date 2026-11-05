import "server-only";
import { callFn } from "./repo/rpc";
import { getOrder } from "./repo/orders";
import { refundReasonFor } from "./rules";
import { ServiceError } from "./tx";
import type { RefundSource } from "./types";

/** What can still be refunded for an order. Never more than the charge. */
export const refundableRemaining = (o: { charge: number; refundedAmount: number }) => Math.max(0, o.charge - o.refundedAmount);

/**
 * Automatic refund for an order that ended as dibatalkan / sebagian / gagal_kirim, computed and credited inside Postgres
 * (create_refund_for_order). Idempotent per (order, reason): running it twice (double sync) creates and credits exactly once.
 */
export async function autoRefundForOrder(orderId: string): Promise<{ refundId: string | null; amount: number; created: boolean }> {
  const order = await getOrder(orderId);
  if (!order) throw new ServiceError("Pesanan tidak ditemukan.", "no_order");
  const reason = refundReasonFor(order.status);
  if (!reason) return { refundId: null, amount: 0, created: false };
  const [row] = await callFn("create_refund_for_order", { p_order: Number(orderId), p_reason: reason });
  return { refundId: row?.refund_id ?? null, amount: Number(row?.amount ?? 0), created: Boolean(row?.created) };
}

/** Manual / user-requested refund waiting for an admin decision (or settled right away by an admin). */
export async function createManualRefund(input: { orderId: string; amount: number; note: string; source: Extract<RefundSource, "admin" | "user_request">; adminId?: string; settleNow?: boolean }) {
  const [row] = await callFn("create_refund_for_order", {
    p_order: Number(input.orderId), p_reason: "manual", p_amount: input.amount, p_source: input.source, p_by: input.adminId ?? "system",
    p_note: input.note, p_settle: Boolean(input.settleNow),
  });
  return row;
}

export type ApproveOptions = { overrideAmount?: number; overrideReason?: string };

/** Admin approves a waiting refund. Idempotent: approving twice credits once. For user_cancel refunds this also cancels the order (policy formula). */
export async function approveRefund(refundId: string, adminId: string, opts: ApproveOptions = {}) {
  const [row] = await callFn("approve_refund", {
    p_refund: refundId, p_admin: adminId,
    ...(opts.overrideAmount !== undefined ? { p_override_amount: opts.overrideAmount, p_override_reason: opts.overrideReason ?? "" } : {}),
  });
  return row;
}

export async function rejectRefund(refundId: string, adminId: string, reason: string) {
  return callFn("reject_refund", { p_refund: refundId, p_admin: adminId, p_reason: reason });
}
