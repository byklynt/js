import "server-only";
import { createEmptyDb, type AdminOrder } from "@/lib/admin-data";
import { toPublicProvider } from "@/lib/admin-db";
import { providerMode } from "@/lib/server/providers/config";
import { ORDER_SELECT, toAdminOrder } from "@/lib/server/repo/orders";
import { loadProviders } from "@/lib/server/repo/providers";
import { loadSettings } from "@/lib/server/repo/settings";
import { STALL_MINUTES, providerBalances, syncHealth } from "@/lib/server/metrics";
import type { Range, RevenuePoint } from "@/lib/server/series";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { listDeposits } from "./lists";

const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram", youtube: "YouTube", tiktok: "TikTok", twitter: "X", spotify: "Spotify", telegram: "Telegram", facebook: "Facebook",
  twitch: "Twitch", reddit: "Reddit", "website-traffic": "Website Traffic", "seo-backlink": "SEO Backlink", lainnya: "Lainnya",
};
const label = (p: string) => PLATFORM_LABEL[p] ?? (p ? p[0].toUpperCase() + p.slice(1) : "Lainnya");

type Dash = {
  revenueToday: number; ordersToday: number; newUsers: number; pendingTickets: number; pendingDeposits: number;
  financeRevenue: number; financeCost: number; financeRefunds: number;
  seriesHari: RevenuePoint[]; series7: RevenuePoint[]; series30: RevenuePoint[];
  platforms: Record<"hari" | "7" | "30", { platform: string; value: number }[]>;
  stuck: number; stuckNoProvider: number; thinMargin: number; flaggedUsers: number; refundMismatches: number;
  failedOrders: { id: string; username: string; charge: number }[]; activeByProvider: string[]; importedServices: number;
};

/**
 * The admin dashboard. Counts, sums and the revenue / platform series are computed in Postgres (admin_dashboard, indexed, one round
 * trip); the pure helpers in metrics.ts only shape provider health from the provider rows and the latest sync runs.
 */
