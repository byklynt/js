import { finalPrice, type AdminDb, type AdminOrder } from "@/lib/admin-data";
import { applyLedgerEntry } from "./ledger";
import { sharedLimiter, type RateLimiter } from "./limits";
import { createNotification, logSystem, notifyAdmins, notifyOrderStatus, notifyUser, rupiah } from "./notifications";
import { ProviderError, type ProviderClient } from "./provider-client";
import { autoRefundForOrder } from "./refunds";
import { isActiveStatus } from "./rules";
import { ruleKeyFor } from "@/lib/order-rules";
import { ServiceError, withTransaction } from "./tx";

export type PlaceOrderInput = {
  userId: string;
  serviceId: string;
  link: string;
  quantity: number;
};
export type OrderDeps = {
  client: ProviderClient;
  /** Injected so tests do not really wait. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  limiter?: RateLimiter;
};

export const MAX_SUBMIT_ATTEMPTS = 3;
/** Below this balance the user gets a "saldo hampir habis" notification. */
export const LOW_BALANCE = 10_000;
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function chargeFor(service: Parameters<typeof finalPrice>[0], quantity: number): number {
  return Math.ceil((finalPrice(service) * quantity) / 1000);
}

/** Same link written differently (case, trailing slash, #fragment) counts as the same target. */
export const normalizeLink = (link: string) => link.trim().toLowerCase().replace(/#.*$/, "").replace(/\/+$/, "");

/** An order for the same service and link that has not finished yet. */
export function findActiveDuplicate(db: AdminDb, userId: string, serviceId: string, link: string): AdminOrder | undefined {
  const target = normalizeLink(link);
  return db.orders.find((o) => o.userId === userId && o.serviceId === serviceId && (isActiveStatus(o.status) || o.held) && normalizeLink(o.link) === target);
}

function validate(db: AdminDb, input: PlaceOrderInput) {
  const user = db.users.find((u) => u.id === input.userId);
  if (!user) throw new ServiceError("Pengguna tidak ditemukan.", "no_user");
  if (user.status !== "aktif") throw new ServiceError("Akunmu sedang diblokir.", "blocked");
  const service = db.services.find((s) => s.id === input.serviceId);
  if (!service || !service.active) throw new ServiceError("Layanan tidak tersedia.", "no_service");
  // A provider that is gone (the demo providers are removed in live mode) or that an admin switched off takes its services with it.
  const provider = db.providers.find((p) => p.id === service.providerId);
  if (!provider || (provider.kind && provider.status === "nonaktif")) throw new ServiceError("Layanan tidak tersedia.", "no_service");
  if (!Number.isInteger(input.quantity) || input.quantity < service.min || input.quantity > service.max) {
    throw new ServiceError(`Jumlah harus antara ${service.min.toLocaleString("id-ID")} dan ${service.max.toLocaleString("id-ID")}.`, "bad_quantity");
  }
  if (!/^https?:\/\/[^\s]+\.[^\s]+$/i.test(input.link.trim())) throw new ServiceError("Tautan tidak valid.", "bad_link");
  const dup = findActiveDuplicate(db, user.id, service.id, input.link);
  if (dup) throw new ServiceError(`Pesanan #${dup.id} untuk layanan dan tautan yang sama masih berjalan. Tunggu sampai selesai.`, "duplicate_active");
  return { user, service };
}

/**
 * 1) one transaction: debit the balance (ledger) and create the order as "menunggu";
 * 2) submit to the provider with up to 3 attempts and exponential backoff;
 * 3) if every attempt fails: status gagal_kirim and an automatic full refund.
 */
export async function placeOrder(db: AdminDb, input: PlaceOrderInput, deps: OrderDeps): Promise<AdminOrder> {
  const now = deps.now ?? (() => new Date());
  const { service } = validate(db, input);
  const limit = (deps.limiter ?? sharedLimiter).hit(`order:${input.userId}`, db.settings.limits.ordersPerMinute, 60_000, now().getTime());
  if (!limit.allowed) throw new ServiceError(`Terlalu banyak pesanan. Coba lagi dalam ${limit.retryAfterSec} detik.`, "rate_limited");
  const charge = chargeFor(service, input.quantity);

  const order = withTransaction(db, () => {
    const user = db.users.find((u) => u.id === input.userId)!;
    const id = String(7_200_000 + db.orders.length * 17 + Math.floor(Math.random() * 15));
    applyLedgerEntry(db, { userId: user.id, type: "order", amount: -charge, refType: "order", refId: id, note: `Pesanan #${id}`, createdBy: user.id, now: now() });
    const created: AdminOrder = {
      id, userId: user.id, username: user.username, serviceId: service.id, platform: service.platform, name: `${service.id} - ${service.name}`,
      link: input.link.trim(), charge, quantity: input.quantity, startCount: 0, remains: input.quantity, status: "menunggu", createdAt: now().toISOString(),
      providerId: service.providerId, providerOrderId: "", refillable: service.refill,
      providerCost: Math.ceil((service.providerPrice * input.quantity) / 1000), refundedAmount: 0, submitAttempts: 0, lastSyncedAt: null, completedAt: null, held: user.manualApproval,
      // Implied acceptance: ordering means agreeing to the CURRENT rules of the platform. Set here, never taken from the client.
      acceptedRulesVersion: db.settings.orderRules[ruleKeyFor(service.platform)].version, acceptedAt: now().toISOString(), cancelledBy: null, cancelPolicyPercent: null,
    };
    db.orders.unshift(created);
    user.totalSpent += charge;
    // Low balance warning (once per day).
    if (user.balance < LOW_BALANCE) {
      createNotification(db, { userId: user.id, type: "sistem", title: "Saldo hampir habis", body: `Saldomu tinggal ${rupiah(user.balance)}. Tambah saldo agar pesanan berikutnya tidak tertunda.`, href: "/dashboard/add-funds", dedupeKey: `lowbal:${user.id}:${now().toISOString().slice(0, 10)}` }, now());
    }
    return created;
  });

  if (order.held) {
    notifyUser(db, order.userId, { type: "pesanan", title: `Pesanan #${order.id} menunggu persetujuan`, body: "Admin akan memeriksa pesananmu sebelum dikirim ke provider.", href: `/dashboard/orders?search=${order.id}`, dedupeKey: `order:${order.id}:held` }, now());
    return order;
  }
  await submitToProvider(db, order.id, deps);
  return db.orders.find((o) => o.id === order.id)!;
}

/** Admin releases an order that was held for review. */
export async function approveHeldOrder(db: AdminDb, orderId: string, deps: OrderDeps): Promise<AdminOrder> {
  const order = db.orders.find((o) => o.id === orderId);
  if (!order) throw new ServiceError("Pesanan tidak ditemukan.", "no_order");
  if (!order.held) throw new ServiceError("Pesanan ini tidak sedang ditahan.", "not_held");
  order.held = false;
  await submitToProvider(db, order.id, deps);
  return order;
}

/** TODO(provider): maps to the provider's "add order" call; service.providerServiceId is the provider-side service. */
export async function submitToProvider(db: AdminDb, orderId: string, deps: OrderDeps): Promise<boolean> {
  const sleep = deps.sleep ?? defaultSleep;
  const now = deps.now ?? (() => new Date());
  const order = db.orders.find((o) => o.id === orderId);
  if (!order) throw new ServiceError("Pesanan tidak ditemukan.", "no_order");
  const service = db.services.find((s) => s.id === order.serviceId);
  let lastError = "";
  let ambiguous = false;

  for (let attempt = 1; attempt <= MAX_SUBMIT_ATTEMPTS; attempt++) {
    order.submitAttempts = attempt;
    try {
      const res = await deps.client.addOrder(order.providerId, { service: service?.providerServiceId ?? order.serviceId, link: order.link, quantity: order.quantity });
      order.providerOrderId = res.providerOrderId;
      return true;
    } catch (e) {
      lastError = e instanceof Error ? e.message : "error";
      if (e instanceof ProviderError) {
        // A timeout / 5xx / unreadable answer: the provider may already have the order. Sending again could create a duplicate.
        if (e.ambiguous) { ambiguous = true; break; }
        // A missing key will not fix itself in half a second.
        if (e.kind === "config") break;
      }
      if (attempt < MAX_SUBMIT_ATTEMPTS) await sleep(500 * 2 ** (attempt - 1));
    }
  }

  if (ambiguous) {
    // gagal_kirim, but NOT refunded: an admin checks the provider first (resolveManualCheck).
    order.status = "gagal_kirim";
    order.needsManualCheck = true;
    notifyUser(db, order.userId, { type: "pesanan", title: `Pesanan #${order.id} sedang kami periksa`, body: "Pengiriman ke provider belum bisa dipastikan. Tim kami memeriksanya dan saldomu akan dikembalikan bila pesanan tidak masuk.", href: `/dashboard/orders?search=${order.id}`, dedupeKey: `order:${order.id}:check` }, now());
    notifyAdmins(db, { type: "pesanan", title: `Pesanan #${order.id} perlu dicek manual`, body: "Pengiriman ke provider tidak jelas hasilnya (timeout/5xx). Cek di panel provider sebelum kirim ulang atau refund.", href: "/admin/orders", dedupeKey: `order-check:${order.id}` }, now());
    logSystem(db, "order.submit_ambiguous", "order", order.id, null, { error: lastError }, now());
    return false;
  }

  order.status = "gagal_kirim";
  autoRefundForOrder(db, order.id, now());
  notifyOrderStatus(db, order, now()); // gagal_kirim (the refund notification follows from the refund itself)
  logSystem(db, "order.submit_failed", "order", order.id, null, { attempts: MAX_SUBMIT_ATTEMPTS, error: lastError }, now());
  return false;
}

/** Admin: send a gagal_kirim order again. The earlier refund is reversed and the user is charged again. */
export async function resubmitFailedOrder(db: AdminDb, orderId: string, adminId: string, deps: OrderDeps): Promise<AdminOrder> {
  const now = deps.now ?? (() => new Date());
  withTransaction(db, () => {
    const order = db.orders.find((o) => o.id === orderId);
    if (!order) throw new ServiceError("Pesanan tidak ditemukan.", "no_order");
    if (order.status !== "gagal_kirim") throw new ServiceError("Hanya pesanan gagal kirim yang bisa dikirim ulang.", "bad_status");
    const refund = db.refunds.find((r) => r.orderId === order.id && r.reason === "gagal_kirim" && r.status === "selesai" && !r.reversed);
    if (refund) {
      applyLedgerEntry(db, {
        userId: order.userId, type: "order", amount: -refund.amount, refType: "resubmit", refId: `${order.id}:${order.submitAttempts}:${refund.id}`,
        note: `Kirim ulang pesanan #${order.id}`, createdBy: adminId, now: now(),
      });
      refund.reversed = true;
      order.refundedAmount = Math.max(0, order.refundedAmount - refund.amount);
    }
    order.status = "menunggu";
    order.submitAttempts = 0;
    order.needsManualCheck = false;
  });
  await submitToProvider(db, orderId, deps);
  return db.orders.find((o) => o.id === orderId)!;
}

/**
 * An admin looked at the provider panel for an order whose submit ended in an unknown state:
 * - "refund": the provider has no such order -> full refund and the flag is cleared;
 * - "sent": the provider does have it -> store its order id and let the status sync take over.
 */
export function resolveManualCheck(
  db: AdminDb, orderId: string, outcome: { kind: "refund" } | { kind: "sent"; providerOrderId: string }, now = new Date()
): AdminOrder {
  const order = db.orders.find((o) => o.id === orderId);
  if (!order) throw new ServiceError("Pesanan tidak ditemukan.", "no_order");
  if (!order.needsManualCheck) throw new ServiceError("Pesanan ini tidak sedang menunggu pengecekan manual.", "not_pending_check");
  if (outcome.kind === "sent") {
    const id = outcome.providerOrderId.trim();
    if (!/^[A-Za-z0-9._-]{1,40}$/.test(id)) throw new ServiceError("ID pesanan provider tidak valid.", "bad_provider_order_id");
    order.providerOrderId = id;
    order.status = "menunggu";
  } else {
    autoRefundForOrder(db, order.id, now);
  }
  order.needsManualCheck = false;
  logSystem(db, "order.manual_check_resolved", "order", order.id, null, { outcome: outcome.kind }, now);
  return order;
}
