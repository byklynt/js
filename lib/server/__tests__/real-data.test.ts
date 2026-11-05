import { describe, expect, it } from "vitest";
import { createEmptyDb, type AdminDb, type AdminOrder } from "@/lib/admin-data";
import { buildStatsDatasetFromDb } from "@/lib/admin-stats-data";
import { features } from "@/lib/features";
import { siteConfig } from "@/lib/site-config";
import { ordersByPlatform, revenueSeries } from "../series";
import { todayFinance } from "../metrics";
import { effectiveProviderCost } from "../rules";
import { createDepositRequest, creditDeposit } from "../deposits";
import { dayOf } from "../time";

const now = new Date("2026-11-04T10:00:00+07:00");

describe("a first-run database has no demo data", () => {
  const db = createEmptyDb();
  it("starts with nothing but settings and the (empty) Likeo row", () => {
    expect(db.users).toEqual([]);
    expect(db.orders).toEqual([]);
    expect(db.services).toEqual([]);
    expect(db.deposits).toEqual([]);
    expect(db.tickets).toEqual([]);
    expect(db.ledger).toEqual([]);
    expect(db.announcements).toEqual([]);
    expect(db.auditLogs).toEqual([]);
    expect(db.notifications).toEqual([]);
    expect(db.providers).toHaveLength(1);
    expect(db.providers[0]).toMatchObject({ id: "5c1e0a00-0000-4000-8000-00000000e001", kind: "likeo", balance: 0, lastTest: null });
    expect(db.providers[0].balanceNative).toBeUndefined();
    expect(db.settings.general.maintenance).toBe(false);
    expect(db.settings.cancelPolicy).toMatchObject({ minAgeHours: 72, refundPercent: 50 });
    expect(db.settings.payments.bonusTiers).toEqual([]);
  });
  it("dashboard numbers are zeros, never NaN", () => {
    for (const range of ["hari", "7", "30"] as const) {
      const series = revenueSeries(db, range, now);
      expect(series.length).toBeGreaterThan(0);
      expect(series.every((p) => p.value === 0 && p.profit === 0 && Number.isFinite(p.value))).toBe(true);
      expect(ordersByPlatform(db, range, now)).toEqual([]);
    }
    expect(todayFinance(db, "2026-11-04")).toEqual({ revenue: 0, cost: 0, refunds: 0, profit: 0 });
    const ds = buildStatsDatasetFromDb(db, now);
    expect(ds.daily).toEqual([]);
    expect(ds.spenders).toEqual([]);
    expect(ds.deposits).toEqual([]);
  });
  it("social proof is a flag (landing copy only) and feature flags stay off", () => {
    expect(typeof siteConfig.showSocialProof).toBe("boolean");
    expect(Object.values(features).every((v) => v === false)).toBe(true);
  });
});

describe("profit uses what the provider really charged", () => {
  const base = { providerCost: 1000, quantity: 1000, remains: 0 };
  it("cancelled and failed orders cost nothing, partial ones only the delivered share", () => {
    expect(effectiveProviderCost({ ...base, status: "selesai" })).toBe(1000);
    expect(effectiveProviderCost({ ...base, status: "dibatalkan", remains: 1000 })).toBe(0);
    expect(effectiveProviderCost({ ...base, status: "gagal_kirim", remains: 1000 })).toBe(0);
    expect(effectiveProviderCost({ ...base, status: "sebagian", remains: 250 })).toBe(750);
  });
  it("a fully refunded cancelled order shows zero profit, not a loss", () => {
    const db: AdminDb = createEmptyDb();
    const o = { id: "1", charge: 1400, providerCost: 1000, quantity: 1000, remains: 1000, status: "dibatalkan", refundedAmount: 1400, createdAt: now.toISOString(), platform: "instagram" } as AdminOrder;
    db.orders.push(o);
    const today = dayOf(now);
    expect(revenueSeries(db, "30", now).reduce((n, p) => n + p.profit, 0)).toBe(0);
    db.refunds.push({ id: "r1", orderId: "1", userId: "u", username: "u", amount: 1400, reason: "dibatalkan", source: "auto", status: "selesai", processedBy: "system", rejectReason: null, note: null, createdAt: now.toISOString(), processedAt: now.toISOString(), reversed: false } as unknown as AdminDb["refunds"][number]);
    const f = todayFinance(db, today);
    expect(f).toMatchObject({ revenue: 1400, cost: 0, refunds: 1400, profit: 0 });
  });
});

// User accounts now live in Supabase Auth: covered by the pgTAP tests (supabase/tests/database) and the Playwright e2e run.
