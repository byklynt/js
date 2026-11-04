/**
 * Statistics for /admin/stats, computed from the real store (see buildStatsDatasetFromDb).
 * TODO(db): replace with real queries / materialized views once there is a database (see lib/server/stats.ts).
 */
import type { AdminDb } from "@/lib/admin-data";
import { dayOf } from "@/lib/server/time";

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

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDay(d);
}

/** Statistics dataset computed from the REAL store (orders, deposits, users, tickets, sync runs). Empty store = empty dataset. */
export function buildStatsDatasetFromDb(db: AdminDb, now: Date = new Date()): StatsDataset {
  const today = dayOf(now);
  const days = Array.from({ length: STATS_DAYS }, (_, i) => addDays(today, -(STATS_DAYS - 1 - i)));
  const from = days[0];

  const dailyMap = new Map<string, DailyFact>();
  for (const o of db.orders) {
    const date = dayOf(o.createdAt);
    if (date < from || date > today) continue;
    const key = `${date}|${o.serviceId}`;
    let f = dailyMap.get(key);
    if (!f) {
      f = { date, serviceId: o.serviceId, serviceName: o.name, platform: o.platform, providerId: o.providerId, orders: 0, revenue: 0, providerCost: 0, refund: 0, completed: 0, partial: 0, canceled: 0, failed: 0, completionMinutes: 0 };
      dailyMap.set(key, f);
    }
    f.orders++;
    f.revenue += o.charge;
    f.providerCost += o.providerCost;
    f.refund += o.refundedAmount;
    if (o.status === "selesai") {
      f.completed++;
      if (o.completedAt) f.completionMinutes += Math.max(0, Math.round((new Date(o.completedAt).getTime() - new Date(o.createdAt).getTime()) / 60_000));
    } else if (o.status === "sebagian") f.partial++;
    else if (o.status === "dibatalkan") f.canceled++;
    else if (o.status === "gagal_kirim") f.failed++;
  }

  const deposits: DepositFact[] = db.deposits
    .filter((d) => d.status === "berhasil" && dayOf(d.createdAt) >= from)
    .map((d) => ({ date: dayOf(d.createdAt), method: d.method, amount: d.amount }));

  const activeBy = new Map<string, Set<string>>();
  for (const o of db.orders) {
    const d = dayOf(o.createdAt);
    (activeBy.get(d) ?? activeBy.set(d, new Set()).get(d)!).add(o.userId);
  }
  const signups: SignupFact[] = days.map((date) => ({ date, signups: db.users.filter((u) => dayOf(u.createdAt) === date).length, active: activeBy.get(date)?.size ?? 0 }));

  const firstResponse = (t: AdminDb["tickets"][number]): number | null => {
    const user = t.messages.find((m) => m.from === "user");
    const reply = t.messages.find((m) => m.from === "support");
    return user && reply ? Math.max(0, Math.round((new Date(reply.at).getTime() - new Date(user.at).getTime()) / 60_000)) : null;
  };
  const ops: OpsFact[] = days.map((date) => {
    const tickets = db.tickets.filter((t) => dayOf(t.messages[0]?.at ?? t.updatedAt) === date);
    const times = tickets.map(firstResponse).filter((n): n is number => n !== null);
    return {
      date, stuck: 0, tickets: tickets.length, firstResponseMin: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0,
      syncErrors: db.syncRuns.filter((r) => dayOf(r.startedAt) === date).reduce((n, r) => n + r.errors, 0),
    };
  });

  const spenders: SpenderRow[] = db.users
    .map((u) => {
      const mine = db.orders.filter((o) => o.userId === u.id);
      const charged = mine.reduce((n, o) => n + o.charge, 0);
      const refunded = mine.reduce((n, o) => n + o.refundedAmount, 0);
      return { id: u.id, username: u.username, totalSpent: u.totalSpent, orders: mine.length, refundRatio: charged > 0 ? Math.round((refunded / charged) * 100) / 100 : 0, status: u.status, balance: u.balance };
    })
    .sort((a, b) => b.totalSpent - a.totalSpent);

  const providers: ProviderMeta[] = db.providers.map((p) => {
    const last = db.syncRuns.filter((r) => r.providerId === p.id).slice(0, 3);
    const failing = last.length === 3 && last.every((r) => r.errors > 0);
    return { id: p.id, name: p.name, balance: p.balance, status: p.status, lastSync: p.lastSync, syncStatus: failing ? "Gagal 3x" : "Normal" };
  });

  return { daily: [...dailyMap.values()], deposits, signups, ops, spenders, providers, platforms: Array.from(new Set(db.orders.map((o) => o.platform).filter(Boolean))) };
}
