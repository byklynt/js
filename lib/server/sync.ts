import "server-only";
import type { OrderStatus } from "@/lib/orders-data";
import { callFn } from "./repo/rpc";
import { logSystem, notifyAdmins, notifyOrderStatus, notifyUser } from "./repo/notify";
import { loadSettings } from "./repo/settings";
import { MAX_STATUS_BATCH } from "./providers/types";
import type { ProviderClient } from "./provider-client";
import { ACTIVE_STATUSES, completionCountsForEstimate, isActiveStatus, mapProviderStatus } from "./rules";
import { supabaseAdmin } from "./supabase-admin";
import { ServiceError } from "./tx";

export const FAILURE_ALERT_THRESHOLD = 3;
/** Orders checked per provider per tick (the cron runs every 2 minutes; the rest is picked up by the next ticks). */
export const MAX_ORDERS_PER_TICK = 1000;

export type SyncRun = { providerId: string; startedAt: string; finishedAt: string; ordersChecked: number; ordersChanged: number; errors: number; errorMessage: string | null };
export type SyncSummary = { runs: SyncRun[]; refundsCreated: number; requestsUpdated: number; stoppedEarly: boolean };
export type SyncOptions = { /** Epoch ms after which the run stops starting new batches (the next tick continues). */ deadlineAt?: number };

type ActiveOrder = { id: number; user_id: string; provider_order_id: string; status: string; start_count: number; remains: number; cancelled_by: string | null; needs_manual_check: boolean; provider_status: string | null; quantity: number; sync_error: string | null; last_synced_at: string | null; provider_accepted_at: string | null; created_at: string; status_manual: boolean };

/**
 * Apply one provider state to one order. Safe to run any number of times: the status update only fires while the order is
 * still active, and the refund is idempotent per (order, reason) inside Postgres (double sync = one refund).
 */
export async function applyState(order: ActiveOrder, state: { status: string; raw?: string; startCount: number; remains: number }, now: Date): Promise<{ changed: boolean; refunded: boolean }> {
  const db = supabaseAdmin();
  const next = mapProviderStatus(state.status);
  let changed = false;
  const raw = (state.raw ?? state.status).slice(0, 60);
  // last_synced_at, what the provider said (raw text) and a clean error slate: a successful read clears an earlier sync error
  const patch: Record<string, unknown> = { last_synced_at: now.toISOString(), provider_status: raw, sync_error: null };
  if (state.startCount !== Number(order.start_count)) { patch.start_count = state.startCount; changed = true; }
  if (state.remains !== Number(order.remains)) { patch.remains = Math.max(0, state.remains); changed = true; }
  let status = order.status as OrderStatus;
  let transitioned = false;
  // Impossible numbers (remains below 0 or above the ordered quantity) are rejected as a whole: no status change, no refund, a trace.
  if (!Number.isFinite(state.remains) || state.remains < 0 || state.remains > Number(order.quantity)) {
    const msg = `Sisa pesanan dari provider tidak valid: ${state.remains} (jumlah pesanan ${order.quantity}). Pembaruan ditolak.`;
    await db.from("orders").update({ last_synced_at: now.toISOString(), provider_status: raw, sync_error: msg } as never).eq("id", order.id).in("status", ACTIVE_STATUSES);
    if (order.sync_error !== msg) await logSystem("sync.invalid_remains", "order", String(order.id), null, { remains: state.remains, quantity: order.quantity, status: raw });
    return { changed: false, refunded: false };
  }
  if (!next) {
    // Unknown status text: keep the old status and leave a trace.
    // An unknown status text is never silently ignored: the order keeps its status, the text is stored on the order and logged ONCE (not every tick).
    patch.sync_error = `Status provider tidak dikenal: "${raw}"`;
    if (raw.trim() && order.provider_status !== raw) await logSystem("sync.unknown_status", "order", String(order.id), null, { status: raw });
  } else if (next !== status && isActiveStatus(status)) {
    patch.status = next;
    if (next === "dibatalkan") patch.cancelled_by = "provider"; // provider-side cancel: the 100% automatic rule
    if (next === "selesai" || next === "sebagian" || next === "dibatalkan" || next === "gagal_kirim") patch.completed_at = now.toISOString();
    if (next === "selesai") {
      patch.remains = 0;
      // Set once, with the first transition into "selesai" (the update below only fires while the order is still active).
      patch.completion_counts = completionCountsForEstimate({ syncError: order.sync_error, statusManual: order.status_manual, lastSyncedAt: order.last_synced_at, providerAcceptedAt: order.provider_accepted_at, createdAt: order.created_at }, now);
    }
    changed = true;
  }
  // Guarded update: if a parallel run already moved the order out of the active statuses, this one changes nothing.
  const { data: updated, error } = await db.from("orders").update(patch as never).eq("id", order.id).in("status", ACTIVE_STATUSES).select("status");
  if (error) throw new Error(`orders: ${error.message}`);
  if (patch.status && updated?.length) { status = patch.status as OrderStatus; transitioned = true; }
  if (transitioned) await notifyOrderStatus({ id: order.id, userId: order.user_id, status });

  let refunded = false;
  // Refund by the FINAL status, not by "status just changed": a run that crashed half way is repaired by the next one.
  const { data: cur } = await db.from("orders").select("status,cancelled_by,needs_manual_check").eq("id", order.id).single();
  // An order an admin cancelled for a violation is never refunded by the sync (the SQL function refuses too).
  if (cur && cur.cancelled_by !== "admin" && (cur.status === "dibatalkan" || cur.status === "sebagian" || (cur.status === "gagal_kirim" && !cur.needs_manual_check))) {
    const reason = cur.status as "dibatalkan" | "sebagian" | "gagal_kirim";
    const res = (await callFn("create_refund_for_order", { p_order: order.id, p_reason: reason }))[0];
    refunded = Boolean(res?.created);
    if (refunded) await logSystem("sync.refund", "order", String(order.id), null, { amount: res?.amount });
  }
  return { changed, refunded };
}

