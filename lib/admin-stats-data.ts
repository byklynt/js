/**
 * MOCK statistics data for /admin/stats: deterministic daily facts for the last 180 days.
 * TODO(db): replace buildStatsDataset() with real queries / materialized views (see lib/server/stats.ts).
 * Everything here is generated, nothing is read from the real order store.
 */
import { MOCK_TODAY, seedProviders, seedServices, seedUsers } from "@/lib/admin-data";

export const STATS_TODAY = MOCK_TODAY;
export const STATS_DAYS = 180;
export const PAYMENT_METHODS = ["QRIS", "Transfer Bank", "E-Wallet", "Virtual Account"] as const;

/** One row per day and service. */
export type DailyFact = {
  date: string;
  serviceId: string;
  serviceName: string;
  platform: string;
  providerId: string;
  orders: number;
  revenue: number;
  providerCost: number;
  refund: number;
  completed: number;
  partial: number;
  canceled: number;
  failed: number;
  /** Sum of completion minutes over the completed orders. */
  completionMinutes: number;
};

export type DepositFact = { date: string; method: string; amount: number };
export type SignupFact = { date: string; signups: number; active: number };
export type OpsFact = { date: string; stuck: number; tickets: number; firstResponseMin: number; syncErrors: number };
export type SpenderRow = { id: string; username: string; totalSpent: number; orders: number; refundRatio: number; status: "aktif" | "diblokir"; balance: number };
export type ProviderMeta = { id: string; name: string; balance: number; status: "aktif" | "nonaktif"; syncStatus: "Normal" | "Terhenti" | "Gagal 3x"; lastSync: string };

export type StatsDataset = {
  daily: DailyFact[];
  deposits: DepositFact[];
  signups: SignupFact[];
  ops: OpsFact[];
  spenders: SpenderRow[];
  providers: ProviderMeta[];
  platforms: string[];
};

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDay(d);
}

const PLATFORM_MINUTES: Record<string, number> = { instagram: 95, tiktok: 70, youtube: 180, telegram: 40, facebook: 130, twitter: 110 };

let cache: StatsDataset | null = null;

export function buildStatsDataset(): StatsDataset {
  if (cache) return cache;
  const rand = rng(20261104);
  const services = seedServices().filter((s) => s.active).slice(0, 14);
  const days = Array.from({ length: STATS_DAYS }, (_, i) => addDays(STATS_TODAY, -(STATS_DAYS - 1 - i)));

  const daily: DailyFact[] = [];
  const deposits: DepositFact[] = [];
  const signups: SignupFact[] = [];
  const ops: OpsFact[] = [];

  days.forEach((date, di) => {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const weekend = weekday === 0 || weekday === 6 ? 0.78 : 1;
    const growth = 0.7 + (di / STATS_DAYS) * 0.6;
    services.forEach((s, si) => {
      const popularity = 1 / (1 + si * 0.45);
      const orders = Math.max(0, Math.round(26 * popularity * weekend * growth * (0.7 + rand() * 0.6)));
      if (orders === 0) return;
      const avgCharge = 9_000 + ((si * 7_300) % 30_000);
      const revenue = orders * avgCharge;
      // A few services sell at a thin margin or below cost, one has a high refund rate (so the filters have data).
      const costRatio = si % 5 === 2 ? 0.965 : si === 7 ? 1.04 : 0.66 + (si % 4) * 0.04;
      const refundRate = si === 3 ? 0.12 : 0.012 + (si % 3) * 0.006;
      const canceled = Math.round(orders * (si === 3 ? 0.1 : 0.02 + rand() * 0.02));
      const partial = Math.round(orders * (0.03 + rand() * 0.03));
      const failed = Math.round(orders * (si % 6 === 5 ? 0.04 : 0.008));
      const completed = Math.max(0, orders - canceled - partial - failed);
      const base = PLATFORM_MINUTES[s.platform] ?? 100;
      daily.push({
        date, serviceId: s.id, serviceName: s.name, platform: s.platform, providerId: s.providerId, orders, revenue,
        providerCost: Math.round(revenue * costRatio), refund: Math.round(revenue * refundRate), completed, partial, canceled, failed,
        completionMinutes: Math.round(completed * base * (0.8 + rand() * 0.4)),
      });
    });
    PAYMENT_METHODS.forEach((method, mi) => {
      const amount = Math.round((900_000 + rand() * 1_400_000) * (1 - mi * 0.2) * weekend * growth / 1000) * 1000;
      deposits.push({ date, method, amount });
    });
    signups.push({ date, signups: Math.round((3 + rand() * 6) * weekend * growth), active: Math.round((60 + rand() * 25) * growth) });
    ops.push({
      date, stuck: Math.round(rand() * 5 + (di > 160 ? 3 : 0)), tickets: Math.round((4 + rand() * 7) * weekend),
      firstResponseMin: Math.round(18 + rand() * 40), syncErrors: Math.round(rand() * (di > 170 ? 9 : 3)),
    });
  });

  const users = seedUsers();
  const spenders: SpenderRow[] = users
    .map((u, i) => {
      const orders = Math.max(1, Math.round(u.totalSpent / 14_000));
      return {
        id: u.id, username: u.username, totalSpent: u.totalSpent, orders,
        refundRatio: u.username === "dimas_arya" ? 0.55 : Math.round(((i * 37) % 22) + 2) / 100,
        status: u.status, balance: u.balance,
      };
    })
    .sort((a, b) => b.totalSpent - a.totalSpent);

  const providers: ProviderMeta[] = seedProviders().map((p, i) => ({
    id: p.id, name: p.name, balance: p.balance, status: p.status, lastSync: p.lastSync, syncStatus: i === 2 ? "Gagal 3x" : "Normal",
  }));

  cache = { daily, deposits, signups, ops, spenders, providers, platforms: Array.from(new Set(services.map((s) => s.platform))) };
  return cache;
}
