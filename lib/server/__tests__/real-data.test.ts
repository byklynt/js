import { describe, expect, it } from "vitest";
import { createEmptyDb, type AdminDb, type AdminOrder } from "@/lib/admin-data";
import { buildStatsDatasetFromDb } from "@/lib/admin-stats-data";
import { features } from "@/lib/features";
import { siteConfig } from "@/lib/site-config";
import { ordersByPlatform, revenueSeries } from "../series";
import { todayFinance } from "../metrics";
import { effectiveProviderCost } from "../rules";
import { createDepositRequest, creditDeposit } from "../deposits";
import { changeUserEmail, changeUserPassword, registerUser, verifyUserLogin, type Credentials } from "../user-auth";
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
    expect(db.providers[0]).toMatchObject({ id: "prv_likeo", kind: "likeo", balance: 0, lastTest: null });
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

describe("user accounts", () => {
  const fresh = () => ({ db: createEmptyDb(), creds: {} as Credentials });
  const input = { username: "budi_uji", email: "budi@contoh.test", password: "Rahasia123!" };

  it("signup creates a user with Rp0 and an empty ledger, and the password is hashed", () => {
    const { db, creds } = fresh();
    const u = registerUser(db, creds, input, now);
    expect(u).toMatchObject({ balance: 0, totalSpent: 0, status: "aktif", rank: "Starter", reseller: false });
    expect(db.ledger).toEqual([]);
    expect(creds[u.id].passwordHash).not.toContain("Rahasia123!");
    expect(verifyUserLogin(db, creds, "budi_uji", "Rahasia123!")?.id).toBe(u.id);
    expect(verifyUserLogin(db, creds, "BUDI@contoh.test", "Rahasia123!")?.id).toBe(u.id);
    expect(verifyUserLogin(db, creds, "budi_uji", "salah")).toBeNull();
    expect(verifyUserLogin(db, creds, "tidak-ada", "Rahasia123!")).toBeNull();
  });
  it("rejects bad or duplicate input with Indonesian messages", () => {
    const { db, creds } = fresh();
    expect(() => registerUser(db, creds, { ...input, username: "ab" }, now)).toThrow("Username");
    expect(() => registerUser(db, creds, { ...input, email: "bukan-email" }, now)).toThrow("email");
    expect(() => registerUser(db, creds, { ...input, password: "pendek" }, now)).toThrow("Password minimal");
    registerUser(db, creds, input, now);
    expect(() => registerUser(db, creds, { ...input, email: "lain@contoh.test" }, now)).toThrow("Username sudah dipakai");
    expect(() => registerUser(db, creds, { ...input, username: "lain_uji" }, now)).toThrow("Email sudah terdaftar");
  });
  it("changing the password needs the current one; changing the e-mail needs the password and a free address", () => {
    const { db, creds } = fresh();
    const u = registerUser(db, creds, input, now);
    registerUser(db, creds, { username: "siti_uji", email: "siti@contoh.test", password: "Rahasia123!" }, now);
    expect(() => changeUserPassword(db, creds, u.id, "salah", "BaruRahasia456!")).toThrow("Password saat ini salah");
    expect(() => changeUserPassword(db, creds, u.id, "Rahasia123!", "pendek")).toThrow("minimal");
    changeUserPassword(db, creds, u.id, "Rahasia123!", "BaruRahasia456!");
    expect(verifyUserLogin(db, creds, "budi_uji", "Rahasia123!")).toBeNull();
    expect(verifyUserLogin(db, creds, "budi_uji", "BaruRahasia456!")).not.toBeNull();
    expect(() => changeUserEmail(db, creds, u.id, "salah", "x@contoh.test")).toThrow("Password salah");
    expect(() => changeUserEmail(db, creds, u.id, "BaruRahasia456!", "siti@contoh.test")).toThrow("sudah terdaftar");
    changeUserEmail(db, creds, u.id, "BaruRahasia456!", "baru@contoh.test");
    expect(db.users.find((x) => x.id === u.id)!.email).toBe("baru@contoh.test");
  });
});

describe("manual deposit requests (no payment gateway yet)", () => {
  const setup = () => {
    const db = createEmptyDb();
    const creds: Credentials = {};
    const u = registerUser(db, creds, { username: "dep_uji", email: "dep@contoh.test", password: "Rahasia123!" }, now);
    return { db, u };
  };
  it("creates a pending row that does NOT touch the balance until an admin confirms", () => {
    const { db, u } = setup();
    const d = createDepositRequest(db, { userId: u.id, amount: 50_000, methodId: "manual" }, now);
    expect(d).toMatchObject({ status: "menunggu", amount: 50_000, method: "Transfer manual", userId: u.id });
    expect(db.users[0].balance).toBe(0);
    creditDeposit(db, { depositId: d.id, externalId: null, by: "adm_1" }, now);
    expect(db.users[0].balance).toBe(50_000);
    expect(creditDeposit(db, { depositId: d.id, externalId: null, by: "adm_1" }, now).duplicate).toBe(true);
    expect(db.users[0].balance).toBe(50_000);
  });
  it("validates amount, method and the number of pending requests", () => {
    const { db, u } = setup();
    expect(() => createDepositRequest(db, { userId: u.id, amount: 500, methodId: "manual" })).toThrow("Minimal deposit");
    expect(() => createDepositRequest(db, { userId: u.id, amount: 50_000, methodId: "qris" })).toThrow("Metode pembayaran tidak tersedia");
    for (let i = 0; i < 5; i++) createDepositRequest(db, { userId: u.id, amount: 10_000, methodId: "manual" });
    expect(() => createDepositRequest(db, { userId: u.id, amount: 10_000, methodId: "manual" })).toThrow("menunggu konfirmasi");
  });
});