const REFILL_RANK = { menunggu: 0, berjalan: 1, selesai: 2, ditolak: 2 } as const;

/**
 * Moves cancel / refill requests forward based on what the provider and the order now say.
 * - A pending USER cancel is decided by an admin, but if the order already ended another way the request is moot (provider cancel -> the
 *   normal order sync already created the 100% refund through create_refund_for_order, which is idempotent).
 * - Refill requests that were sent to the provider are read back (refill_status): the user is notified on every real change.
 * - Cancellations an admin forwarded to the provider (cancel_requests.provider_state = 'diminta') are read back: confirmed or refused.
 */
export async function updateRequests(client: ProviderClient, now: Date): Promise<number> {
  const db = supabaseAdmin();
  let updated = 0;
  const { data: open } = await db.from("cancel_requests").select("id,user_id,order_id,orders!inner(status,cancelled_by)").in("status", ["menunggu", "berjalan"]);
  for (const c of (open ?? []) as unknown as { id: string; user_id: string; order_id: number; orders: { status: string; cancelled_by: string | null } }[]) {
    const o = c.orders;
    if (o.cancelled_by === "user") continue; // a USER-approved cancel is closed by approve_refund
    const waiting = async (reason: string) => {
      await db.from("refunds").update({ status: "ditolak", reject_reason: reason, processed_at: now.toISOString() }).eq("cancel_request_id", c.id).eq("status", "menunggu");
    };
    if (o.status === "dibatalkan") {
      await db.from("cancel_requests").update({ status: "selesai" }).eq("id", c.id);
      await waiting("Pesanan sudah dibatalkan oleh provider; refund penuh diberikan otomatis.");
      updated++;
    } else if (!isActiveStatus(o.status as OrderStatus)) {
      const reason = "Pesanan sudah selesai sebelum pembatalan diproses.";
      await waiting(reason);
      await db.from("cancel_requests").update({ status: "ditolak", reject_reason: reason }).eq("id", c.id);
      await notifyUser(c.user_id, { type: "pesanan", title: `Pembatalan #${c.order_id} ditolak`, body: reason, href: `/dashboard/orders?search=${c.order_id}`, dedupeKey: `cancel-rejected:${c.id}` });
      updated++;
    }
  }

  // Refill requests: read the provider's status back.
  if (client.getRefillStatuses) {
    const { data: refills } = await db.from("refill_requests").select("id,user_id,order_id,status,provider_request_id").in("status", ["menunggu", "berjalan"]).not("provider_request_id", "is", null).order("created_at").limit(200);
    const ids = [...new Set((refills ?? []).map((r) => r.provider_request_id as string))];
    if (ids.length) {
      let results: Awaited<ReturnType<NonNullable<ProviderClient["getRefillStatuses"]>>> = {};
      try {
        results = await client.getRefillStatuses("", ids);
      } catch (e) {
        await logSystem("sync.refill_status_failed", "refill", "-", null, { error: e instanceof Error ? e.message.slice(0, 120) : "error" });
      }
      for (const r of refills ?? []) {
        const item = results[r.provider_request_id as string];
        if (!item || !item.ok || !item.state) continue;
        const current = r.status as keyof typeof REFILL_RANK;
        if (item.state === current || REFILL_RANK[item.state] <= REFILL_RANK[current]) continue; // only forward, never back
        const { data: changed } = await db.from("refill_requests").update({ status: item.state, ...(item.state === "ditolak" ? { reject_reason: "Ditolak oleh provider." } : {}) }).eq("id", r.id).eq("status", current).select("id");
        if (!changed?.length) continue; // a parallel run (or an admin) already moved it
        updated++;
        await notifyUser(r.user_id, {
          type: "pesanan", title: `Refill pesanan #${r.order_id} ${item.state === "selesai" ? "selesai" : item.state === "ditolak" ? "ditolak" : "diproses"}`,
          body: item.state === "ditolak" ? "Permintaan refill ditolak provider. Buka tiket bila ada pertanyaan." : "Lihat statusnya di halaman Refill.",
          href: "/dashboard/refill", dedupeKey: `refill:${r.id}:${item.state}`,
        });
      }
    }
  }

  // Cancellations forwarded to the provider: confirmed or refused.
  if (client.getCancelStatuses) {
    const { data: sent } = await db.from("cancel_requests").select("id,user_id,order_id,orders!inner(provider_order_id,status,cancelled_by)").eq("provider_state", "diminta").limit(200);
    type Sent = { id: string; user_id: string; order_id: number; orders: { provider_order_id: string; status: string; cancelled_by: string | null } };
    const rows = ((sent ?? []) as unknown as Sent[]).filter((x) => x.orders.provider_order_id);
    if (rows.length) {
      let results: Awaited<ReturnType<NonNullable<ProviderClient["getCancelStatuses"]>>> = {};
      try {
        results = await client.getCancelStatuses("", [...new Set(rows.map((x) => x.orders.provider_order_id))]);
      } catch (e) {
        await logSystem("sync.cancel_status_failed", "order", "-", null, { error: e instanceof Error ? e.message.slice(0, 120) : "error" });
      }
      for (const c of rows) {
        const item = results[c.orders.provider_order_id];
        if (!item || !item.ok || item.state === "pending") continue;
        const next = item.state === "confirmed" ? "dikonfirmasi" : "ditolak";
        const { data: changed } = await db.from("cancel_requests").update({ provider_state: next }).eq("id", c.id).eq("provider_state", "diminta").select("id");
        if (!changed?.length) continue;
        updated++;
        if (next === "dikonfirmasi") {
          // Confirmed by the provider. An order cancelled provider-side gets its 100% refund through the same idempotent function the
          // order sync uses; one the admin already cancelled (user cancel) was refunded by the policy and is left alone.
          if (c.orders.cancelled_by !== "user" && c.orders.status === "dibatalkan") await callFn("create_refund_for_order", { p_order: c.order_id, p_reason: "dibatalkan" });
          await notifyUser(c.user_id, { type: "pesanan", title: `Pembatalan #${c.order_id} dikonfirmasi provider`, body: "Provider sudah membatalkan pesananmu.", href: `/dashboard/orders?search=${c.order_id}`, dedupeKey: `cancel-confirmed:${c.id}` });
        } else {
          await notifyAdmins({ type: "pesanan", title: `Provider menolak pembatalan #${c.order_id}`, body: "Pesanan sudah selesai di provider. Saldo user sudah dikembalikan sesuai kebijakan; periksa selisih biaya.", href: "/admin/orders", dedupeKey: `cancel-provider-rejected:${c.id}` });
        }
      }
    }
  }
  return updated;
}

