import "server-only";
import { callFn } from "./repo/rpc";
import { logSystem } from "./repo/notify";
import { getOrder } from "./repo/orders";
import type { ProviderClient } from "./provider-client";
import { refillEligibility } from "./rules";
import { ServiceError } from "./tx";
import { supabaseAdmin } from "./supabase-admin";

/**
 * A USER-requested ("forced") cancellation. Allowed only once the order is old enough (policy.minAgeHours) and NOT automatic:
 * request_cancel (one Postgres transaction) creates a cancel request plus a waiting refund (reason user_cancel) for the admin
 * queue, with the numbers needed to decide. Approving applies the policy formula (approve_refund).
 * This is separate from provider-side cancellations and gagal_kirim, which always refund 100% automatically.
 */
export async function requestCancel(userId: string, orderId: string): Promise<{ requestId: string; calculatedRefund: number }> {
  const [row] = await callFn("request_cancel", { p_user: userId, p_order: Number(orderId) });
  return { requestId: row.request_id, calculatedRefund: Number(row.calculated_refund) };
}

/** User asks for a refill. Window, status and 24h rules live in rules.refillEligibility; one open request per order is a DB constraint. */
export async function requestRefill(client: ProviderClient, userId: string, orderId: string, now = new Date()): Promise<{ id: string }> {
  const order = await getOrder(orderId);
  if (!order || order.userId !== userId) throw new ServiceError("Pesanan tidak ditemukan.", "no_order");
  const db = supabaseAdmin();
  const { data: svc } = await db.from("services").select("refill,cancel,refill_days").eq("id", order.serviceId).maybeSingle();
  const { data: mine } = await db.from("refill_requests").select("status,created_at").eq("order_id", Number(orderId));
  const check = refillEligibility(
    order,
    svc ? { refill: svc.refill, cancel: svc.cancel, refillDays: svc.refill_days } : undefined,
    (mine ?? []).map((r) => ({ status: r.status as "menunggu" | "berjalan" | "selesai" | "ditolak", createdAt: r.created_at })),
    now
  );
  if (!check.allowed) throw new ServiceError(check.reason ?? "Tidak bisa refill.", "not_eligible");

  // Record the request FIRST (the unique "one open refill per order" index stops a double click), then call the provider.
  const { data: row, error } = await db.from("refill_requests").insert({ order_id: Number(orderId), user_id: userId, status: "menunggu" }).select("id").single();
  if (error) {
    if (error.code === "23505") throw new ServiceError("Refill sebelumnya masih diproses.", "not_eligible");
    throw new Error(`refill_requests: ${error.message}`);
  }
  try {
    const res = await client.refillOrder(order.providerId, order.providerOrderId);
    await db.from("refill_requests").update({ provider_request_id: res.requestId }).eq("id", row.id);
  } catch (e) {
    await db.from("refill_requests").update({ status: "ditolak", reject_reason: "Provider tidak menerima permintaan refill." }).eq("id", row.id);
    throw e;
  }
  await logSystem("order.refill_request", "order", orderId, null, { requestId: row.id });
  return { id: row.id };
}
