import "server-only";
import type { AdminOrder } from "@/lib/admin-data";
import { callFn } from "./repo/rpc";
import { logSystem, notifyAdmins, notifyOrderStatus, notifyUser } from "./repo/notify";
import { getOrder, getOrderService, updateOrder } from "./repo/orders";
import { ProviderError, type ProviderClient } from "./provider-client";
import { ServiceError } from "./tx";
import { supabaseAdmin } from "./supabase-admin";

export type PlaceOrderInput = {
  userId: string;
  serviceId: string;
  link: string;
  quantity: number;
  /** Optional: the rules version the form showed. A stale one is refused (the user re-reads the rules). */
  acceptedRulesVersion?: string;
};
export type OrderDeps = {
  client: ProviderClient;
  /** Injected so tests do not really wait. */
  sleep?: (ms: number) => Promise<void>;
};

export const MAX_SUBMIT_ATTEMPTS = 3;
/** Below this balance the user gets a "saldo hampir habis" notification (done inside place_order). */
export const LOW_BALANCE = 10_000;
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Same link written differently (case, trailing slash, #fragment) counts as the same target (also enforced in SQL). */
export const normalizeLink = (link: string) => link.trim().toLowerCase().replace(/#.*$/, "").replace(/\/+$/, "");

/**
 * 1) ONE Postgres transaction (place_order): validate, rate limit, debit the ledger and create the order as "menunggu";
 * 2) AFTER commit: submit to the provider with up to 3 attempts and exponential backoff;
 * 3) if every attempt fails: status gagal_kirim and an automatic full refund.
 */
export async function placeOrder(input: PlaceOrderInput, deps: OrderDeps): Promise<AdminOrder> {
  const rows = await callFn("place_order", {
    p_user: input.userId, p_service: input.serviceId, p_link: input.link, p_quantity: input.quantity,
    ...(input.acceptedRulesVersion ? { p_accepted_rules_version: input.acceptedRulesVersion } : {}),
  });
  const placed = rows[0];
  if (!placed) throw new Error("place_order returned nothing");
  if (!placed.held) await submitToProvider(placed.order_id, deps);
  return (await getOrder(placed.order_id))!;
}

/** Admin releases an order that was held for review. */
export async function approveHeldOrder(orderId: string, deps: OrderDeps): Promise<AdminOrder> {
  const order = await getOrder(orderId);
  if (!order) throw new ServiceError("Pesanan tidak ditemukan.", "no_order");
  if (!order.held) throw new ServiceError("Pesanan ini tidak sedang ditahan.", "not_held");
  await updateOrder(orderId, { held: false });
  await submitToProvider(orderId, deps);
  return (await getOrder(orderId))!;
}

/** Maps to the provider's "add order" call; the service's provider_service_id is the provider-side id. */
export async function submitToProvider(orderId: string | number, deps: OrderDeps): Promise<boolean> {
  const sleep = deps.sleep ?? defaultSleep;
  const order = await getOrder(orderId);
  if (!order) throw new ServiceError("Pesanan tidak ditemukan.", "no_order");
  const service = await getOrderService(order);
  let lastError = "";
  let ambiguous = false;

  for (let attempt = 1; attempt <= MAX_SUBMIT_ATTEMPTS; attempt++) {
    await updateOrder(order.id, { submit_attempts: attempt });
    try {
      const res = await deps.client.addOrder(order.providerId, { service: service?.provider_service_id ?? order.serviceId, link: order.link, quantity: order.quantity });
      await updateOrder(order.id, { provider_order_id: res.providerOrderId, submit_attempts: attempt });
      return true;
    } catch (e) {
      lastError = e instanceof Error ? e.message : "error";
      if (e instanceof ProviderError) {
        // A timeout / 5xx / unreadable answer: the provider may already have the order. Sending again could create a duplicate.
        if (e.ambiguous) { ambiguous = true; break; }
        // A missing key will not fix itself in half a second.
        if (e.kind === "config") break;
      }
      if (attempt < MAX_SUBMIT_ATTEMPTS) await sleep(500 * 2 ** (attempt - 1));
    }
  }

  if (ambiguous) {
    // gagal_kirim, but NOT refunded: an admin checks the provider first (resolveManualCheck).
    await updateOrder(order.id, { status: "gagal_kirim", needs_manual_check: true });
    await notifyUser(order.userId, { type: "pesanan", title: `Pesanan #${order.id} sedang kami periksa`, body: "Pengiriman ke provider belum bisa dipastikan. Tim kami memeriksanya dan saldomu akan dikembalikan bila pesanan tidak masuk.", href: `/dashboard/orders?search=${order.id}`, dedupeKey: `order:${order.id}:check` });
    await notifyAdmins({ type: "pesanan", title: `Pesanan #${order.id} perlu dicek manual`, body: "Pengiriman ke provider tidak jelas hasilnya (timeout/5xx). Cek di panel provider sebelum kirim ulang atau refund.", href: "/admin/orders", dedupeKey: `order-check:${order.id}` });
    await logSystem("order.submit_ambiguous", "order", String(order.id), null, { error: lastError });
    return false;
  }

  await updateOrder(order.id, { status: "gagal_kirim", completed_at: new Date().toISOString() });
  await callFn("create_refund_for_order", { p_order: Number(order.id), p_reason: "gagal_kirim" });
  await notifyOrderStatus({ id: order.id, userId: order.userId, status: "gagal_kirim" }); // the refund notification follows from the refund itself
  await logSystem("order.submit_failed", "order", String(order.id), null, { attempts: MAX_SUBMIT_ATTEMPTS, error: lastError });
  return false;
}

/** Admin: send a gagal_kirim order again. The earlier refund is reversed and the user is charged again (one transaction). */
export async function resubmitFailedOrder(orderId: string, adminId: string, deps: OrderDeps): Promise<AdminOrder> {
  await callFn("resubmit_failed_order", { p_order: Number(orderId), p_admin: adminId });
  await submitToProvider(orderId, deps);
  return (await getOrder(orderId))!;
}

/**
 * An admin looked at the provider panel for an order whose submit ended in an unknown state:
 * - "refund": the provider has no such order -> full refund and the flag is cleared;
 * - "sent": the provider does have it -> store its order id and let the status sync take over.
 */
export async function resolveManualCheck(orderId: string, outcome: { kind: "refund" } | { kind: "sent"; providerOrderId: string }): Promise<AdminOrder> {
  const order = await getOrder(orderId);
  if (!order) throw new ServiceError("Pesanan tidak ditemukan.", "no_order");
  if (!order.needsManualCheck) throw new ServiceError("Pesanan ini tidak sedang menunggu pengecekan manual.", "not_pending_check");
  if (outcome.kind === "sent") {
    const id = outcome.providerOrderId.trim();
    if (!/^[A-Za-z0-9._-]{1,40}$/.test(id)) throw new ServiceError("ID pesanan provider tidak valid.", "bad_provider_order_id");
    await updateOrder(orderId, { provider_order_id: id, status: "menunggu", needs_manual_check: false });
  } else {
    await callFn("create_refund_for_order", { p_order: Number(orderId), p_reason: "gagal_kirim" });
    await updateOrder(orderId, { needs_manual_check: false, completed_at: new Date().toISOString() });
  }
  await logSystem("order.manual_check_resolved", "order", orderId, null, { outcome: outcome.kind });
  return (await getOrder(orderId))!;
}

/** Counts used by the admin dashboard. */
export async function countOrdersByStatus(): Promise<Record<string, number>> {
  const { data } = await supabaseAdmin().from("orders").select("status");
  const out: Record<string, number> = {};
  for (const r of data ?? []) out[r.status] = (out[r.status] ?? 0) + 1;
  return out;
}
