import { beforeEach, describe, expect, it } from "vitest";
import { seedAdminDb, type AdminDb, type AdminOrder } from "@/lib/admin-data";
import { cancelPolicyBullet, cancelPolicySentences, formatCountdown, nextRuleVersion, ruleKeyFor } from "@/lib/order-rules";
import { createRateLimiter } from "../limits";
import { placeOrder } from "../orders";
import { createMockProviderClient } from "../provider-client";
import { approveRefund, autoRefundForOrder, refundMismatches, rejectRefund } from "../refunds";
import { requestCancel } from "../requests";
import { cancelEligibility, computeExpectedRefund, computeUserCancelRefund } from "../rules";
import { syncOrders } from "../sync";

const HOUR = 3_600_000;
let db: AdminDb;
let order: AdminOrder;
let t0: Date;

beforeEach(() => {
  db = seedAdminDb();
  // A fresh running order of the mock user on a service that allows cancel, created at t0.
  const service = db.services.find((s) => s.cancel && s.active)!;
  t0 = new Date("2026-11-01T00:00:00Z");
  order = { ...db.orders.find((o) => o.userId === "usr_1000")! };
  Object.assign(order, {
    id: "9990001", serviceId: service.id, status: "berjalan", createdAt: t0.toISOString(), charge: 10_001, quantity: 1000, remains: 600,
    refundedAmount: 0, cancelledBy: null, cancelPolicyPercent: null, providerOrderId: "PRV-T1",
  });
  db.orders.unshift(order);
  db.providerOrders["PRV-T1"] = { status: "In progress", startCount: 0, remains: 600 };
  db.cancelRequests = [];
  db.refunds = db.refunds.filter((r) => r.orderId !== order.id);
});

const at = (hours: number) => new Date(t0.getTime() + hours * HOUR);
const startingBalance = () => db.users.find((u) => u.id === "usr_1000")!.balance;
const approve = (id: string, now = at(80), opts = {}) => approveRefund(db, id, "adm_1", now, opts);

describe("order rules: implied acceptance (no checkbox)", () => {
  const input = () => {
    const service = db.services.find((s) => s.active && s.min <= 100 && s.max >= 100)!;
    return { userId: "usr_1000", serviceId: service.id, link: "https://example.com/p/rules", quantity: 100, service };
  };
  const deps = () => ({ client: createMockProviderClient(db), sleep: async () => {}, limiter: createRateLimiter() });

  it("an order is NOT rejected for a missing checkbox / version and stores the CURRENT rules version and time", async () => {
    const { service, ...base } = input();
    const key = ruleKeyFor(service.platform);
    db.settings.orderRules[key].version = "v7";
    const o = await placeOrder(db, base, { ...deps(), now: () => at(1) });
    expect(o.acceptedRulesVersion).toBe("v7");
    expect(o.acceptedAt).toBe(at(1).toISOString());
  });

  it("a version sent by the client is ignored (never trusted)", async () => {
    const { service, ...base } = input();
    const key = ruleKeyFor(service.platform);
    db.settings.orderRules[key].version = "v3";
    const o = await placeOrder(db, { ...base, acceptedRulesVersion: "v1" } as never, deps());
    expect(o.acceptedRulesVersion).toBe("v3");
  });

  it("after an admin edit the next order carries the new version", async () => {
    const { service, ...base } = input();
    const key = ruleKeyFor(service.platform);
    const first = await placeOrder(db, base, deps());
    db.settings.orderRules[key].version = nextRuleVersion(db.settings.orderRules[key].version);
    const second = await placeOrder(db, { ...base, link: "https://example.com/p/rules2" }, deps());
    expect(second.acceptedRulesVersion).not.toBe(first.acceptedRulesVersion);
    expect(second.acceptedRulesVersion).toBe(db.settings.orderRules[key].version);
  });

  it("rule versions bump and unknown platforms use the generic rules", () => {
    expect(nextRuleVersion("v1")).toBe("v2");
    expect(nextRuleVersion("v9")).toBe("v10");
    expect(nextRuleVersion("x")).toBe("v2");
    expect(ruleKeyFor("website-traffic")).toBe("other");
    expect(ruleKeyFor("Instagram")).toBe("instagram");
    expect(db.settings.orderRules.instagram.bullets.join(" ")).toMatch(/publik/);
    expect(db.settings.orderRules.instagram.bullets.join(" ")).toMatch(/tinjau/);
  });
});

