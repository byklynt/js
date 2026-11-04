import type { AdminDb, AdminOrder } from "@/lib/admin-data";
import { logSystem, notifyAdmins, notifyOrderStatus, notifyUser } from "./notifications";
import { checkAlertThresholds, sendAlert } from "./notify";
import type { ProviderClient } from "./provider-client";
import { autoRefundForOrder, refundMismatches } from "./refunds";
import { isActiveStatus, isStuck, mapProviderStatus } from "./rules";
import type { ProviderSyncRun } from "./types";
import { MAX_STATUS_BATCH } from "./providers/types";
import { providerMode } from "./providers/config";

export const FAILURE_ALERT_THRESHOLD = 3;

export type SyncSummary = { runs: ProviderSyncRun[]; refundsCreated: number };

/** Apply one provider state to one order. Safe to run any number of times (idempotent refunds). */
function applyState(db: AdminDb, order: AdminOrder, state: { status: string; startCount: number; remains: number }, now: Date): { changed: boolean; refunded: boolean } {
  const next = mapProviderStatus(state.status);
  let changed = false;
  if (state.startCount !== order.startCount) { order.startCount = state.startCount; changed = true; }
  if (state.remains !== order.remains) { order.remains = state.remains; changed = true; }
  order.lastSyncedAt = now.toISOString();
  if (!next) {
    // Unknown status text: keep the old status and leave a trace.
    if (state.status.trim()) logSystem(db, "sync.unknown_status", "order", order.id, null, { status: state.status.slice(0, 40) }, now);
    return { changed, refunded: false };
  }

  if (next !== order.status && isActiveStatus(order.status)) {
    order.status = next;
    if (next === "dibatalkan") order.cancelledBy = "provider"; // provider-side cancel: the 100% automatic rule
    changed = true;
    if (next === "selesai" || next === "sebagian" || next === "dibatalkan" || next === "gagal_kirim") order.completedAt = now.toISOString();
    if (next === "selesai") order.remains = 0;
    notifyOrderStatus(db, order, now); // selesai / sebagian / dibatalkan / gagal_kirim
  }
  let refunded = false;
  // Refund by FINAL status, not by "status just changed": a run that crashed half way is repaired by the next one.
  if (order.status === "dibatalkan" || order.status === "sebagian" || (order.status === "gagal_kirim" && !order.needsManualCheck)) {
    const res = autoRefundForOrder(db, order.id, now);
    refunded = res.created;
    if (res.created) logSystem(db, "sync.refund", "order", order.id, null, { amount: res.refund?.amount }, now);
  }
  return { changed, refunded };
}

/** Moves cancel / refill requests forward based on what the provider and the order now say. */
function updateRequests(db: AdminDb, now: Date) {
  for (const c of db.cancelRequests) {
    if (c.status !== "menunggu" && c.status !== "berjalan") continue;
    const order = db.orders.find((o) => o.id === c.orderId);
    if (!order) continue;
    // A pending USER request is decided by an admin, but if the order already ended another way the request is moot.
    const waiting = db.refunds.find((r) => r.cancelRequestId === c.id && r.status === "menunggu");
    if (order.status === "dibatalkan" && order.cancelledBy !== "user") {
      c.status = "selesai";
      if (waiting) {
        waiting.status = "ditolak";
        waiting.rejectReason = "Pesanan sudah dibatalkan oleh provider; refund penuh diberikan otomatis.";
        waiting.processedAt = now.toISOString();
      }
    } else if (!isActiveStatus(order.status) && order.cancelledBy !== "user") {
      if (waiting) {
        waiting.status = "ditolak";
        waiting.rejectReason = "Pesanan sudah selesai sebelum pembatalan diproses.";
        waiting.processedAt = now.toISOString();
      }
      c.status = "ditolak";
      c.rejectReason = "Pesanan sudah selesai sebelum pembatalan diproses.";
      notifyUser(db, c.userId, { type: "pesanan", title: `Pembatalan #${order.id} ditolak`, body: c.rejectReason ?? "", href: `/dashboard/orders?search=${order.id}`, dedupeKey: `cancel-rejected:${c.id}` }, now);
    }
  }
  // The provider's refill status is not read back yet (TODO(provider)). Only the mock moves requests along by itself;
  // with a real provider an admin sets "berjalan" / "selesai" / "ditolak" on /admin/refills.
  if (providerMode() === "mock") {
    for (const r of db.refillRequests) {
      if (r.status === "menunggu") r.status = "berjalan";
      else if (r.status === "berjalan") r.status = "selesai";
    }
  }
}