/** After 3 failing runs in a row for one provider: raise one alert (until it recovers). */
async function maybeAlert(providerId: string, name: string, now: Date) {
  const db = supabaseAdmin();
  const { data: last } = await db.from("provider_sync_runs").select("started_at,errors").eq("provider_id", providerId).order("started_at", { ascending: false }).limit(FAILURE_ALERT_THRESHOLD);
  if (!last || last.length < FAILURE_ALERT_THRESHOLD || !last.every((r) => r.errors > 0)) return;
  const message = `${name} gagal sinkron ${FAILURE_ALERT_THRESHOLD} kali berturut-turut.`;
  const since = last[last.length - 1].started_at;
  const { data: dup } = await db.from("admin_alerts").select("id").eq("provider_id", providerId).eq("message", message).gte("created_at", since).limit(1);
  if (dup?.length) return;
  await db.from("admin_alerts").insert({ provider_id: providerId, kind: "provider_sync_failing", message });
  await logSystem("sync.provider_alert", "provider", providerId, null, { message });
  await notifyAdmins({ type: "sistem", title: `${name} gagal sinkron`, body: message, href: "/admin/providers", dedupeKey: `syncfail:${providerId}:${now.toISOString().slice(0, 10)}` });
}

/** Optional: switch off the services of a provider whose balance dropped below the configured minimum. */
export async function applyLowBalancePolicy(): Promise<number> {
  const ops = (await loadSettings()).operations;
  if (!ops.autoDisableLowBalance) return 0;
  const db = supabaseAdmin();
  const { data: providers } = await db.from("providers").select("id,balance_idr").not("balance_idr", "is", null);
  let disabled = 0;
  for (const p of providers ?? []) {
    if (Number(p.balance_idr) >= ops.lowBalanceThreshold) continue;
    const { data } = await db.from("services").update({ active: false }).eq("provider_id", p.id).eq("active", true).select("id");
    disabled += data?.length ?? 0;
    if (data?.length) await logSystem("provider.auto_disable", "provider", p.id, null, { services: data.length });
  }
  return disabled;
}

