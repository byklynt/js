import "server-only";
import type { AdminOrder } from "@/lib/admin-data";
import type { OrderStatus } from "@/lib/orders-data";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

/** Order columns + the few joined fields the UI needs (service name / platform / refill, username). Server only. */
export const ORDER_SELECT =
  "id,user_id,service_id,provider_id,provider_order_id,link,quantity,charge,provider_cost,start_count,remains,status,refunded_amount,submit_attempts,held,needs_manual_check,cancelled_by,cancel_policy_percent,accepted_rules_version,accepted_at,last_synced_at,completed_at,created_at,provider_status,sync_error,violation_reason,service:services(id,name,platform,provider_service_id,refill,cancel,refill_days),user:profiles(username),order_comments(line_count)";

type Row = {
  id: number; user_id: string; service_id: string; provider_id: string; provider_order_id: string; link: string; quantity: number; charge: number;
  provider_cost: number; start_count: number; remains: number; status: string; refunded_amount: number; submit_attempts: number; held: boolean;
  needs_manual_check: boolean; cancelled_by: string | null; cancel_policy_percent: number | null; accepted_rules_version: string | null;
  accepted_at: string | null; last_synced_at: string | null; completed_at: string | null; created_at: string; provider_status: string | null; sync_error: string | null; violation_reason: string | null;
  service: { id: string; name: string; platform: string; provider_service_id: string; refill: boolean; cancel: boolean; refill_days: number | null } | null;
  user: { username: string } | null;
  /** To-one embed (order_id is the primary key): an object, or null for orders without comments. */
  order_comments: { line_count: number } | null;
};

export function toAdminOrder(r: Row): AdminOrder {
  return {
    id: String(r.id), userId: r.user_id, username: r.user?.username ?? "", serviceId: r.service_id, platform: r.service?.platform ?? "",
    name: `${r.service_id} - ${r.service?.name ?? ""}`, link: r.link, charge: Number(r.charge), quantity: Number(r.quantity), startCount: Number(r.start_count),
    remains: Number(r.remains), status: r.status as OrderStatus, createdAt: r.created_at, providerId: r.provider_id, providerOrderId: r.provider_order_id,
    refillable: Boolean(r.service?.refill), providerCost: Number(r.provider_cost), refundedAmount: Number(r.refunded_amount), submitAttempts: r.submit_attempts,
    lastSyncedAt: r.last_synced_at, completedAt: r.completed_at, held: r.held, acceptedRulesVersion: r.accepted_rules_version, acceptedAt: r.accepted_at,
    providerStatus: r.provider_status, syncError: r.sync_error, violationReason: r.violation_reason,
    ...(r.order_comments ? { commentCount: Number(r.order_comments.line_count) } : {}),
    needsManualCheck: r.needs_manual_check || undefined, cancelledBy: r.cancelled_by as AdminOrder["cancelledBy"], cancelPolicyPercent: r.cancel_policy_percent,
  };
}

export async function getOrder(id: string | number): Promise<AdminOrder | null> {
  const { data } = await supabaseAdmin().from("orders").select(ORDER_SELECT).eq("id", Number(id)).maybeSingle();
  return data ? toAdminOrder(data as unknown as Row) : null;
}

/** The service data submitToProvider needs (provider-side id). */
export async function getOrderService(order: AdminOrder) {
  const { data } = await supabaseAdmin().from("services").select("id,provider_service_id,refill,cancel,refill_days,provider_type").eq("id", order.serviceId).maybeSingle();
  return data;
}

export async function updateOrder(id: string | number, patch: Record<string, unknown>): Promise<void> {
  const { error } = await supabaseAdmin().from("orders").update(patch as never).eq("id", Number(id));
  if (error) throw new Error(`orders: ${error.message}`);
}

/** Orders of one user, newest first. RLS is bypassed (service role): the user id MUST come from the session. */
export async function listUserOrders(userId: string, limit = 500): Promise<AdminOrder[]> {
  const { data, error } = await supabaseAdmin().from("orders").select(ORDER_SELECT).eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`orders: ${error.message}`);
  return (data as unknown as Row[]).map(toAdminOrder);
}
