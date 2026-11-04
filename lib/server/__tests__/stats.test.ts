import { describe, expect, it } from "vitest";
import { type DailyFact, type StatsDataset } from "@/lib/admin-stats-data";
import {
  computeStats, dailyFinance, deltaPercent, depositsByMethod, filterDaily, financeSummary, marginPercent, previousPeriod, profitOf,
  providerStats, ratePercent, resolveRange, topServices,
} from "../stats";

const fact = (p: Partial<DailyFact>): DailyFact => ({
  date: "2026-11-01", serviceId: "1", serviceName: "Layanan", platform: "instagram", providerId: "prv_1", orders: 10, revenue: 100_000, providerCost: 70_000,
  refund: 5_000, completed: 8, partial: 1, canceled: 1, failed: 0, completionMinutes: 800, ...p,
});

describe("profit and margin", () => {
  it("profit = revenue - provider cost - refunds", () => {
    expect(profitOf(100_000, 70_000, 5_000)).toBe(25_000);
    expect(profitOf(100_000, 104_000, 0)).toBe(-4_000); // selling below cost
  });
  it("margin % is profit / revenue and never divides by zero", () => {
    expect(marginPercent(100_000, 25_000)).toBe(25);
    expect(marginPercent(0, 0)).toBe(0);
    expect(marginPercent(0, -500)).toBe(0);
    expect(marginPercent(300, 100)).toBe(33.3);
  });
  it("sums a period", () => {
    const s = financeSummary([fact({}), fact({ revenue: 50_000, providerCost: 30_000, refund: 0 })]);
    expect(s).toMatchObject({ revenue: 150_000, providerCost: 100_000, refund: 5_000, profit: 45_000, orders: 20 });
    expect(s.margin).toBe(30);
  });
  it("an empty period is all zeros", () => {
    expect(financeSummary([])).toEqual({ revenue: 0, providerCost: 0, refund: 0, profit: 0, margin: 0, orders: 0 });
  });
});

describe("delta vs previous period", () => {
  it("computes percent change", () => {
    expect(deltaPercent(120, 100)).toBe(20);
    expect(deltaPercent(80, 100)).toBe(-20);
    expect(deltaPercent(-50, -100)).toBe(50);
  });
  it("handles a previous period of zero", () => {
    expect(deltaPercent(0, 0)).toBe(0);
    expect(deltaPercent(500, 0)).toBeNull(); // nothing to compare with: no fake percentage
  });
  it("the previous period has the same length and ends the day before", () => {
    expect(previousPeriod("2026-11-01", "2026-11-07")).toEqual({ from: "2026-10-25", to: "2026-10-31" });
    expect(previousPeriod("2026-11-04", "2026-11-04")).toEqual({ from: "2026-11-03", to: "2026-11-03" });
  });
});

describe("rates", () => {
  it("success rate and refund rate", () => {
    expect(ratePercent(8, 10)).toBe(80);
    expect(ratePercent(5_000, 100_000)).toBe(5);
    expect(ratePercent(1, 3)).toBe(33.3);
  });
  it("zero total gives 0, not NaN", () => {
    expect(ratePercent(0, 0)).toBe(0);
    expect(ratePercent(5, 0)).toBe(0);
  });
  it("provider stats: success, partial, cancel rate and zero-order providers", () => {
    const rows = providerStats([fact({}), fact({ providerId: "prv_2", orders: 0, completed: 0, partial: 0, canceled: 0, completionMinutes: 0 })], [
      { id: "prv_1", name: "A", balance: 1, status: "aktif", syncStatus: "Normal", lastSync: "" },
      { id: "prv_2", name: "B", balance: 1, status: "aktif", syncStatus: "Normal", lastSync: "" },
      { id: "prv_3", name: "C", balance: 1, status: "aktif", syncStatus: "Normal", lastSync: "" },
    ]);
    expect(rows[0]).toMatchObject({ orders: 10, successRate: 80, partialRate: 10, cancelRate: 10, avgMinutes: 100 });
    expect(rows[1]).toMatchObject({ orders: 0, successRate: 0, avgMinutes: 0 });
    expect(rows[2].orders).toBe(0);
  });
  it("top services flag thin / negative margin and high refund rate", () => {
    const rows = topServices([
      fact({ serviceId: "a", revenue: 100_000, providerCost: 97_000, refund: 0 }),
      fact({ serviceId: "b", revenue: 100_000, providerCost: 60_000, refund: 12_000 }),
      fact({ serviceId: "c", revenue: 100_000, providerCost: 60_000, refund: 1_000 }),
    ]);
    const by = Object.fromEntries(rows.map((r) => [r.serviceId, r]));
    expect(by.a.thin).toBe(true);
    expect(by.b.highRefund).toBe(true);
    expect(by.c.thin || by.c.highRefund).toBe(false);
  });
});

