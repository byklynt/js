import "server-only";
import { addDays, STATS_DAYS, type DailyFact, type OpsFact, type SignupFact, type SpenderRow, type StatsDataset } from "@/lib/admin-stats-data";
import { loadProviders } from "@/lib/server/repo/providers";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { dayOf } from "@/lib/server/time";

type Raw = {
  daily: DailyFact[]; deposits: { date: string; method: string; amount: number }[]; signups: { date: string; signups: number }[]; active: { date: string; active: number }[];
  tickets: { date: string; tickets: number; firstResponseMin: number }[]; syncErrors: { date: string; errors: number }[]; spenders: SpenderRow[]; platforms: string[];
};

/**
 * The statistics dataset, aggregated by Postgres (admin_stats_dataset): per day and service facts, deposits, sign-ups, first-response times,
 * sync errors, the top spenders. The page then runs the pure computeStats over it, exactly as before.
 */
export async function loadStatsDataset(now = new Date()): Promise<StatsDataset> {
  const today = dayOf(now);
  const days = Array.from({ length: STATS_DAYS }, (_, i) => addDays(today, -(STATS_DAYS - 1 - i)));
  const [res, providers, runs] = await Promise.all([
    supabaseAdmin().rpc("admin_stats_dataset", { p_from: days[0] }),
    loadProviders(),
    supabaseAdmin().from("provider_sync_runs").select("provider_id,errors,started_at").order("started_at", { ascending: false }).limit(200),
  ]);
  if (res.error) throw new Error(`admin_stats_dataset: ${res.error.message}`);
  const raw = res.data as unknown as Raw;
  const by = <T extends { date: string }>(rows: T[]) => new Map(rows.map((r) => [String(r.date), r]));
  const signups = by(raw.signups), active = by(raw.active), tickets = by(raw.tickets), errors = by(raw.syncErrors);
  const n = (v: unknown) => Number(v ?? 0);
  return {
    daily: (raw.daily ?? []).map((f) => ({ ...f, orders: n(f.orders), revenue: n(f.revenue), providerCost: n(f.providerCost), refund: n(f.refund), completed: n(f.completed), partial: n(f.partial), canceled: n(f.canceled), failed: n(f.failed), completionMinutes: n(f.completionMinutes) })),
    deposits: (raw.deposits ?? []).map((d) => ({ date: String(d.date), method: d.method, amount: n(d.amount) })),
    signups: days.map((date): SignupFact => ({ date, signups: n(signups.get(date)?.signups), active: n(active.get(date)?.active) })),
    ops: days.map((date): OpsFact => ({ date, stuck: 0, tickets: n(tickets.get(date)?.tickets), firstResponseMin: n(tickets.get(date)?.firstResponseMin), syncErrors: n(errors.get(date)?.errors) })),
    spenders: (raw.spenders ?? []).map((s) => ({ ...s, totalSpent: n(s.totalSpent), orders: n(s.orders), refundRatio: n(s.refundRatio), balance: n(s.balance) })),
    providers: providers.map((p) => {
      const last = (runs.data ?? []).filter((r) => r.provider_id === p.id).slice(0, 3);
      const failing = last.length === 3 && last.every((r) => r.errors > 0);
      return { id: p.id, name: p.name, balance: p.balance, status: p.status, lastSync: p.lastSync, syncStatus: failing ? ("Gagal 3x" as const) : ("Normal" as const) };
    }),
    platforms: raw.platforms ?? [],
  };
}