/** One cron tick (every 2 minutes). TODO(hosting): call from a scheduler that hits /api/cron/sync-orders. */
export async function syncOrders(db: AdminDb, client: ProviderClient, now = new Date()): Promise<SyncSummary> {
  const runs: ProviderSyncRun[] = [];
  let refundsCreated = 0;

  for (const provider of db.providers) {
    const orders = db.orders.filter((o) => o.providerId === provider.id && o.providerOrderId && isActiveStatus(o.status));
    const run: ProviderSyncRun = { id: `sr_${now.getTime().toString(36)}_${provider.id}`, providerId: provider.id, startedAt: now.toISOString(), finishedAt: now.toISOString(), ordersChecked: 0, ordersChanged: 0, errors: 0, errorMessage: null };
    const batchStatus = client.getOrdersStatus?.bind(client);
    if (batchStatus) {
      // Up to 100 provider order ids per call.
      for (let i = 0; i < orders.length; i += MAX_STATUS_BATCH) {
        const chunk = orders.slice(i, i + MAX_STATUS_BATCH);
        run.ordersChecked += chunk.length;
        let results: Awaited<ReturnType<NonNullable<typeof client.getOrdersStatus>>>;
        try {
          results = await batchStatus(provider.id, chunk.map((o) => o.providerOrderId));
        } catch (e) {
          run.errors++;
          run.errorMessage = e instanceof Error ? e.message : "error";
          continue;
        }
        for (const order of chunk) {
          const state = results[order.providerOrderId];
          if (!state || state instanceof Error) {
            run.errors++;
            run.errorMessage = state instanceof Error ? state.message : "Status tidak ada di jawaban provider.";
            continue;
          }
          const r = applyState(db, order, state, now);
          if (r.changed) run.ordersChanged++;
          if (r.refunded) refundsCreated++;
        }
      }
    } else {
      for (const order of orders) {
        run.ordersChecked++;
        try {
          const state = await client.getOrderStatus(provider.id, order.providerOrderId);
          const r = applyState(db, order, state, now);
          if (r.changed) run.ordersChanged++;
          if (r.refunded) refundsCreated++;
        } catch (e) {
          run.errors++;
          run.errorMessage = e instanceof Error ? e.message : "error";
          // If the provider is down every remaining call would fail too; stop this provider early.
          if (run.errors >= 3 && run.ordersChanged === 0) break;
        }
      }
    }
    if (orders.length) provider.lastSync = now.toISOString();
    run.finishedAt = new Date().toISOString();
    db.syncRuns.unshift(run);
    runs.push(run);
    maybeAlert(db, provider.id, provider.name, now);
  }
  updateRequests(db, now);
  applyLowBalancePolicy(db, now);
  checkAlertThresholds(db, now, stuckOrders(db, now).length, refundMismatches(db).length);
  return { runs, refundsCreated };
}

/** After 3 failing runs in a row for one provider: raise one alert (until it recovers). */
function maybeAlert(db: AdminDb, providerId: string, name: string, now: Date) {
  const last = db.syncRuns.filter((r) => r.providerId === providerId).slice(0, FAILURE_ALERT_THRESHOLD);
  if (last.length < FAILURE_ALERT_THRESHOLD || !last.every((r) => r.errors > 0)) return;
  const message = `${name} gagal sinkron ${FAILURE_ALERT_THRESHOLD} kali berturut-turut.`;
  if (db.alerts.some((a) => a.providerId === providerId && a.message === message && a.at >= last[last.length - 1].startedAt)) return;
  db.alerts.unshift({ id: `al_${now.getTime().toString(36)}_${providerId}`, at: now.toISOString(), providerId, message });
  logSystem(db, "sync.provider_alert", "provider", providerId, null, { message }, now);
  sendAlert(db, "provider_sync_failing", message, now);
  notifyAdmins(db, { type: "sistem", title: `${name} gagal sinkron`, body: message, href: "/admin/providers", dedupeKey: `syncfail:${providerId}:${now.toISOString().slice(0, 10)}` }, now);
}

/** Optional: switch off the services of a provider whose balance dropped below the configured minimum. */
export function applyLowBalancePolicy(db: AdminDb, now = new Date()): string[] {
  const ops = db.settings.operations;
  if (!ops.autoDisableLowBalance) return [];
  const disabled: string[] = [];
  for (const p of db.providers) {
    if (p.balance >= ops.lowBalanceThreshold) continue;
    for (const s of db.services) {
      if (s.providerId === p.id && s.active) {
        s.active = false;
        disabled.push(s.id);
      }
    }
    if (disabled.length) logSystem(db, "provider.auto_disable", "provider", p.id, null, { services: disabled.length }, now);
  }
  return disabled;
}

export function stuckOrders(db: AdminDb, now = new Date()): AdminOrder[] {
  return db.orders.filter((o) => isStuck(o, now, db.settings.operations.stuckHours));
}