/** Keeps the last sync error on the order rows (shown in the admin; cleared by the next successful read). */
async function noteError(ids: number[], message: string) {
  if (!ids.length) return;
  await supabaseAdmin().from("orders").update({ sync_error: message.slice(0, 300) }).in("id", ids);
}

export type SyncOneResult = { providerOrderId: string; providerStatus: string; mapped: OrderStatus | null; before: string; after: string; changed: boolean; refunded: boolean };

/**
 * "Sinkronkan sekarang": reads the provider's status for ONE order and applies it with the same idempotent rules as the cron tick.
 * Works for any order that reached the provider; finished orders are only re-read (their status cannot move backwards).
 */
export async function syncOrderNow(client: ProviderClient, orderId: number, now = new Date()): Promise<SyncOneResult> {
  const db = supabaseAdmin();
  const { data: o } = await db.from("orders").select("id,user_id,provider_id,provider_order_id,status,start_count,remains,cancelled_by,needs_manual_check,provider_status,quantity,sync_error,last_synced_at,provider_accepted_at,created_at,status_manual").eq("id", orderId).maybeSingle();
  if (!o) throw new ServiceError("Pesanan tidak ditemukan.", "no_order");
  if (!o.provider_order_id) throw new ServiceError("Pesanan ini belum punya ID pesanan provider (belum pernah diterima provider).", "no_provider_order");
  let state: Awaited<ReturnType<ProviderClient["getOrderStatus"]>>;
  try {
    state = await client.getOrderStatus(o.provider_id, o.provider_order_id);
  } catch (e) {
    await noteError([o.id], e instanceof Error ? e.message : "error");
    throw e;
  }
  const mapped = mapProviderStatus(state.status);
  const res = await applyState(o as ActiveOrder, state, now);
  const { data: after } = await db.from("orders").select("status").eq("id", orderId).single();
  return { providerOrderId: o.provider_order_id, providerStatus: state.raw ?? state.status, mapped, before: o.status, after: after?.status ?? o.status, changed: res.changed, refunded: res.refunded };
}