describe("user cancel: age rule", () => {
  const service = () => db.services.find((s) => s.id === order.serviceId);
  const check = (now: Date) => cancelEligibility(order, service(), db.cancelRequests, now, db.settings.cancelPolicy);

  it("is blocked before 72 hours and tells when it opens", () => {
    const r = check(at(71.99));
    expect(r.allowed).toBe(false);
    expect(r.availableAt).toBe(at(72).toISOString());
    expect(() => requestCancel(db, "usr_1000", order.id, at(71))).toThrow(/belum bisa diajukan/);
    expect(db.cancelRequests).toHaveLength(0);
    expect(db.refunds.some((x) => x.orderId === order.id)).toBe(false);
  });

  it("is allowed exactly at 72 hours", () => {
    expect(check(at(72)).allowed).toBe(true);
    const req = requestCancel(db, "usr_1000", order.id, at(72));
    expect(req).toMatchObject({ status: "menunggu", ageHours: 72, remainsAtRequest: 600, policyPercent: 50 });
  });

  it("still needs: a service that allows cancel, an unfinished order, and no open request", () => {
    expect(cancelEligibility(order, { cancel: false, refill: false, refillDays: null }, [], at(100), db.settings.cancelPolicy).allowed).toBe(false);
    expect(cancelEligibility({ ...order, status: "selesai" }, service(), [], at(100), db.settings.cancelPolicy).allowed).toBe(false);
    expect(cancelEligibility({ ...order, status: "dibatalkan" }, service(), [], at(100), db.settings.cancelPolicy).allowed).toBe(false);
    requestCancel(db, "usr_1000", order.id, at(80));
    expect(check(at(90)).allowed).toBe(false);
    expect(() => requestCancel(db, "usr_1000", order.id, at(90))).toThrow(/masih diproses/);
  });

  it("reads the age from the settings, not from a constant", () => {
    db.settings.cancelPolicy.minAgeHours = 24;
    expect(check(at(24)).allowed).toBe(true);
    expect(check(at(23)).allowed).toBe(false);
    db.settings.cancelPolicy.minAgeHours = 100;
    expect(check(at(99)).allowed).toBe(false);
    expect(check(at(100)).allowed).toBe(true);
  });

  it("formats the countdown", () => {
    expect(formatCountdown(2 * HOUR + 14 * 60_000)).toBe("2 jam 14 menit");
    expect(formatCountdown(26 * HOUR + 5 * 60_000)).toBe("1 hari 2 jam");
    expect(formatCountdown(40 * 60_000)).toBe("40 menit");
    expect(formatCountdown(0)).toBe("0 menit");
  });
});

