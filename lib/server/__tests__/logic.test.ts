import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { type AdminDb } from "@/lib/admin-data";
import { seedDemoDb as seedAdminDb } from "@/lib/dev/demo-seed";
import { creditDeposit, handlePaymentWebhook } from "../deposits";
import { applyLedgerEntry, reconcileBalances } from "../ledger";
import { placeOrder, resubmitFailedOrder } from "../orders";
import { createMockProviderClient } from "../provider-client";
import { requestRefill } from "../requests";
import { approveRefund, autoRefundForOrder, createManualRefund } from "../refunds";
import { computeExpectedRefund, refillEligibility } from "../rules";
import { ServiceError } from "../tx";
import { syncOrders } from "../sync";

let db: AdminDb;
const sleep = async () => {};
const now = new Date("2026-11-04T12:00:00+07:00");

beforeEach(() => {
  db = seedAdminDb();
});

const activeOrder = () => db.orders.find((o) => o.status === "berjalan" || o.status === "diproses" || o.status === "menunggu")!;
const balance = (id: string) => db.users.find((u) => u.id === id)!.balance;
/** Money credited for one order's refunds (other orders of the same user may be refunded by the same sync). */
const refunded = (orderId: string) => db.ledger.filter((l) => l.type === "refund" && db.refunds.some((r) => r.id === l.refId && r.orderId === orderId)).reduce((n, l) => n + l.amount, 0);

describe("refund math", () => {
  it("partial refund = floor(charge * remains / quantity)", () => {
    expect(computeExpectedRefund({ status: "sebagian", charge: 42000, quantity: 2000, remains: 640 })).toBe(13440);
    // rounding always goes down, never up
    expect(computeExpectedRefund({ status: "sebagian", charge: 1000, quantity: 3, remains: 1 })).toBe(333);
    expect(computeExpectedRefund({ status: "sebagian", charge: 21000, quantity: 1000, remains: 180 })).toBe(3780);
  });
  it("full refund for dibatalkan and gagal_kirim, none for selesai", () => {
    expect(computeExpectedRefund({ status: "dibatalkan", charge: 8300, quantity: 5000, remains: 5000 })).toBe(8300);
    expect(computeExpectedRefund({ status: "gagal_kirim", charge: 500, quantity: 10, remains: 10 })).toBe(500);
    expect(computeExpectedRefund({ status: "selesai", charge: 500, quantity: 10, remains: 0 })).toBe(0);
  });
});
