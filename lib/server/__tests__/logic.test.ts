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

describe("sync + refunds", () => {
  it("Canceled at the provider refunds the full charge", async () => {
    const o = activeOrder();
    const before = balance(o.userId);
    db.providerOrders[o.providerOrderId] = { status: "Canceled", startCount: 0, remains: o.quantity };
    await syncOrders(db, createMockProviderClient(db), now);
    expect(o.status).toBe("dibatalkan");
    expect(o.refundedAmount).toBe(o.charge);
    expect(refunded(o.id)).toBe(o.charge);
    expect(balance(o.userId)).toBeGreaterThanOrEqual(before + o.charge);
  });

  it("two syncs in a row create exactly one refund", async () => {
    const o = activeOrder();
    const before = balance(o.userId);
    db.providerOrders[o.providerOrderId] = { status: "Partial", startCount: 5, remains: Math.floor(o.quantity / 2) };
    const client = createMockProviderClient(db);
    await syncOrders(db, client, now);
    await syncOrders(db, client, now);
    expect(db.refunds.filter((r) => r.orderId === o.id)).toHaveLength(1);
    expect(refunded(o.id)).toBe(computeExpectedRefund(o));
    expect(balance(o.userId)).toBeGreaterThanOrEqual(before + computeExpectedRefund(o));
    expect(db.ledger.filter((l) => l.type === "refund" && l.refType === "refund" && db.refunds.some((r) => r.id === l.refId && r.orderId === o.id))).toHaveLength(1);
  });

  it("Completed gives no refund", async () => {
    const o = activeOrder();
    db.providerOrders[o.providerOrderId] = { status: "Completed", startCount: 1, remains: 0 };
    await syncOrders(db, createMockProviderClient(db), now);
    expect(o.status).toBe("selesai");
    expect(db.refunds.some((r) => r.orderId === o.id)).toBe(false);
  });

  it("a refund can never exceed the charge", () => {
    const o = db.orders.find((x) => x.status === "selesai" && x.refundedAmount === 0 && !db.refunds.some((r) => r.orderId === x.id))!;
    expect(() => createManualRefund(db, { orderId: o.id, amount: o.charge + 1, note: "melebihi charge", source: "admin" })).toThrow(ServiceError);
    const r = createManualRefund(db, { orderId: o.id, amount: o.charge, note: "refund penuh sah", source: "admin" });
    approveRefund(db, r.id, "adm_1", now);
    // approving again credits nothing more
    const again = approveRefund(db, r.id, "adm_1", now);
    expect(again.duplicate).toBe(true);
    expect(o.refundedAmount).toBe(o.charge);
    expect(() => createManualRefund(db, { orderId: o.id, amount: 1, note: "tambahan tidak boleh", source: "admin" })).toThrow(ServiceError);
  });

  it("auto refund twice is idempotent", () => {
    const o = activeOrder();
    o.status = "dibatalkan";
    const first = autoRefundForOrder(db, o.id, now);
    const second = autoRefundForOrder(db, o.id, now);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(o.refundedAmount).toBe(o.charge);
  });
});

describe("order placement", () => {
  const service = () => db.services.find((s) => s.active && s.min <= 100 && s.max >= 100)!;

  it("blocks the order when the balance is too low and changes nothing", async () => {
    const user = db.users.find((u) => u.id === "usr_1000")!;
    user.balance = 0;
    db.ledger = db.ledger.filter((l) => l.userId !== user.id);
    const orders = db.orders.length;
    await expect(
      placeOrder(db, { userId: user.id, serviceId: service().id, link: "https://example.com/p/1", quantity: 100 }, { client: createMockProviderClient(db), sleep })
    ).rejects.toThrow("Saldo tidak cukup.");
    expect(db.orders).toHaveLength(orders);
  });

  it("debits once and submits to the provider", async () => {
    const user = db.users.find((u) => u.id === "usr_1000")!;
    const before = user.balance;
    const o = await placeOrder(db, { userId: user.id, serviceId: service().id, link: "https://example.com/p/1", quantity: 100 }, { client: createMockProviderClient(db), sleep });
    expect(o.status).toBe("menunggu");
    expect(o.providerOrderId).not.toBe("");
    expect(user.balance).toBe(before - o.charge);
  });

  it("3 failed submits -> gagal_kirim and automatic full refund", async () => {
    const user = db.users.find((u) => u.id === "usr_1000")!;
    const before = user.balance;
    const svc = service();
    db.providerDown.push(svc.providerId);
    const o = await placeOrder(db, { userId: user.id, serviceId: svc.id, link: "https://example.com/p/1", quantity: 100 }, { client: createMockProviderClient(db), sleep, now: () => now });
    expect(o.status).toBe("gagal_kirim");
    expect(o.submitAttempts).toBe(3);
    expect(o.refundedAmount).toBe(o.charge);
    expect(user.balance).toBe(before);

    // Provider is back: resubmitting reverses the refund and charges again.
    db.providerDown = [];
    const again = await resubmitFailedOrder(db, o.id, "adm_1", { client: createMockProviderClient(db), sleep });
    expect(again.status).toBe("menunggu");
    expect(user.balance).toBe(before - o.charge);
    expect(reconcileBalances(db)).toEqual([]);
  });
});