export async function loadDashboardData() {
  const sb = supabaseAdmin();
  const [dashRes, settings, providers, runs, recent, deposits, alerts, sanity, mismatches] = await Promise.all([
    sb.rpc("admin_dashboard"),
    loadSettings(),
    loadProviders(),
    sb.from("provider_sync_runs").select("*").order("started_at", { ascending: false }).limit(60),
    sb.from("orders").select(ORDER_SELECT).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(5),
    listDeposits({ limit: 5 }),
    sb.from("admin_alerts").select("id,provider_id,message,created_at").order("created_at", { ascending: false }).limit(3),
    sb.from("sanity_runs").select("*").order("created_at", { ascending: false }).limit(1),
    sb.rpc("verify_balances"),
  ]);
  if (dashRes.error) throw new Error(`admin_dashboard: ${dashRes.error.message}`);
  const d = dashRes.data as unknown as Dash;
  const plat = (d.platforms ?? {}) as unknown as Record<string, { platform: string; value: number }[]>;
  const byLabel = (rows: { platform: string; value: number }[] = []) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(label(r.platform), (m.get(label(r.platform)) ?? 0) + Number(r.value));
    return [...m.entries()].map(([platform, value]) => ({ platform, value })).sort((a, b) => b.value - a.value);
  };

  // Provider health: the pure helpers from metrics.ts over provider rows + the latest runs (+ a stand-in for "has running orders").
  const mini = createEmptyDb();
  mini.providers = providers;
  mini.settings = settings;
  mini.syncRuns = (runs.data ?? []).map((r) => ({ id: r.id, providerId: r.provider_id, startedAt: r.started_at, finishedAt: r.finished_at, ordersChecked: r.orders_checked, ordersChanged: r.orders_changed, errors: r.errors, errorMessage: r.error_message }));
  mini.orders = (d.activeByProvider ?? []).map((providerId) => ({ providerId, status: "berjalan" }) as AdminOrder);
  const now = new Date();
  const health = syncHealth(mini, now);
  const failing = health.filter((h) => h.failingRuns > 0).map((h) => h.providerId);
  let providerError = Number(d.stuckNoProvider);
  if (failing.length && Number(d.stuck) > providerError) {
    const { count } = await sb.from("orders").select("id", { count: "exact", head: true }).in("status", ["menunggu", "diproses", "berjalan"])
      .lt("created_at", new Date(Date.now() - settings.operations.stuckHours * 3_600_000).toISOString()).or(`provider_id.in.(${failing.join(",")}),provider_order_id.eq.`);
    providerError = count ?? providerError;
  }
  const stuckTotal = Number(d.stuck);
  const waiting = stuckTotal - providerError;
  const lastSanity = sanity.data?.[0];
  const bm = (mismatches.data ?? []).map((m) => ({ username: m.username, diff: Number(m.diff) }));
  const mode = providerMode();
  const likeo = providers.find((p) => p.kind === "likeo");
  const imported = Number(d.importedServices) > 0;

  return {
    stats: { revenueToday: Number(d.revenueToday), ordersToday: Number(d.ordersToday), newUsers: Number(d.newUsers), pendingTickets: Number(d.pendingTickets) },
    series: {
      revenue: { hari: d.seriesHari as RevenuePoint[], "7": d.series7 as RevenuePoint[], "30": d.series30 as RevenuePoint[] } satisfies Record<Range, RevenuePoint[]>,
      platforms: { hari: byLabel(plat["hari"]), "7": byLabel(plat["7"]), "30": byLabel(plat["30"]) },
    },
    recentOrders: ((recent.data ?? []) as unknown as Parameters<typeof toAdminOrder>[0][]).map(toAdminOrder),
    recentDeposits: deposits.rows,
    providers: providers.map(toPublicProvider),
    lowProviders: providers.filter((p) => p.balance < settings.operations.lowBalanceThreshold).map((p) => p.id),
    lowBalanceThreshold: settings.operations.lowBalanceThreshold,
    autoDisableLowBalance: settings.operations.autoDisableLowBalance,
    finance: { revenue: Number(d.financeRevenue), cost: Number(d.financeCost), refunds: Number(d.financeRefunds), profit: Number(d.financeRevenue) - Number(d.financeCost) - Number(d.financeRefunds) },
    syncHealth: health,
    providerBalances: providerBalances(mini),
    alerts: (alerts.data ?? []).map((a) => ({ id: a.id, at: a.created_at, providerId: a.provider_id ?? "", message: a.message })),
    failedOrders: d.failedOrders ?? [],
    stuckCount: stuckTotal,
    stuck: { total: stuckTotal, providerError, waiting, main: stuckTotal === 0 ? null : providerError >= waiting ? ("provider_error" as const) : ("waiting_provider" as const) },
    pendingDeposits: Number(d.pendingDeposits),
    thinMargin: Number(d.thinMargin),
    flaggedUsers: Number(d.flaggedUsers),
    sanity: lastSanity ? { id: lastSanity.id, at: lastSanity.created_at, balanceMismatches: lastSanity.balance_mismatches, refundMismatches: lastSanity.refund_mismatches, discrepancies: lastSanity.discrepancies, stuck: lastSanity.stuck } : null,
    setup: [
      { id: "provider", label: "Hubungkan provider (PROVIDER_MODE=live dan API key di .env.local)", href: "/admin/providers", done: mode === "live" && Boolean(likeo?.lastTest?.ok) },
      { id: "pricing", label: "Atur kurs dan markup", href: "/admin/providers", done: imported || (settings.pricing.rateIdr > 0 && settings.pricing.defaultMarkup.markup > 0) },
      { id: "services", label: "Sinkronkan layanan dari provider", href: "/admin/services", done: imported },
      { id: "payments", label: "Aktifkan metode pembayaran untuk deposit", href: "/admin/settings/payments", done: settings.payments.activeMethods.length > 0 },
    ],
    maintenance: settings.general.maintenance,
    stallMinutes: STALL_MINUTES,
    anyStalled: health.some((h) => h.stalled),
    reconciliation: { discrepancies: 0, balanceMismatches: bm, refundMismatches: Number(d.refundMismatches) },
  };
}
