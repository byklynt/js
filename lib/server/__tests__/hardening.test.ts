import { beforeEach, describe, expect, it } from "vitest";
import { finalPrice, seedAdminDb, type AdminDb } from "@/lib/admin-data";
import * as S from "@/lib/admin-schemas";
import { ipAllowed, maintenanceBlocks, requireReauth, twoFactorGate } from "../access";
import { createRateLimiter } from "../limits";
import { findActiveDuplicate, placeOrder } from "../orders";
import { createMockProviderClient } from "../provider-client";
import { applyAutoMarkup, isThinMargin, marginPercent, thinMarginServices } from "../pricing";
import { userRisk } from "../risk";
import { generateBackupCodes, consumeBackupCode, totpAt, verifyTotp } from "../totp";

let db: AdminDb;
const sleep = async () => {};
beforeEach(() => {
  db = seedAdminDb();
});

const svc = () => db.services.find((s) => s.active && s.min <= 100 && s.max >= 100)!;
const deps = (limiter = createRateLimiter()) => ({ client: createMockProviderClient(db), sleep, limiter });

describe("duplicate-link guard", () => {
  it("blocks the same service + link while the first order is active (even written differently)", async () => {
    const input = { userId: "usr_1000", serviceId: svc().id, link: "https://example.com/p/dup", quantity: 100 };
    await placeOrder(db, input, deps());
    const balance = db.users.find((u) => u.id === "usr_1000")!.balance;
    await expect(placeOrder(db, { ...input, link: "HTTPS://Example.com/p/dup/#x" }, deps())).rejects.toThrow(/masih berjalan/);
    expect(db.users.find((u) => u.id === "usr_1000")!.balance).toBe(balance); // nothing charged
  });

  it("allows it again once the earlier order is finished", async () => {
    const input = { userId: "usr_1000", serviceId: svc().id, link: "https://example.com/p/dup2", quantity: 100 };
    const first = await placeOrder(db, input, deps());
    first.status = "selesai";
    expect(findActiveDuplicate(db, "usr_1000", input.serviceId, input.link)).toBeUndefined();
    await expect(placeOrder(db, input, deps())).resolves.toBeTruthy();
  });
});

describe("rate limit", () => {
  it("allows N hits per window, then blocks, then recovers", () => {
    const rl = createRateLimiter();
    for (let i = 0; i < 3; i++) expect(rl.hit("k", 3, 60_000, 1000 + i).allowed).toBe(true);
    const blocked = rl.hit("k", 3, 60_000, 1500);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect(rl.hit("other", 3, 60_000, 1500).allowed).toBe(true);
    expect(rl.hit("k", 3, 60_000, 62_000).allowed).toBe(true);
  });

  it("limits orders per minute per user", async () => {
    db.settings.limits.ordersPerMinute = 2;
    const limiter = createRateLimiter();
    const base = { userId: "usr_1000", serviceId: svc().id, quantity: 100 };
    await placeOrder(db, { ...base, link: "https://example.com/a1" }, deps(limiter));
    await placeOrder(db, { ...base, link: "https://example.com/a2" }, deps(limiter));
    await expect(placeOrder(db, { ...base, link: "https://example.com/a3" }, deps(limiter))).rejects.toThrow(/Terlalu banyak pesanan/);
  });
});

describe("margin flagging", () => {
  it("computes margin on the selling price and flags thin / negative ones", () => {
    const s = { providerPrice: 1000, markupType: "persen" as const, markup: 40 };
    expect(marginPercent(s)).toBeCloseTo(28.6, 1);
    expect(isThinMargin({ providerPrice: 1000, markupType: "persen", markup: 2 }, 5)).toBe(true);
    expect(marginPercent({ providerPrice: 1000, markupType: "tetap", markup: -200 })).toBeLessThan(0);
  });

  it("auto markup lifts flagged services to the minimum and records a price update", () => {
    const s = db.services[0];
    s.markupType = "persen";
    s.markup = 1;
    expect(thinMarginServices(db).some((x) => x.id === s.id)).toBe(true);
    const before = db.priceUpdates.length;
    const changes = applyAutoMarkup(db, [s.id]);
    expect(changes).toHaveLength(1);
    expect(marginPercent(s)).toBeGreaterThanOrEqual(db.settings.pricing.minMarginPercent);
    expect(finalPrice(s)).toBe(changes[0].newPrice);
    expect(db.priceUpdates.length).toBe(before + 1);
  });

  it("flags users with a high cancel / refund share (only with enough orders)", () => {
    const flagged = db.users.find((u) => u.username === "dimas_arya")!;
    expect(userRisk(db, flagged.id).flagged).toBe(true);
    expect(userRisk(db, "usr_1000").flagged).toBe(false);
  });
});

