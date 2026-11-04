/**
 * Aggregations for /admin/stats. Pure functions over the mock dataset in lib/admin-stats-data.ts.
 * TODO(db): each aggregation below maps to one SQL query (GROUP BY date / service / provider) or a materialized
 * view refreshed every few minutes; the dataset arrays are the rows those queries would return.
 */
import { addDays, type DailyFact, type DepositFact, type StatsDataset } from "@/lib/admin-stats-data";

export type RangeId = "hari" | "7" | "30" | "90" | "bulan" | "kustom";
export type TabId = "keuangan" | "layanan" | "pengguna" | "provider" | "operasional";
export type StatsParams = { range: RangeId; from?: string; to?: string; provider: string; platform: string; compare: boolean };

export const THIN_MARGIN_PERCENT = 5;
export const HIGH_REFUND_PERCENT = 8;

const round1 = (n: number) => Math.round(n * 10) / 10;

// ---------------------------------------------------------------------------
// Basic formulas
// ---------------------------------------------------------------------------

/** profit = revenue - provider cost - refunds */
export const profitOf = (revenue: number, providerCost: number, refund: number) => revenue - providerCost - refund;

/** Margin as a share of revenue, one decimal. 0 when there is no revenue (no division by zero). */
export const marginPercent = (revenue: number, profit: number) => (revenue > 0 ? round1((profit / revenue) * 100) : 0);

/** Share in percent, one decimal. 0 when the total is 0. */
export const ratePercent = (part: number, total: number) => (total > 0 ? round1((part / total) * 100) : 0);

/**
 * Change versus the previous period, in percent. `null` when there is nothing to compare with
 * (previous is 0 while current is not), 0 when both are 0.
 */
export function deltaPercent(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return round1(((current - previous) / Math.abs(previous)) * 100);
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

const dayFormat = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "UTC" });
export const formatDay = (iso: string) => dayFormat.format(new Date(`${iso}T00:00:00Z`));

export function resolveRange(params: Pick<StatsParams, "range" | "from" | "to">, today: string): { from: string; to: string } {
  switch (params.range) {
    case "hari":
      return { from: today, to: today };
    case "7":
      return { from: addDays(today, -6), to: today };
    case "90":
      return { from: addDays(today, -89), to: today };
    case "bulan":
      return { from: `${today.slice(0, 8)}01`, to: today };
    case "kustom": {
      const from = params.from && /^\d{4}-\d{2}-\d{2}$/.test(params.from) ? params.from : addDays(today, -29);
      const to = params.to && /^\d{4}-\d{2}-\d{2}$/.test(params.to) ? params.to : today;
      return from <= to ? { from, to: to > today ? today : to } : { from: to, to: from > today ? today : from };
    }
    default:
      return { from: addDays(today, -29), to: today };
  }
}

/** The period of the same length that ends the day before `from`. */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  const length = daysBetween(from, to).length;
  return { from: addDays(from, -length), to: addDays(from, -1) };
}

// ---------------------------------------------------------------------------
// Filtering and sums
// ---------------------------------------------------------------------------

export function filterDaily(facts: DailyFact[], f: { from: string; to: string; provider?: string; platform?: string }): DailyFact[] {
  return facts.filter(
    (x) => x.date >= f.from && x.date <= f.to && (!f.provider || f.provider === "semua" || x.providerId === f.provider) && (!f.platform || f.platform === "semua" || x.platform === f.platform)
  );
}

export function financeSummary(facts: DailyFact[]) {
  const revenue = facts.reduce((s, x) => s + x.revenue, 0);
  const providerCost = facts.reduce((s, x) => s + x.providerCost, 0);
  const refund = facts.reduce((s, x) => s + x.refund, 0);
  const profit = profitOf(revenue, providerCost, refund);
  return { revenue, providerCost, refund, profit, margin: marginPercent(revenue, profit), orders: facts.reduce((s, x) => s + x.orders, 0) };
}

export function dailyFinance(facts: DailyFact[], from: string, to: string) {
  const byDay = new Map<string, DailyFact[]>();
  for (const f of facts) byDay.set(f.date, [...(byDay.get(f.date) ?? []), f]);
  return daysBetween(from, to).map((date) => {
    const s = financeSummary(byDay.get(date) ?? []);
    return { date, label: formatDay(date), orders: s.orders, revenue: s.revenue, providerCost: s.providerCost, refund: s.refund, profit: s.profit, margin: s.margin };
  });
}

