/** Read models for the admin / user UI (plain, serializable data; no secrets). */
import type { AdminRefill, AdminDb } from "@/lib/admin-data";
import type { OrderStatus } from "@/lib/orders-data";
import { computeExpectedRefund, computeUserCancelRefund, DELIVERED, isActiveStatus, isStuck, mapProviderStatus } from "./rules";
import type { LedgerEntry, RefundRecord } from "./types";

export type RefundRow = RefundRecord & {
  order: {
    status: OrderStatus;
    charge: number;
    quantity: number;
    delivered: number;
    remains: number;
    refundedAmount: number;
    providerStatus: string;
    /** Refund the final status says is owed (0 for selesai / running). */
    expected: number;
    /** Final status owes a refund but the refunded amount is different. */
    mismatch: boolean;
  };
  ledger: LedgerEntry[];
  /** For user_cancel refunds: what the admin needs to decide (computed from the order as it is NOW). */
  cancel?: { ageHours: number; remains: number; quantity: number; calculated: number; percent: number };
  /** Not a real refund: an order that owes one but has none yet (shown under the mismatch filter). */
  virtual?: boolean;
};

export function buildRefundRows(db: AdminDb): RefundRow[] {
  // Waiting decisions first, then newest first.
  const sorted = [...db.refunds].sort((a, b) => (a.status === "menunggu" ? 0 : 1) - (b.status === "menunggu" ? 0 : 1) || (a.createdAt < b.createdAt ? 1 : -1));
  const rows = sorted.map((r) => {
    const o = db.orders.find((x) => x.id === r.orderId);
    const expected = o ? computeExpectedRefund(o) : 0;
    const owes = o ? ["dibatalkan", "sebagian", "gagal_kirim"].includes(o.status) : false;
    return {
      ...r,
      order: {
        status: o?.status ?? "selesai",
        charge: o?.charge ?? 0,
        quantity: o?.quantity ?? 0,
        delivered: o ? DELIVERED(o) : 0,
        remains: o?.remains ?? 0,
        refundedAmount: o?.refundedAmount ?? 0,
        providerStatus: o ? (db.providerOrders[o.providerOrderId]?.status ?? "-") : "-",
        expected,
        mismatch: owes && o ? o.refundedAmount !== expected : false,
      },
      ledger: db.ledger.filter((l) => l.refType === "refund" && l.refId === r.id),
      cancel: r.reason === "user_cancel" && o ? {
        ageHours: Math.floor(((r.processedAt ? new Date(r.processedAt).getTime() : Date.now()) - new Date(o.createdAt).getTime()) / 3_600_000),
        remains: o.remains, quantity: o.quantity, percent: r.policyPercent ?? db.settings.cancelPolicy.refundPercent,
        calculated: r.status === "selesai" ? r.amount : computeUserCancelRefund(o, r.policyPercent ?? db.settings.cancelPolicy.refundPercent),
      } : undefined,
    };
  });
  const virtual: RefundRow[] = missingRefunds(db).flatMap((m) => {
    const o = db.orders.find((x) => x.id === m.orderId);
    if (!o) return [];
    return [{
      id: `missing_${o.id}`, orderId: o.id, userId: o.userId, username: o.username, amount: m.expected,
      reason: o.status === "sebagian" ? "sebagian" : o.status === "gagal_kirim" ? "gagal_kirim" : "dibatalkan",
      source: "auto", status: "menunggu", processedBy: null, rejectReason: null, note: "Belum ada refund untuk pesanan ini.",
      createdAt: o.completedAt ?? o.createdAt, processedAt: null, reversed: false, virtual: true,
      order: { status: o.status, charge: o.charge, quantity: o.quantity, delivered: DELIVERED(o), remains: o.remains, refundedAmount: o.refundedAmount,
        providerStatus: db.providerOrders[o.providerOrderId]?.status ?? "-", expected: m.expected, mismatch: true },
      ledger: [],
    } as RefundRow];
  });
  return [...rows, ...virtual];
}

/** Orders with a final status that owes a refund nobody has created (shown so admins can fix them). */
export function missingRefunds(db: AdminDb) {
  return db.orders
    .filter((o) => ["dibatalkan", "sebagian", "gagal_kirim"].includes(o.status) && !o.needsManualCheck && computeExpectedRefund(o) > 0 && o.refundedAmount === 0 && !db.refunds.some((r) => r.orderId === o.id && r.status === "menunggu"))
    .map((o) => ({ orderId: o.id, expected: computeExpectedRefund(o) }));
}

/** Flags used on the order list. */
export function orderFlags(db: AdminDb, now = new Date()) {
  const stuck = new Set(db.orders.filter((o) => isStuck(o, now, db.settings.operations.stuckHours)).map((o) => o.id));
  const drift = new Set(
    db.orders
      .filter((o) => o.providerOrderId && isActiveStatus(o.status))
      .filter((o) => {
        const mapped = mapProviderStatus(db.providerOrders[o.providerOrderId]?.status ?? "");
        return mapped && mapped !== o.status && !isActiveStatus(mapped);
      })
      .map((o) => o.id)
  );
  return { stuck: [...stuck], drift: [...drift] };
}

/** Rows for /admin/refills: the real refill requests (db.refillRequests) joined with their order and user. */
export function adminRefillRows(db: AdminDb): AdminRefill[] {
  return db.refillRequests.flatMap((r) => {
    const order = db.orders.find((o) => o.id === r.orderId);
    return order
      ? [{ id: r.id, orderId: order.id, platform: order.platform, name: order.name, link: order.link, status: r.status, createdAt: r.createdAt, userId: r.userId, username: order.username }]
      : [];
  });
}