describe("2FA gate", () => {
  it("blocks admins without 2FA when it is required", () => {
    expect(twoFactorGate(true, undefined)).toBe("setup_required");
    expect(twoFactorGate(true, { secretEnc: "X", enabled: false, enabledAt: null, backupHashes: [], lastUsedStep: 0 })).toBe("setup_required");
    expect(twoFactorGate(true, { secretEnc: "X", enabled: true, enabledAt: null, backupHashes: [], lastUsedStep: 0 })).toBe("ok");
    expect(twoFactorGate(false, undefined)).toBe("ok");
  });

  it("verifies real TOTP codes (with drift) and single-use backup codes", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const now = 1_700_000_000_000;
    expect(verifyTotp(secret, totpAt(secret, now), now)).toBe(true);
    expect(verifyTotp(secret, totpAt(secret, now - 30_000), now)).toBe(true);
    expect(verifyTotp(secret, totpAt(secret, now - 120_000), now)).toBe(false);
    expect(verifyTotp(secret, "123456", now)).toBe(totpAt(secret, now) === "123456");
    const { plain, hashes } = generateBackupCodes(3);
    const left = consumeBackupCode(hashes, plain[0])!;
    expect(left).toHaveLength(2);
    expect(consumeBackupCode(left, plain[0])).toBeNull(); // already used
  });

  it("IP allowlist: empty = off, exact and CIDR match", () => {
    expect(ipAllowed([], "1.2.3.4")).toBe(true);
    expect(ipAllowed(["203.0.113.0/24"], "203.0.113.77")).toBe(true);
    expect(ipAllowed(["203.0.113.0/24"], "198.51.100.1")).toBe(false);
    expect(ipAllowed(["127.0.0.1"], "::1")).toBe(true);
  });
});

describe("re-authentication on money actions", () => {
  const withoutPassword = (schema: { safeParse: (v: unknown) => { success: boolean } }, data: object) => schema.safeParse(data).success;

  it("schemas reject a missing password", () => {
    expect(withoutPassword(S.adjustBalanceSchema, { userId: "u", direction: "tambah", amount: 1000, reason: "koreksi saldo" })).toBe(false);
    expect(withoutPassword(S.refundCreateSchema, { orderId: "1", amount: 1000, reason: "alasan cukup panjang" })).toBe(false);
    expect(withoutPassword(S.bulkMarkupSchema, { scope: "semua", markupType: "persen", markup: 10 })).toBe(false);
    expect(withoutPassword(S.announcementDeleteSchema, { id: "a", confirm: "HAPUS" })).toBe(false);
    expect(withoutPassword(S.depositConfirmSchema, { id: "d" })).toBe(false);
    expect(withoutPassword(S.autoMarkupSchema, {})).toBe(false);
    expect(withoutPassword(S.ipAllowlistSchema, { ips: [] })).toBe(false);
  });

  it("requireReauth only passes with the right password", () => {
    const verify = (p: string) => p === "benar";
    expect(requireReauth(verify, undefined)).toBe(false);
    expect(requireReauth(verify, "salah")).toBe(false);
    expect(requireReauth(verify, "benar")).toBe(true);
  });
});

describe("maintenance mode", () => {
  it("blocks users and visitors but never admins", () => {
    expect(maintenanceBlocks(true, "user")).toBe(true);
    expect(maintenanceBlocks(true, null)).toBe(true);
    expect(maintenanceBlocks(true, "admin")).toBe(false);
    expect(maintenanceBlocks(false, "user")).toBe(false);
  });
});