/** Income per day split by payment method (for the stacked bars). Missing days are zero. */
export function depositsByMethod(deposits: DepositFact[], from: string, to: string, methods: readonly string[]) {
  return daysBetween(from, to).map((date) => {
    const row: Record<string, number | string> = { date, label: formatDay(date) };
    for (const m of methods) row[m] = 0;
    for (const d of deposits) if (d.date === date) row[d.method] = (row[d.method] as number) + d.amount;
    return row;
  });
}

export function topServices(facts: DailyFact[]) {
  const map = new Map<string, DailyFact[]>();
  for (const f of facts) map.set(f.serviceId, [...(map.get(f.serviceId) ?? []), f]);
  return Array.from(map, ([serviceId, rows]) => {
    const s = financeSummary(rows);
    return {
      serviceId, name: rows[0].serviceName, platform: rows[0].platform, orders: s.orders, revenue: s.revenue, profit: s.profit, margin: s.margin,
      refundRate: ratePercent(s.refund, s.revenue),
    };
  })
    .map((r) => ({ ...r, thin: r.margin < THIN_MARGIN_PERCENT, highRefund: r.refundRate > HIGH_REFUND_PERCENT }))
    .sort((a, b) => b.revenue - a.revenue);
}

export function providerStats(facts: DailyFact[], providers: StatsDataset["providers"]) {
  return providers.map((p) => {
    const rows = facts.filter((f) => f.providerId === p.id);
    const orders = rows.reduce((s, x) => s + x.orders, 0);
    const completed = rows.reduce((s, x) => s + x.completed, 0);
    const partial = rows.reduce((s, x) => s + x.partial, 0);
    const canceled = rows.reduce((s, x) => s + x.canceled, 0);
    const minutes = rows.reduce((s, x) => s + x.completionMinutes, 0);
    return {
      id: p.id, name: p.name, orders, successRate: ratePercent(completed, orders), partialRate: ratePercent(partial, orders), cancelRate: ratePercent(canceled, orders),
      avgMinutes: completed > 0 ? Math.round(minutes / completed) : 0, cost: rows.reduce((s, x) => s + x.providerCost, 0), balance: p.balance, status: p.status, syncStatus: p.syncStatus,
    };
  });
}

export function platformCompletion(facts: DailyFact[]) {
  const map = new Map<string, { completed: number; minutes: number }>();
  for (const f of facts) {
    const cur = map.get(f.platform) ?? { completed: 0, minutes: 0 };
    map.set(f.platform, { completed: cur.completed + f.completed, minutes: cur.minutes + f.completionMinutes });
  }
  return Array.from(map, ([platform, v]) => ({ platform, avgMinutes: v.completed > 0 ? Math.round(v.minutes / v.completed) : 0 })).sort((a, b) => b.avgMinutes - a.avgMinutes);
}

// ---------------------------------------------------------------------------
// Tab payloads
// ---------------------------------------------------------------------------

export type Card = { key: string; label: string; value: number; kind: "idr" | "pct" | "int"; delta: number | null; /** Up is bad (costs, refunds). */ invert?: boolean; href?: string };

export type StatsResult = {
  period: { from: string; to: string; prevFrom: string; prevTo: string; days: number };
  compare: boolean;
  tab: TabId;
  keuangan?: {
    cards: Card[];
    series: ReturnType<typeof dailyFinance>;
    methods: string[];
    byMethod: ReturnType<typeof depositsByMethod>;
  };
  layanan?: { rows: ReturnType<typeof topServices>; top10: { name: string; revenue: number }[] };
  pengguna?: {
    cards: Card[];
    signups: { date: string; label: string; signups: number }[];
    spenders: StatsDataset["spenders"];
    review: StatsDataset["spenders"];
  };
  provider?: { rows: ReturnType<typeof providerStats> };
  operasional?: {
    completion: ReturnType<typeof platformCompletion>;
    stuck: { date: string; label: string; stuck: number }[];
    tickets: { date: string; label: string; tickets: number; firstResponseMin: number }[];
    syncErrors: { date: string; label: string; syncErrors: number }[];
  };
};

export const REVIEW_REFUND_RATIO = 0.4;

