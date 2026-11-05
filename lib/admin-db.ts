import "server-only";
import { integrityReport, providerBalances, stuckBreakdown, STALL_MINUTES, syncHealth, todayFinance } from "@/lib/server/metrics";
import { flaggedUsers } from "@/lib/server/risk";
import { thinMarginServices } from "@/lib/server/pricing";
import { likeoApiUrl, maskedLikeoKey, providerMode } from "@/lib/server/providers/config";
import { missingRefunds } from "@/lib/server/views";
import { ordersByPlatform, revenueSeries } from "@/lib/server/series";
import { dayOf, todayIso } from "@/lib/server/time";
import { currentSnapshot } from "@/lib/server/admin-snapshot";
import {
  mockAdminAccounts,
  setPriceRounding,
  type AdminAccount,
  type AdminDb,
  type ProviderRecord,
  type PublicProvider,
} from "@/lib/admin-data";

/**
 * getDb() = the admin snapshot of THIS request (lib/server/admin-snapshot.ts): the latest rows of every table, built from
 * Supabase for each admin request and held in AsyncLocalStorage. It is the READ side only; admin writes use queries / RPCs.
 * Outside an admin request there is no snapshot and getDb() throws, instead of quietly serving stale data.
 */
export function getDb(): AdminDb {
  const db = currentSnapshot();
  if (!db) throw new Error("getDb() dipanggil di luar permintaan admin (tidak ada snapshot). Bungkus dengan withAdminDb().");
  setPriceRounding(db.settings.pricing.roundTo);
  return db;
}

export function findAdminByIdentifier(identifier: string): AdminAccount | undefined {
  const needle = identifier.trim().toLowerCase();
  return mockAdminAccounts.find((a) => a.username.toLowerCase() === needle || a.email.toLowerCase() === needle);
}

export function findAdminById(id: string): AdminAccount | undefined {
  return mockAdminAccounts.find((a) => a.id === id);
}

/** Shows only the last 4 characters. The full key never leaves the server. */
export function maskKey(key: string): string {
  return `${"•".repeat(12)}${key.slice(-4)}`;
}

export function toPublicProvider(p: ProviderRecord): PublicProvider {
  // Explicit allow-list: the full apiKey must never be part of what the client receives.
  return {
    id: p.id,
    name: p.name,
    apiUrl: p.kind === "likeo" ? likeoApiUrl() : p.apiUrl,
    balance: p.balance,
    status: p.status,
    lastSync: p.lastSync,
    kind: p.kind,
    currency: p.currency,
    balanceNative: p.balanceNative,
    balanceAt: p.balanceAt,
    lastTest: p.lastTest,
    // The Likeo key lives in the environment only; its last 4 characters are all that is ever shown.
    apiKeyMasked: p.kind === "likeo" ? maskedLikeoKey() : maskKey(p.apiKey),
  };
}

export function getDashboardData() {
  const db = getDb();
  const today0 = todayIso();
  const stats = {
    todayRevenue: db.deposits.filter((d) => d.status === "berhasil" && dayOf(d.createdAt) === today0).reduce((sum, d) => sum + d.amount, 0),
    pendingTickets: db.tickets.filter((t) => t.status === "menunggu").length,
    pendingDeposits: db.deposits.filter((d) => d.status === "menunggu").length,
  };
  const lowProviders = db.providers.filter((p) => p.balance < db.settings.operations.lowBalanceThreshold).map((p) => p.id);
  const now = new Date();
  const integrity = integrityReport(db, now);
  return {
    stats: {
      revenueToday: stats.todayRevenue,
      ordersToday: db.orders.filter((o) => dayOf(o.createdAt) === todayIso(now)).length,
      newUsers: db.users.filter((u) => dayOf(u.createdAt) === todayIso(now)).length,
      pendingTickets: stats.pendingTickets,
    },
    series: {
      revenue: { hari: revenueSeries(db, "hari", now), "7": revenueSeries(db, "7", now), "30": revenueSeries(db, "30", now) },
      platforms: { hari: ordersByPlatform(db, "hari", now), "7": ordersByPlatform(db, "7", now), "30": ordersByPlatform(db, "30", now) },
    },
    recentOrders: db.orders.slice(0, 5),
    recentDeposits: db.deposits.slice(0, 5),
    providers: db.providers.map(toPublicProvider),
    lowProviders,
    lowBalanceThreshold: db.settings.operations.lowBalanceThreshold,
    autoDisableLowBalance: db.settings.operations.autoDisableLowBalance,
    finance: todayFinance(db, todayIso(now)),
    syncHealth: syncHealth(db, now),
    providerBalances: providerBalances(db),
    alerts: db.alerts.slice(0, 3),
    failedOrders: db.orders.filter((o) => o.status === "gagal_kirim").map((o) => ({ id: o.id, username: o.username, charge: o.charge })),
    stuckCount: integrity.stuck.length,
    stuck: stuckBreakdown(db, now),
    pendingDeposits: db.deposits.filter((d) => d.status === "menunggu").length,
    thinMargin: thinMarginServices(db).length,
    flaggedUsers: flaggedUsers(db).length,
    sanity: db.sanityRuns[0] ?? null,
    setup: setupSteps(db),
    maintenance: db.settings.general.maintenance,
    stallMinutes: STALL_MINUTES,
    anyStalled: syncHealth(db, now).some((h) => h.stalled),
    reconciliation: {
      discrepancies: integrity.discrepancies.length,
      balanceMismatches: integrity.balanceMismatches.map((m) => ({ username: m.username, diff: m.diff })),
      refundMismatches: integrity.refundMismatches.length + missingRefunds(db).length,
    },
  };
}

/** First-run checklist on the admin dashboard: what is still missing before the panel can take orders. */
function setupSteps(db: AdminDb) {
  const mode = providerMode();
  const likeo = db.providers.find((p) => p.kind === "likeo");
  return [
    { id: "provider", label: "Hubungkan provider (PROVIDER_MODE=live dan API key di .env.local)", href: "/admin/providers", done: mode === "live" && Boolean(likeo?.lastTest?.ok) },
    { id: "pricing", label: "Atur kurs dan markup", href: "/admin/providers", done: Boolean(db.services.some((s) => s.imported)) || db.settings.pricing.rateIdr !== 16_000 },
    { id: "services", label: "Sinkronkan layanan dari provider", href: "/admin/services", done: db.services.some((s) => s.imported) },
    { id: "payments", label: "Aktifkan metode pembayaran untuk deposit", href: "/admin/settings/payments", done: db.settings.payments.activeMethods.length > 0 },
  ];
}