describe("refill rules", () => {
  const svc = { refill: true, cancel: false, refillDays: 30 };
  const order = { status: "selesai" as const, completedAt: "2026-10-20T10:00:00+07:00", createdAt: "2026-10-20T09:00:00+07:00" };

  it("allows inside the window", () => expect(refillEligibility(order, svc, [], now).allowed).toBe(true));
  it("blocks after the window", () => {
    const late = { ...order, completedAt: "2026-09-01T10:00:00+07:00" };
    expect(refillEligibility(late, svc, [], now).allowed).toBe(false);
  });
  it("blocks while a previous refill is running", () => {
    expect(refillEligibility(order, svc, [{ status: "berjalan", createdAt: "2026-10-25T10:00:00+07:00" }], now).allowed).toBe(false);
  });
  it("only once per 24 hours", () => {
    expect(refillEligibility(order, svc, [{ status: "selesai", createdAt: "2026-11-04T05:00:00+07:00" }], now).allowed).toBe(false);
    expect(refillEligibility(order, svc, [{ status: "selesai", createdAt: "2026-11-02T05:00:00+07:00" }], now).allowed).toBe(true);
  });
  it("requestRefill creates a request and a second one the same day is refused", async () => {
    const o = db.orders.find((x) => x.userId === "usr_1000" && x.status === "selesai" && x.refillable)!;
    const service = db.services.find((s) => s.id === o.serviceId)!;
    service.refill = true;
    db.refillRequests = [];
    o.completedAt = "2026-11-01T10:00:00+07:00";
    await requestRefill(db, createMockProviderClient(db), o.userId, o.id, now);
    await expect(requestRefill(db, createMockProviderClient(db), o.userId, o.id, now)).rejects.toThrow(ServiceError);
  });
});

describe("deposit webhook", () => {
  const secret = "test-secret";
  const sign = (body: string) => createHmac("sha256", secret).update(body).digest("hex");

  it("credits once; a duplicate webhook is ignored; bad signature rejected", () => {
    const d = db.deposits.find((x) => x.status === "menunggu")!;
    const before = balance(d.userId);
    const body = JSON.stringify({ transactionId: "TX-1", reference: d.id, amount: d.amount, status: "paid" });
    expect(handlePaymentWebhook(db, body, "bad", secret, now).status).toBe(401);
    expect(balance(d.userId)).toBe(before);

    const first = handlePaymentWebhook(db, body, sign(body), secret, now);
    const second = handlePaymentWebhook(db, body, sign(body), secret, now);
    expect(first.body.message).toBe("Saldo ditambahkan.");
    expect(second.body.message).toBe("Duplikat diabaikan.");
    const credited = db.ledger.filter((l) => l.refId === d.id && (l.type === "deposit" || l.type === "bonus")).reduce((s, l) => s + l.amount, 0);
    expect(balance(d.userId) - before).toBe(credited);
    expect(db.ledger.filter((l) => l.type === "deposit" && l.refId === d.id)).toHaveLength(1);
  });

  it("the same gateway transaction ID cannot credit another deposit", () => {
    const [a, b] = db.deposits.filter((x) => x.status === "menunggu");
    creditDeposit(db, { depositId: a.id, externalId: "TX-DUP", by: "webhook" });
    expect(() => creditDeposit(db, { depositId: b.id, externalId: "TX-DUP", by: "webhook" })).toThrow(ServiceError);
  });
});

describe("ledger reconciliation", () => {
  it("seed balances match the ledger", () => expect(reconcileBalances(db)).toEqual([]));

  it("flows keep the ledger and balances in agreement; tampering is detected", async () => {
    const o = activeOrder();
    db.providerOrders[o.providerOrderId] = { status: "Canceled", startCount: 0, remains: o.quantity };
    await syncOrders(db, createMockProviderClient(db), now);
    applyLedgerEntry(db, { userId: o.userId, type: "adjustment", amount: 1000, refType: "t", refId: "1", note: "x" });
    expect(reconcileBalances(db)).toEqual([]);
    db.users.find((u) => u.id === o.userId)!.balance += 5;
    expect(reconcileBalances(db)).toHaveLength(1);
  });

  it("a failed transaction rolls back completely", () => {
    const u = db.users[0];
    const before = u.balance;
    expect(() => applyLedgerEntry(db, { userId: u.id, type: "adjustment", amount: -(before + 1), refType: "t", refId: "2", note: "x" })).toThrow("Saldo tidak cukup.");
    expect(u.balance).toBe(before);
  });
});