describe("series and filters", () => {
  it("fills days without data with zeros", () => {
    const s = dailyFinance([fact({ date: "2026-11-02" })], "2026-11-01", "2026-11-03");
    expect(s.map((x) => x.revenue)).toEqual([0, 100_000, 0]);
    expect(s[0].margin).toBe(0);
  });
  it("income by payment method keeps every method key", () => {
    const rows = depositsByMethod([{ date: "2026-11-01", method: "QRIS", amount: 5000 }], "2026-11-01", "2026-11-02", ["QRIS", "E-Wallet"]);
    expect(rows[0]).toMatchObject({ QRIS: 5000, "E-Wallet": 0 });
    expect(rows[1]).toMatchObject({ QRIS: 0 });
  });
  it("filters by provider and platform", () => {
    const facts = [fact({}), fact({ providerId: "prv_2" }), fact({ platform: "tiktok" })];
    expect(filterDaily(facts, { from: "2026-11-01", to: "2026-11-01", provider: "prv_2", platform: "semua" })).toHaveLength(1);
    expect(filterDaily(facts, { from: "2026-11-01", to: "2026-11-01", platform: "tiktok" })).toHaveLength(1);
    expect(filterDaily(facts, { from: "2026-11-02", to: "2026-11-03" })).toHaveLength(0);
  });
  it("resolves ranges", () => {
    expect(resolveRange({ range: "7" }, "2026-11-04")).toEqual({ from: "2026-10-29", to: "2026-11-04" });
    expect(resolveRange({ range: "bulan" }, "2026-11-04")).toEqual({ from: "2026-11-01", to: "2026-11-04" });
    expect(resolveRange({ range: "hari" }, "2026-11-04")).toEqual({ from: "2026-11-04", to: "2026-11-04" });
    expect(resolveRange({ range: "kustom", from: "2026-10-10", to: "2026-10-01" }, "2026-11-04")).toEqual({ from: "2026-10-01", to: "2026-10-10" });
    expect(resolveRange({ range: "kustom", from: "bukan-tanggal" }, "2026-11-04").to).toBe("2026-11-04");
  });
});

/** A small hand-made dataset (the app has no demo data): one healthy service, one thin-margin one, one with many refunds. */
function fixtureDataset(): StatsDataset {
  const days = Array.from({ length: 30 }, (_, i) => `2026-10-${String(6 + i > 31 ? 6 + i - 31 : 6 + i).padStart(2, "0")}`.replace(/^2026-10-0([1-5])$/, "2026-11-0$1"));
  const daily: DailyFact[] = days.flatMap((date) => [
    fact({ date, serviceId: "1", platform: "instagram", providerId: "prv_1" }),
    fact({ date, serviceId: "2", platform: "tiktok", providerId: "prv_1", providerCost: 98_000 }),
    fact({ date, serviceId: "3", platform: "youtube", providerId: "prv_2", refund: 30_000, canceled: 4, completed: 5 }),
  ]);
  return {
    daily, deposits: days.map((date) => ({ date, method: "QRIS", amount: 500_000 })), signups: days.map((date) => ({ date, signups: 2, active: 5 })),
    ops: days.map((date) => ({ date, stuck: 0, tickets: 1, firstResponseMin: 10, syncErrors: 0 })),
    spenders: [{ id: "u1", username: "tester", totalSpent: 1_000_000, orders: 10, refundRatio: 0.6, status: "aktif", balance: 50_000 }],
    providers: [{ id: "prv_1", name: "P1", balance: 1_000_000, status: "aktif", syncStatus: "Normal", lastSync: "2026-11-04T08:00:00+07:00" }, { id: "prv_2", name: "P2", balance: 1_000, status: "aktif", syncStatus: "Normal", lastSync: "2026-11-04T08:00:00+07:00" }],
    platforms: ["instagram", "tiktok", "youtube"],
  };
}

describe("computeStats on a fixture dataset", () => {
  const ds = fixtureDataset();
  const base = { range: "30" as const, provider: "semua", platform: "semua", compare: true };

  it("Keuangan: cards agree with the daily series and carry a delta only when comparing", () => {
    const r = computeStats(ds, "keuangan", base, "2026-11-04").keuangan!;
    const rev = r.cards.find((c) => c.key === "revenue")!;
    expect(rev.value).toBe(r.series.reduce((s, x) => s + x.revenue, 0));
    expect(r.cards.find((c) => c.key === "profit")!.value).toBe(rev.value - r.cards.find((c) => c.key === "cost")!.value - r.cards.find((c) => c.key === "refund")!.value);
    expect(rev.delta).not.toBeUndefined();
    const off = computeStats(ds, "keuangan", { ...base, compare: false }, "2026-11-04").keuangan!;
    expect(off.cards.every((c) => c.delta === null)).toBe(true);
  });
  it("an empty period (before the data starts) gives zeros, not NaN", () => {
    const r = computeStats(ds, "keuangan", { ...base, range: "kustom", from: "2020-01-01", to: "2020-01-07" }, "2026-11-04").keuangan!;
    expect(r.cards.every((c) => Number.isFinite(c.value) && c.value === 0)).toBe(true);
    expect(r.cards.find((c) => c.key === "revenue")!.delta).toBe(0);
  });
  it("Provider tab respects the provider filter", () => {
    const r = computeStats(ds, "provider", { ...base, provider: "prv_1" }, "2026-11-04").provider!;
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].successRate).toBeGreaterThan(0);
  });
  it("Layanan tab contains flagged services", () => {
    const r = computeStats(ds, "layanan", { ...base, range: "90" }, "2026-11-04").layanan!;
    expect(r.rows.some((x) => x.thin)).toBe(true);
    expect(r.rows.some((x) => x.highRefund)).toBe(true);
    expect(r.top10.length).toBeLessThanOrEqual(10);
  });
});
