import type { AdminDb } from "@/lib/admin-data";
import { reconcileBalances } from "./ledger";
import { refundMismatches } from "./refunds";
import { isActiveStatus, mapProviderStatus } from "./rules";
import { stuckOrders } from "./sync";

export const STALL_MINUTES = 10;

const isToday = (iso: string, today: string) => iso.startsWith(today);

/** Revenue - provider cost - refunds, for orders and refunds created on `today` (YYYY-MM-DD). */
export function todayFinance(db: AdminDb, today: string) {
  const orders = db.orders.filter((o) => isToday(o.createdAt, today));
  const revenue = orders.reduce((s, o) => s + o.charge, 0);
  const cost = orders.reduce((s, o) => s + o.providerCost, 0);
  const refunds = db.refunds.filter((r) => r.status === "selesai" && !r.reversed && r.processedAt && isToday(r.processedAt, today)).reduce((s, r) => s + r.amount, 0);
  return { revenue, cost, refunds, profit: revenue - cost - refunds };
}

export function syncHealth(db: AdminDb, now = new Date()) {
  return db.providers.map((p) => {
    const runs = db.syncRuns.filter((r) => r.providerId === p.id);
    const last = runs[0];
    const consecutiveFailures = runs.findIndex((r) => r.errors === 0);
    return {
      providerId: p.id,
      name: p.name,
      lastRunAt: last?.finishedAt ?? null,
      lastErrors: last?.errors ?? 0,
      failingRuns: consecutiveFailures === -1 ? runs.length : consecutiveFailures,
      minutesAgo: last ? Math.round((now.getTime() - new Date(last.finishedAt).getTime()) / 60_000) : null,
      lastSyncedAt: last?.finishedAt ?? null,
      /** No run for 10 minutes while the cron should tick every 2: the job stopped. */
      stalled: !last || now.getTime() - new Date(last.finishedAt).getTime() > STALL_MINUTES * 60_000,
    };
  });
}

export function providerBalances(db: AdminDb) {
  const threshold = db.settings.operations.lowBalanceThreshold;
  return db.providers.map((p) => ({ id: p.id, name: p.name, balance: p.balance, low: p.balance < threshold, status: p.status }));
}

/** Orders where the provider's status disagrees with ours (not yet picked up by a sync). */
export function providerDiscrepancies(db: AdminDb) {
  return db.orders
    .filter((o) => o.providerOrderId && isActiveStatus(o.status))
    .flatMap((o) => {
      const state = db.providerOrders[o.providerOrderId];
      const mapped = state ? mapProviderStatus(state.status) : null;
      return mapped && mapped !== o.status && !isActiveStatus(mapped) ? [{ orderId: o.id, panel: o.status, provider: mapped }] : [];
    });
}

export function integrityReport(db: AdminDb, now = new Date()) {
  return {
    balanceMismatches: reconcileBalances(db),
    refundMismatches: refundMismatches(db),
    discrepancies: providerDiscrepancies(db),
    stuck: stuckOrders(db, now).map((o) => o.id),
  };
}

/** Why orders are stuck: the provider is failing (error) or the provider simply has not finished (waiting). */
export function stuckBreakdown(db: AdminDb, now = new Date()) {
  const stuck = stuckOrders(db, now);
  const failing = new Set(syncHealth(db, now).filter((h) => h.failingRuns > 0 || db.providerDown.includes(h.providerId)).map((h) => h.providerId));
  const providerError = stuck.filter((o) => failing.has(o.providerId) || !o.providerOrderId).length;
  const waiting = stuck.length - providerError;
  return {
    total: stuck.length,
    providerError,
    waiting,
    main: stuck.length === 0 ? null : providerError >= waiting ? ("provider_error" as const) : ("waiting_provider" as const),
  };
}

/** Runs the sanity job and writes the findings to the audit log (shown in /admin/logs). */
export function runSanityJob(db: AdminDb, now = new Date()) {
  const report = integrityReport(db, now);
  const problems = report.balanceMismatches.length + report.refundMismatches.length;
  db.sanityRuns.unshift({
    id: `sn_${now.getTime().toString(36)}`, at: now.toISOString(), balanceMismatches: report.balanceMismatches.length,
    refundMismatches: report.refundMismatches.length, discrepancies: report.discrepancies.length, stuck: report.stuck.length,
  });
  db.sanityRuns.length = Math.min(db.sanityRuns.length, 30);
  if (problems) {
    db.auditLogs.unshift({
      id: `log_${now.getTime().toString(36)}_${db.auditLogs.length}`, at: now.toISOString(), adminId: "system", adminName: "sistem",
      action: "sanity.mismatch", targetType: "ledger", targetId: "-", before: null,
      after: { balances: report.balanceMismatches.map((m) => ({ user: m.username, diff: m.diff })), refunds: report.refundMismatches },
    });
  }
  return report;
}
