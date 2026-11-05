import { beforeEach, describe, expect, it } from "vitest";
import { type AdminDb, type AdminOrder } from "@/lib/admin-data";
import { seedDemoDb as seedAdminDb } from "@/lib/dev/demo-seed";
import { cancelPolicyBullet, cancelPolicySentences, formatCountdown, nextRuleVersion, ruleKeyFor } from "@/lib/order-rules";
import { placeOrder } from "../orders";
import { createMockProviderClient } from "../provider-client";
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