/** One cron tick (every 2 minutes, see docs/supabase-setup.md). */
export async function syncOrders(client: ProviderClient, now = new Date(), opts: SyncOptions = {}): Promise<SyncSummary> {
  const outOfTime = () => opts.deadlineAt !== undefined && Date.now() > opts.deadlineAt;
  let stoppedEarly = false;
  const db = supabaseAdmin();
  const runs: SyncRun[] = [];
  let refundsCreated = 0;
  const { data: providers } = await db.from("providers").select("id,name").eq("active", true);

  for (const provider of providers ?? []) {
    if (outOfTime()) { stoppedEarly = true; break; }
    const { data: orders } = await db.from("orders")
      .select("id,user_id,provider_order_id,status,start_count,remains,cancelled_by,needs_manual_check,provider_status,quantity,sync_error,last_synced_at,provider_accepted_at,created_at,status_manual")
      // least recently synced first (never-synced first): an old stuck order cannot starve new ones when the batch limit is reached
      .eq("provider_id", provider.id).neq("provider_order_id", "").in("status", ACTIVE_STATUSES).order("last_synced_at", { ascending: true, nullsFirst: true }).order("id").limit(MAX_ORDERS_PER_TICK);
    const list = (orders ?? []) as ActiveOrder[];
    const run: SyncRun = { providerId: provider.id, startedAt: now.toISOString(), finishedAt: now.toISOString(), ordersChecked: 0, ordersChanged: 0, errors: 0, errorMessage: null };

    const apply = async (order: ActiveOrder, state: { status: string; startCount: number; remains: number }) => {
      try {
        const r = await applyState(order, state, now);
        if (r.changed) run.ordersChanged++;
        if (r.refunded) refundsCreated++;
      } catch (e) {
        run.errors++;
        run.errorMessage = e instanceof Error ? e.message : "error";
        await noteError([order.id], run.errorMessage);
      }
    };

    if (client.getOrdersStatus) {
      // Up to 100 provider order ids per call.
      for (let i = 0; i < list.length; i += MAX_STATUS_BATCH) {
        if (outOfTime()) { stoppedEarly = true; break; }
        const chunk = list.slice(i, i + MAX_STATUS_BATCH);
        run.ordersChecked += chunk.length;
        let results: Awaited<ReturnType<NonNullable<typeof client.getOrdersStatus>>>;
        try {
          results = await client.getOrdersStatus(provider.id, chunk.map((o) => o.provider_order_id));
        } catch (e) {
          run.errors++;
          run.errorMessage = e instanceof Error ? e.message : "error";
          await noteError(chunk.map((o) => o.id), run.errorMessage);
          continue;
        }
        for (const order of chunk) {
          const state = results[order.provider_order_id];
          if (!state || state instanceof Error) {
            run.errors++;
            run.errorMessage = state instanceof Error ? state.message : "Status tidak ada di jawaban provider.";
            await noteError([order.id], run.errorMessage);
            continue;
          }
          await apply(order, state);
        }
      }
    } else {
      for (const order of list) {
        run.ordersChecked++;
        try {
          await apply(order, await client.getOrderStatus(provider.id, order.provider_order_id));
        } catch (e) {
          run.errors++;
          run.errorMessage = e instanceof Error ? e.message : "error";
          // If the provider is down every remaining call would fail too; stop this provider early.
          if (run.errors >= 3 && run.ordersChanged === 0) break;
        }
      }
    }
    run.finishedAt = new Date().toISOString();
    if (list.length) await db.from("providers").update({ last_sync_at: now.toISOString() }).eq("id", provider.id);
    await db.from("provider_sync_runs").insert({
      provider_id: provider.id, started_at: run.startedAt, finished_at: run.finishedAt, orders_checked: run.ordersChecked,
      orders_changed: run.ordersChanged, errors: run.errors, error_message: run.errorMessage,
    });
    runs.push(run);
    await maybeAlert(provider.id, provider.name, now);
  }
  const requestsUpdated = outOfTime() ? 0 : await updateRequests(client, now);
  if (!outOfTime()) await applyLowBalancePolicy();
  return { runs, refundsCreated, requestsUpdated, stoppedEarly: stoppedEarly || outOfTime() };
}