describe("user cancel: refund = 50% of the undelivered part", () => {
  it("floor(charge * remains / quantity * 0.5), rounding down", () => {
    // 10001 * 600 / 1000 * 0.5 = 3000.3 -> 3000
    expect(computeUserCancelRefund({ charge: 10_001, quantity: 1000, remains: 600 }, 50)).toBe(3000);
    // 999 * 1/3 * 0.5 = 166.5 -> 166
    expect(computeUserCancelRefund({ charge: 999, quantity: 3, remains: 1 }, 50)).toBe(166);
    expect(computeUserCancelRefund({ charge: 5000, quantity: 100, remains: 100 }, 50)).toBe(2500); // nothing delivered
    expect(computeUserCancelRefund({ charge: 5000, quantity: 100, remains: 0 }, 50)).toBe(0); // all delivered
    expect(computeUserCancelRefund({ charge: 5000, quantity: 0, remains: 10 }, 50)).toBe(0); // no division by zero
  });

  it("never exceeds charge minus what was already refunded", () => {
    expect(computeUserCancelRefund({ charge: 1000, quantity: 10, remains: 10, refundedAmount: 800 }, 100)).toBe(200);
    expect(computeUserCancelRefund({ charge: 1000, quantity: 10, remains: 10, refundedAmount: 1000 }, 50)).toBe(0);
  });

  it("the percent comes from the settings", () => {
    db.settings.cancelPolicy.refundPercent = 25;
    const req = requestCancel(db, "usr_1000", order.id, at(80));
    expect(req.policyPercent).toBe(25);
    expect(req.calculatedRefund).toBe(1500); // floor(10001 * 0.6 * 0.25) = 1500
  });

  it("the request waits in the admin queue (menunggu, manual, with the numbers) and moves no money", () => {
    const before = startingBalance();
    const req = requestCancel(db, "usr_1000", order.id, at(80));
    const refund = db.refunds.find((r) => r.cancelRequestId === req.id)!;
    expect(refund).toMatchObject({ reason: "user_cancel", source: "user_request", status: "menunggu", amount: 3000, policyPercent: 50 });
    expect(refund.note).toMatch(/usia 80 jam/);
    expect(startingBalance()).toBe(before);
    expect(order.status).toBe("berjalan");
  });

  it("approval applies the formula to the current order, cancels it and credits once", () => {
    const before = startingBalance();
    const req = requestCancel(db, "usr_1000", order.id, at(80));
    const refund = db.refunds.find((r) => r.cancelRequestId === req.id)!;
    order.remains = 400; // more got delivered while the request waited: the formula uses the CURRENT state
    const res = approve(refund.id);
    expect(res.duplicate).toBe(false);
    expect(refund).toMatchObject({ status: "selesai", amount: 2000, policyPercent: 50 }); // floor(10001 * 0.4 * 0.5)
    expect(order).toMatchObject({ status: "dibatalkan", cancelledBy: "user", cancelPolicyPercent: 50, refundedAmount: 2000 });
    expect(db.cancelRequests[0].status).toBe("selesai");
    expect(startingBalance()).toBe(before + 2000);
    expect(refundMismatches(db).some((m) => m.orderId === order.id)).toBe(false);
  });

  it("approving twice creates one refund and one ledger entry", () => {
    const before = startingBalance();
    const req = requestCancel(db, "usr_1000", order.id, at(80));
    const refund = db.refunds.find((r) => r.cancelRequestId === req.id)!;
    approve(refund.id);
    const again = approve(refund.id, at(81));
    expect(again.duplicate).toBe(true);
    expect(db.refunds.filter((r) => r.orderId === order.id && r.reason === "user_cancel")).toHaveLength(1);
    expect(db.ledger.filter((l) => l.type === "refund" && l.refId === refund.id)).toHaveLength(1);
    expect(startingBalance()).toBe(before + 3000);
    expect(order.refundedAmount).toBe(3000);
  });

  it("an automatic refund never adds the 100% on top of a user cancellation", () => {
    const req = requestCancel(db, "usr_1000", order.id, at(80));
    approve(db.refunds.find((r) => r.cancelRequestId === req.id)!.id);
    expect(autoRefundForOrder(db, order.id, at(90))).toEqual({ refund: null, created: false });
    expect(order.refundedAmount).toBe(3000);
  });

  it("rejecting needs a reason, notifies the user and closes the request", () => {
    const req = requestCancel(db, "usr_1000", order.id, at(80));
    const refund = db.refunds.find((r) => r.cancelRequestId === req.id)!;
    expect(() => rejectRefund(db, refund.id, "adm_1", "  ", at(81))).toThrow(/Alasan penolakan/);
    rejectRefund(db, refund.id, "adm_1", "Pesanan hampir selesai.", at(81));
    expect(refund.status).toBe("ditolak");
    expect(db.cancelRequests[0]).toMatchObject({ status: "ditolak", rejectReason: "Pesanan hampir selesai." });
    expect(order.status).toBe("berjalan");
    expect(() => requestCancel(db, "usr_1000", order.id, at(82))).not.toThrow(); // can ask again later
  });

  it("an order that already finished cannot be cancelled by approval", () => {
    const req = requestCancel(db, "usr_1000", order.id, at(80));
    order.status = "selesai";
    expect(() => approve(db.refunds.find((r) => r.cancelRequestId === req.id)!.id)).toThrow(/sudah selesai/);
  });
});