export function computeStats(ds: StatsDataset, tab: TabId, params: StatsParams, today: string): StatsResult {
  const { from, to } = resolveRange(params, today);
  const prev = previousPeriod(from, to);
  const filters = { provider: params.provider, platform: params.platform };
  const cur = filterDaily(ds.daily, { from, to, ...filters });
  const before = filterDaily(ds.daily, { from: prev.from, to: prev.to, ...filters });
  const result: StatsResult = { period: { from, to, prevFrom: prev.from, prevTo: prev.to, days: daysBetween(from, to).length }, compare: params.compare, tab };

  if (tab === "keuangan") {
    const a = financeSummary(cur);
    const b = financeSummary(before);
    const d = (x: number, y: number) => (params.compare ? deltaPercent(x, y) : null);
    result.keuangan = {
      cards: [
        { key: "revenue", label: "Pendapatan", value: a.revenue, kind: "idr", delta: d(a.revenue, b.revenue), href: "/admin/orders" },
        { key: "cost", label: "Biaya Provider", value: a.providerCost, kind: "idr", delta: d(a.providerCost, b.providerCost), invert: true, href: "/admin/providers" },
        { key: "refund", label: "Refund", value: a.refund, kind: "idr", delta: d(a.refund, b.refund), invert: true, href: "/admin/refunds" },
        { key: "profit", label: "Profit", value: a.profit, kind: "idr", delta: d(a.profit, b.profit) },
        { key: "margin", label: "Margin", value: a.margin, kind: "pct", delta: params.compare ? round1(a.margin - b.margin) : null },
      ],
      series: dailyFinance(cur, from, to),
      methods: Array.from(new Set(ds.deposits.map((x) => x.method))),
      byMethod: depositsByMethod(ds.deposits, from, to, Array.from(new Set(ds.deposits.map((x) => x.method)))),
    };
  }
  if (tab === "layanan") {
    const rows = topServices(cur);
    result.layanan = { rows, top10: rows.slice(0, 10).map((r) => ({ name: `${r.serviceId} ${r.name}`.slice(0, 34), revenue: r.revenue })) };
  }
  if (tab === "pengguna") {
    const inRange = (x: { date: string }, f: string, t: string) => x.date >= f && x.date <= t;
    const signupsNow = ds.signups.filter((x) => inRange(x, from, to));
    const signupsPrev = ds.signups.filter((x) => inRange(x, prev.from, prev.to));
    const sum = (rows: typeof signupsNow) => rows.reduce((s, x) => s + x.signups, 0);
    const activeNow = signupsNow.length ? signupsNow[signupsNow.length - 1].active : 0;
    const activePrev = signupsPrev.length ? signupsPrev[signupsPrev.length - 1].active : 0;
    const revNow = financeSummary(cur).revenue;
    const revPrev = financeSummary(before).revenue;
    const avgNow = activeNow > 0 ? Math.round(revNow / activeNow) : 0;
    const avgPrev = activePrev > 0 ? Math.round(revPrev / activePrev) : 0;
    const d = (x: number, y: number) => (params.compare ? deltaPercent(x, y) : null);
    result.pengguna = {
      cards: [
        { key: "signups", label: "Pendaftar Baru", value: sum(signupsNow), kind: "int", delta: d(sum(signupsNow), sum(signupsPrev)), href: "/admin/users" },
        { key: "active", label: "User Aktif", value: activeNow, kind: "int", delta: d(activeNow, activePrev), href: "/admin/users?status=aktif" },
        { key: "avg", label: "Rata-rata Belanja", value: avgNow, kind: "idr", delta: d(avgNow, avgPrev) },
        { key: "balance", label: "Total Saldo Mengendap", value: ds.spenders.reduce((s, u) => s + u.balance, 0), kind: "idr", delta: null, href: "/admin/ledger" },
      ],
      signups: signupsNow.map((x) => ({ date: x.date, label: formatDay(x.date), signups: x.signups })),
      spenders: ds.spenders,
      review: ds.spenders.filter((u) => u.refundRatio >= REVIEW_REFUND_RATIO),
    };
  }
  if (tab === "provider") {
    const providers = ds.providers.filter((p) => params.provider === "semua" || p.id === params.provider);
    result.provider = { rows: providerStats(cur, providers) };
  }
  if (tab === "operasional") {
    const ops = ds.ops.filter((x) => x.date >= from && x.date <= to);
    result.operasional = {
      completion: platformCompletion(cur),
      stuck: ops.map((x) => ({ date: x.date, label: formatDay(x.date), stuck: x.stuck })),
      tickets: ops.map((x) => ({ date: x.date, label: formatDay(x.date), tickets: x.tickets, firstResponseMin: x.firstResponseMin })),
      syncErrors: ops.map((x) => ({ date: x.date, label: formatDay(x.date), syncErrors: x.syncErrors })),
    };
  }
  return result;
}
