import "server-only";
import { integrityReport, providerBalances, stuckBreakdown, STALL_MINUTES, syncHealth, todayFinance } from "@/lib/server/metrics";
import { flaggedUsers } from "@/lib/server/risk";
import { thinMarginServices } from "@/lib/server/pricing";
import { likeoApiUrl, maskedLikeoKey, providerMode } from "@/lib/server/providers/config";
import { missingRefunds } from "@/lib/server/views";
import { ordersByPlatform, revenueSeries } from "@/lib/server/series";
import { dayOf, todayIso } from "@/lib/server/time";
import { applyPersisted, changedOutside, getStore, markSynced, persistAdminState } from "@/lib/server/store";
import { checkKeyStability, KEY_CHANGED_MESSAGE } from "@/lib/server/key-check";
import { encryptSecret } from "@/lib/server/crypto-at-rest";
import {
  DEV_OWNER_TOTP_SECRET,
  createEmptyDb,
  mockAdminAccounts,
  setPriceRounding,
  type AdminAccount,
  type AdminDb,
  type ProviderRecord,
  type PublicProvider,
} from "@/lib/admin-data";

/**
 * In-memory database (lives on globalThis so it survives HMR). It starts EMPTY (createEmptyDb) and is filled from the dev store
 * (lib/server/store.ts); nothing is seeded at startup. Demo data exists only in lib/dev/demo-seed.ts (`npm run seed:demo`).
 * TODO: replace with the real database. If Supabase is used: keep the role in a `profiles` table,
 * enforce it with RLS, and read it server-side only. Never trust a role sent from the client.
 */
const globalForDb = globalThis as unknown as { __sgAdminDb?: AdminDb; __sgAdminDbSeed?: string };

/** Bump this string to rebuild the in-memory db from the dev store on the next request. */
const SEED_VERSION = "empty-1";

/** Dev: shout once at startup if the encryption key no longer matches the stored data. */
function verifyKey() {
  if (process.env.VITEST || !process.env.ADMIN_2FA_ENC_KEY) return;
  try {
    if (checkKeyStability(getStore()) === "changed") console.error(`
[2fa] ${KEY_CHANGED_MESSAGE}
`);
  } catch (e) {
    console.error("[2fa]", e instanceof Error ? e.message : e);
  }
}

export function getDb(): AdminDb {
  // The dev store was edited outside this process (e.g. npm run admin:reset-2fa): pick the change up.
  if (globalForDb.__sgAdminDb && changedOutside()) {
    applyPersisted(globalForDb.__sgAdminDb);
    markSynced();
  }
  if (!globalForDb.__sgAdminDb || globalForDb.__sgAdminDbSeed !== SEED_VERSION) {
    const db = createEmptyDb();
    // A reseed (SEED_VERSION bump, dev restart) must never wipe admin 2FA, sessions or audit logs.
    const hadSecurity = applyPersisted(db);
    if (!hadSecurity && process.env.NODE_ENV !== "production" && process.env.ADMIN_2FA_ENC_KEY && !process.env.VITEST) {
      // First run only, development only: the seeded "owner" account starts with 2FA on (known dev secret) so the
      // sign-in step can be tried. "admin" starts without 2FA to exercise the forced setup. Remove with the mock store.
      db.adminSecurity.adm_2 = { secretEnc: encryptSecret(DEV_OWNER_TOTP_SECRET), enabled: true, enabledAt: new Date().toISOString(), backupHashes: [], lastUsedStep: 0 };
      persistAdminState(db);
    }
    globalForDb.__sgAdminDb = db;
    verifyKey();
    markSynced();
    globalForDb.__sgAdminDbSeed = SEED_VERSION;
  }
  setPriceRounding(globalForDb.__sgAdminDb.settings.pricing.roundTo);
  return globalForDb.__sgAdminDb;
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

/** Numbers shown in the shell: today's revenue + items needing attention. */
export function getShellStats() {
  const db = getDb();
  const today = todayIso();
  const todayRevenue = db.deposits
    .filter((d) => d.status === "berhasil" && dayOf(d.createdAt) === today)
    .reduce((sum, d) => sum + d.amount, 0);
  const pendingTickets = db.tickets.filter((t) => t.status === "menunggu").length;
  const pendingDeposits = db.deposits.filter((d) => d.status === "menunggu").length;
  return { todayRevenue, pendingTickets, pendingDeposits };
}

export function getDashboardData() {
  const db = getDb();
  const stats = getShellStats();
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