describe("admin override", () => {
  it("needs a written reason, stays within charge - refunded, and is not flagged as a mismatch", () => {
    const req = requestCancel(db, "usr_1000", order.id, at(80));
    const refund = db.refunds.find((r) => r.cancelRequestId === req.id)!;
    expect(() => approve(refund.id, at(81), { overrideAmount: 5000 })).toThrow(/Alasan mengubah nominal/);
    expect(() => approve(refund.id, at(81), { overrideAmount: 20_000, overrideReason: "Kompensasi gangguan provider" })).toThrow(/melebihi sisa/);
    expect(refund.status).toBe("menunggu"); // nothing happened
    approve(refund.id, at(81), { overrideAmount: 5000, overrideReason: "Kompensasi gangguan provider" });
    expect(refund).toMatchObject({ amount: 5000, overridden: true, status: "selesai" });
    expect(order.refundedAmount).toBe(5000);
    expect(refundMismatches(db).some((m) => m.orderId === order.id)).toBe(false);
  });
});

describe("provider-initiated cancel, gagal_kirim and partial keep their automatic rules", () => {
  it("provider cancel still refunds 100% (the 50% rule is for user requests only)", async () => {
    const before = startingBalance();
    db.providerOrders["PRV-T1"] = { status: "Canceled", startCount: 0, remains: 600 };
    await syncOrders(db, createMockProviderClient(db), at(10));
    expect(order).toMatchObject({ status: "dibatalkan", cancelledBy: "provider", refundedAmount: 10_001 });
    expect(startingBalance()).toBeGreaterThanOrEqual(before + 10_001);
    expect(computeExpectedRefund(order)).toBe(10_001);
  });

  it("a cancel the user asked for is expected at the policy amount, the same status from the provider at 100%", () => {
    const user = { status: "dibatalkan" as const, charge: 10_001, quantity: 1000, remains: 600, cancelledBy: "user" as const, cancelPolicyPercent: 50 };
    expect(computeExpectedRefund(user)).toBe(3000);
    expect(computeExpectedRefund({ ...user, cancelledBy: "provider" })).toBe(10_001);
    expect(computeExpectedRefund({ ...user, cancelledBy: null })).toBe(10_001);
  });

  it("gagal_kirim is still refunded in full and partial proportionally", () => {
    expect(computeExpectedRefund({ status: "gagal_kirim", charge: 10_001, quantity: 1000, remains: 1000 })).toBe(10_001);
    expect(computeExpectedRefund({ status: "sebagian", charge: 10_001, quantity: 1000, remains: 600 })).toBe(6000);
  });

  it("a provider cancel that arrives while a user request is waiting settles the request with the full automatic refund", async () => {
    const req = requestCancel(db, "usr_1000", order.id, at(80));
    db.providerOrders["PRV-T1"] = { status: "Canceled", startCount: 0, remains: 600 };
    await syncOrders(db, createMockProviderClient(db), at(81));
    expect(order.refundedAmount).toBe(10_001);
    expect(db.cancelRequests.find((c) => c.id === req.id)!.status).toBe("selesai");
    const waiting = db.refunds.find((r) => r.cancelRequestId === req.id)!;
    expect(waiting.status).toBe("ditolak"); // superseded, never paid twice
    expect(db.refunds.filter((r) => r.orderId === order.id && r.status === "selesai")).toHaveLength(1);
  });
});

describe("one source of truth for the numbers", () => {
  it("the shared sentences are built from the settings", () => {
    db.settings.cancelPolicy = { minAgeHours: 48, refundPercent: 30 };
    const bullet = cancelPolicyBullet(db.settings.cancelPolicy);
    const s = cancelPolicySentences(db.settings.cancelPolicy);
    expect(bullet).toContain("48 jam");
    expect(bullet).toContain("30%");
    expect(s.user).toContain("48 jam");
    expect(s.user).toContain("30%");
    expect(s.provider).toContain("100%");
    expect(s.partial).toMatch(/partial/);
  });
});
