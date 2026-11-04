import type { AdminDb } from "@/lib/admin-data";
import { logSystem } from "./notifications";
import type { ProviderClient } from "./provider-client";
import { cancelEligibility, computeUserCancelRefund, refillEligibility } from "./rules";
import { ServiceError } from "./tx";
import type { CancelRequestRecord, RefillRequestRecord } from "./types";

function load(db: AdminDb, userId: string, orderId: string) {
  const order = db.orders.find((o) => o.id === orderId && o.userId === userId);
  if (!order) throw new ServiceError("Pesanan tidak ditemukan.", "no_order");
  return { order, service: db.services.find((s) => s.id === order.serviceId) };
}

/**
 * A USER-requested ("forced") cancellation. It is allowed only once the order is old enough (policy.minAgeHours) and
 * it is NOT automatic: it creates a cancel request plus a waiting refund row (reason "user_cancel") for the admin queue,
 * with the numbers needed to decide. Approving applies the policy formula (see refunds.approveRefund).
 * This is separate from provider-side cancellations and gagal_kirim, which always refund 100% automatically.
 */
export function requestCancel(db: AdminDb, userId: string, orderId: string, now = new Date()): CancelRequestRecord {
  const { order, service } = load(db, userId, orderId);
  const policy = db.settings.cancelPolicy;
  const mine = db.cancelRequests.filter((r) => r.orderId === order.id);
  const check = cancelEligibility(order, service, mine, now, policy);
  if (!check.allowed) throw new ServiceError(check.reason ?? "Tidak bisa dibatalkan.", "not_eligible");

  const calculatedRefund = computeUserCancelRefund(order, policy.refundPercent);
  const ageHours = Math.floor((now.getTime() - new Date(order.createdAt).getTime()) / 3_600_000);
  const id = `cx_${now.getTime().toString(36)}_${db.cancelRequests.length}`;
  const record: CancelRequestRecord = {
    id, orderId: order.id, userId, status: "menunggu", providerRequestId: null, rejectReason: null, createdAt: now.toISOString(),
    ageHours, remainsAtRequest: order.remains, calculatedRefund, policyPercent: policy.refundPercent,
  };
  db.cancelRequests.unshift(record);
  db.refunds.unshift({
    id: `rf_${now.getTime().toString(36)}_${db.refunds.length}`, orderId: order.id, userId, username: order.username, amount: calculatedRefund,
    reason: "user_cancel", source: "user_request", status: "menunggu", processedBy: null, rejectReason: null,
    note: `Pembatalan oleh pengguna: usia ${ageHours} jam, sisa ${order.remains.toLocaleString("id-ID")} dari ${order.quantity.toLocaleString("id-ID")}.`,
    createdAt: now.toISOString(), processedAt: null, reversed: false, policyPercent: policy.refundPercent, cancelRequestId: id,
  });
  logSystem(db, "order.cancel_request", "order", order.id, null, { requestId: id, calculatedRefund, policyPercent: policy.refundPercent }, now);
  return record;
}

/** User asks for a refill. Window, status and 24h rules live in rules.refillEligibility. */
export async function requestRefill(db: AdminDb, client: ProviderClient, userId: string, orderId: string, now = new Date()): Promise<RefillRequestRecord> {
  const { order, service } = load(db, userId, orderId);
  const mine = db.refillRequests.filter((r) => r.orderId === order.id);
  const check = refillEligibility(order, service, mine, now);
  if (!check.allowed) throw new ServiceError(check.reason ?? "Tidak bisa refill.", "not_eligible");
  const res = await client.refillOrder(order.providerId, order.providerOrderId);
  const record: RefillRequestRecord = { id: `rq_${now.getTime().toString(36)}_${db.refillRequests.length}`, orderId: order.id, userId, status: "menunggu", providerRequestId: res.requestId, rejectReason: null, createdAt: now.toISOString() };
  db.refillRequests.unshift(record);
  logSystem(db, "order.refill_request", "order", order.id, null, { requestId: record.id }, now);
  return record;
}
