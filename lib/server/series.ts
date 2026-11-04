/** Dashboard series computed from the real store (orders, deposits). Empty store = zeros, never invented numbers. */
import type { AdminDb } from "@/lib/admin-data";
import { effectiveProviderCost } from "./rules";
import { dayOf, hourOf, shiftDay, todayIso } from "./time";

export type RevenuePoint = { label: string; value: number; profit: number };
export type Range = "hari" | "7" | "30";

const orderProfit = (o: AdminDb["orders"][number]) => o.charge - effectiveProviderCost(o) - o.refundedAmount;

export function revenueSeries(db: AdminDb, range: Range, now = new Date()): RevenuePoint[] {
  const today = todayIso(now);
  const paid = db.deposits.filter((d) => d.status === "berhasil");
  const orders = db.orders;
  if (range === "hari") {
    return Array.from({ length: 12 }, (_, i) => {
      const from = i * 2;
      const inBucket = (iso: string) => dayOf(iso) === today && hourOf(iso) >= from && hourOf(iso) < from + 2;
      return {
        label: `${String(from).padStart(2, "0")}.00`,
        value: paid.filter((d) => inBucket(d.createdAt)).reduce((n, d) => n + d.amount, 0),
        profit: orders.filter((o) => inBucket(o.createdAt)).reduce((n, o) => n + orderProfit(o), 0),
      };
    });
  }
  const days = range === "7" ? 7 : 30;
  return Array.from({ length: days }, (_, i) => {
    const day = shiftDay(today, -(days - 1 - i));
    const [, m, d] = day.split("-");
    return {
      label: `${Number(d)}/${Number(m)}`,
      value: paid.filter((x) => dayOf(x.createdAt) === day).reduce((n, x) => n + x.amount, 0),
      profit: orders.filter((o) => dayOf(o.createdAt) === day).reduce((n, o) => n + orderProfit(o), 0),
    };
  });
}

const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram", youtube: "YouTube", tiktok: "TikTok", twitter: "X", spotify: "Spotify", telegram: "Telegram", facebook: "Facebook",
  twitch: "Twitch", reddit: "Reddit", "website-traffic": "Website Traffic", "seo-backlink": "SEO Backlink", lainnya: "Lainnya",
};

export function ordersByPlatform(db: AdminDb, range: Range, now = new Date()): { platform: string; value: number }[] {
  const today = todayIso(now);
  const from = range === "hari" ? today : shiftDay(today, -(range === "7" ? 6 : 29));
  const counts = new Map<string, number>();
  for (const o of db.orders) {
    const day = dayOf(o.createdAt);
    if (day < from || day > today) continue;
    const label = PLATFORM_LABEL[o.platform] ?? (o.platform ? o.platform[0].toUpperCase() + o.platform.slice(1) : "Lainnya");
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()].map(([platform, value]) => ({ platform, value })).sort((a, b) => b.value - a.value);
}
