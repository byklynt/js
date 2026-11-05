import "server-only";
import type { OrderStatus } from "@/lib/orders-data";
import { callFn } from "./repo/rpc";
import { logSystem, notifyAdmins, notifyOrderStatus, notifyUser } from "./repo/notify";
import { loadSettings } from "./repo/settings";
import { MAX_STATUS_BATCH } from "./providers/types";
import { providerMode } from "./providers/config";
import type { ProviderClient } from "./provider-client";
import { ACTIVE_STATUSES, isActiveStatus, mapProviderStatus } from "./rules";
import { supabaseAdmin } from "./supabase-admin";

export const FAILURE_ALERT_THRESHOLD = 3;
/** Orders checked per provider per tick (the cron runs every 2 minutes; the rest is picked up by the next ticks). */
export const MAX_ORDERS_PER_TICK = 1000;

export type SyncRun = { providerId: string; startedAt: string; finishedAt: string; ordersChecked: number; ordersChanged: number; errors: number; errorMessage: string | null };
export type SyncSummary = { runs: SyncRun[]; refundsCreated: number };

type ActiveOrder = { id: number; user_id: string; provider_order_id: string; status: string; start_count: number; remains: number; cancelled_by: string | null; needs_manual_check: boolean };

/**
 * Apply one provider state to one order. Safe to run any number of times: the status update only fires while the order is
 * still active, and the refund is idempotent per (order, reason) inside Postgres (double sync = one refund).
 */
async function applyState(order: ActiveOrder, state: { status: string; startCount: number; remains: number }, now: Date): Promise<{ changed: boolean; refunded: boolean }> {
  const db = supabaseAdmin();
  const next = mapProviderStatus(state.status);
  let changed = false;
  const patch: Record<string, unknown> = { last_synced_at: now.toISOString() };
  if (state.startCount !== Number(order.start_count)) { patch.start_count = state.startCount; changed = true; }
  if (state.remains !== Number(order.remains)) { patch.remains = Math.max(0, state.remains); changed = true; }
  let status = order.status as OrderStatus;
  let transitioned = false;
  if (!next) {
    // Unknown status text: keep the old status and leave a trace.
    if (state.status.trim()) await logSystem("sync.unknown_status", "order", String(order.id), null, { status: state.status.slice(0, 40) });
  } else if (next !== status && isActiveStatus(status)) {
    patch.status = next;
    if (next === "dibatalkan") patch.cancelled_by = "provider"; // provider-side cancel: the 100% automatic rule
    if (next === "selesai" || next === "sebagian" || next === "dibatalkan" || next === "gagal_kirim") patch.completed_at = now.toISOString();
    if (next === "selesai") patch.remains = 0;
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
  if (cur && (cur.status === "dibatalkan" || cur.status === "sebagian" || (cur.status === "gagal_kirim" && !cur.needs_manual_check))) {
    const reason = cur.status as "dibatalkan" | "sebagian" | "gagal_kirim";
    const res = (await callFn("create_refund_for_order", { p_order: order.id, p_reason: reason }))[0];
    refunded = Boolean(res?.created);
    if (refunded) await logSystem("sync.refund", "order", String(order.id), null, { amount: res?.amount });
  }
  return { changed, refunded };
}

/** Moves cancel / refill requests forward based on what the provider and the order now say. */
async function updateRequests(now: Date) {
  const db = supabaseAdmin();
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
    } else if (!isActiveStatus(o.status as OrderStatus)) {
      const reason = "Pesanan sudah selesai sebelum pembatalan diproses.";
      await waiting(reason);
      await db.from("cancel_requests").update({ status: "ditolak", reject_reason: reason }).eq("id", c.id);
      await notifyUser(c.user_id, { type: "pesanan", title: `Pembatalan #${c.order_id} ditolak`, body: reason, href: `/dashboard/orders?search=${c.order_id}`, dedupeKey: `cancel-rejected:${c.id}` });
    }
  }
  // The provider's refill status is not read back yet. Only the mock moves requests along by itself; with a real provider
  // an admin sets "berjalan" / "selesai" / "ditolak" on /admin/refills.
  if (providerMode() === "mock") {
    await db.from("refill_requests").update({ status: "berjalan" }).eq("status", "menunggu");
  }
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

/** One cron tick (every 2 minutes, see docs/supabase-setup.md). */
export async function syncOrders(client: ProviderClient, now = new Date()): Promise<SyncSummary> {
  const db = supabaseAdmin();
  const runs: SyncRun[] = [];
  let refundsCreated = 0;
  const { data: providers } = await db.from("providers").select("id,name").eq("active", true);

  for (const provider of providers ?? []) {
    const { data: orders } = await db.from("orders")
      .select("id,user_id,provider_order_id,status,start_count,remains,cancelled_by,needs_manual_check")
      .eq("provider_id", provider.id).neq("provider_order_id", "").in("status", ACTIVE_STATUSES).order("id").limit(MAX_ORDERS_PER_TICK);
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
      }
    };

    if (client.getOrdersStatus) {
      // Up to 100 provider order ids per call.
      for (let i = 0; i < list.length; i += MAX_STATUS_BATCH) {
        const chunk = list.slice(i, i + MAX_STATUS_BATCH);
        run.ordersChecked += chunk.length;
        let results: Awaited<ReturnType<NonNullable<typeof client.getOrdersStatus>>>;
        try {
          results = await client.getOrdersStatus(provider.id, chunk.map((o) => o.provider_order_id));
        } catch (e) {
          run.errors++;
          run.errorMessage = e instanceof Error ? e.message : "error";
          continue;
        }
        for (const order of chunk) {
          const state = results[order.provider_order_id];
          if (!state || state instanceof Error) {
            run.errors++;
            run.errorMessage = state instanceof Error ? state.message : "Status tidak ada di jawaban provider.";
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
  await updateRequests(now);
  await applyLowBalancePolicy();
  return { runs, refundsCreated };
}
