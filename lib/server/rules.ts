/**
 * Pure business rules (no database, no clock, no I/O) so they are trivial to unit test.
 */
import type { OrderStatus } from "@/lib/orders-data";
import type { RefundReason } from "./types";

export const FINAL_STATUSES: OrderStatus[] = ["selesai", "sebagian", "dibatalkan", "gagal_kirim"];
export const ACTIVE_STATUSES: OrderStatus[] = ["menunggu", "diproses", "berjalan"];

export const isActiveStatus = (s: OrderStatus) => ACTIVE_STATUSES.includes(s);

/** Provider status strings (Pending, In progress, Processing, Completed, Partial, Canceled) -> internal status. */
export function mapProviderStatus(raw: string): OrderStatus | null {
  // case, extra spaces, "_" and "-" do not matter: "In  Progress", "in_progress" and "IN-PROGRESS" are the same status
  switch (raw.trim().toLowerCase().replace(/[\s_-]+/g, " ")) {
    case "pending":
      return "menunggu";
    case "processing":
      return "diproses";
    case "in progress":
    case "inprogress":
      return "berjalan";
    case "completed":
    case "complete":
      return "selesai";
    case "partial":
      return "sebagian";
    case "canceled":
    case "cancelled":
      return "dibatalkan";
    case "fail":
    case "failed":
    case "error":
      return "dibatalkan"; // the provider gave up on the order: same full automatic refund as a provider-side cancel
    default:
      return null;
  }
}

/** Reverse mapping, used by the mock provider. */
export function toProviderStatus(status: OrderStatus): string {
  switch (status) {
    case "menunggu":
      return "Pending";
    case "diproses":
      return "Processing";
    case "berjalan":
      return "In progress";
    case "selesai":
      return "Completed";
    case "sebagian":
      return "Partial";
    case "dibatalkan":
      return "Canceled";
    case "gagal_kirim":
      return "Pending";
  }
}

type RefundBasis = {
  status: OrderStatus;
  charge: number;
  quantity: number;
  remains: number;
  /** "user" = the user asked to cancel (policy refund). Anything else = system rules. */
  cancelledBy?: "user" | "provider" | null;
  cancelPolicyPercent?: number | null;
};

/**
 * USER-requested cancellation only: refund = floor(charge * remains / quantity * percent / 100) of the undelivered part,
 * never more than what is still refundable. (Provider cancel, gagal_kirim and partial do NOT use this: see computeExpectedRefund.)
 */
export function computeUserCancelRefund(order: { charge: number; quantity: number; remains: number; refundedAmount?: number }, percent: number): number {
  if (order.quantity <= 0 || percent <= 0) return 0;
  const remains = Math.min(Math.max(order.remains, 0), order.quantity);
  const raw = Math.floor((order.charge * remains * percent) / (order.quantity * 100));
  return Math.max(0, Math.min(raw, order.charge - (order.refundedAmount ?? 0)));
}

/**
 * Refund that is owed for an order in its FINAL status:
 * - dibatalkan / gagal_kirim: the full charge
 * - sebagian: charge * remains / quantity, rounded DOWN to the nearest Rupiah
 * - anything else (selesai, still running): nothing
 */
export function computeExpectedRefund(order: RefundBasis): number {
  switch (order.status) {
    case "dibatalkan":
      // The 100% rule is for provider-side cancellations. A cancellation the user asked for follows the policy.
      if (order.cancelledBy === "user") return computeUserCancelRefund({ charge: order.charge, quantity: order.quantity, remains: order.remains }, order.cancelPolicyPercent ?? 0);
      return order.charge;
    case "gagal_kirim":
      return order.charge;
    case "sebagian": {
      if (order.quantity <= 0) return 0;
      const remains = Math.min(Math.max(order.remains, 0), order.quantity);
      return Math.min(order.charge, Math.floor((order.charge * remains) / order.quantity));
    }
    default:
      return 0;
  }
}

export function refundReasonFor(status: OrderStatus): RefundReason | null {
  if (status === "dibatalkan") return "dibatalkan";
  if (status === "sebagian") return "sebagian";
  if (status === "gagal_kirim") return "gagal_kirim";
  return null;
}

export const DELIVERED = (order: { quantity: number; remains: number }) => Math.max(0, order.quantity - order.remains);

/** An order is "macet" (stuck) when it is not final and older than the threshold. */
export function isStuck(order: { status: OrderStatus; createdAt: string }, now: Date, thresholdHours: number): boolean {
  if (!isActiveStatus(order.status)) return false;
  return now.getTime() - new Date(order.createdAt).getTime() > thresholdHours * 3_600_000;
}

export const REFILL_COOLDOWN_MS = 24 * 3_600_000;
export const DEFAULT_REFILL_DAYS = 30;

type EligibilityOrder = { status: OrderStatus; completedAt: string | null; createdAt: string };
type EligibilityService = { refill: boolean; cancel: boolean; refillDays: number | null };
type RequestLike = { status: "menunggu" | "berjalan" | "selesai" | "ditolak"; createdAt: string };

export type Eligibility = { allowed: boolean; reason: string | null; /** For cancel: when the request becomes possible (ISO). */ availableAt?: string };

/**
 * User cancel request: the service allows it, the order is not finished, no request is open, and the order is old
 * enough (policy.minAgeHours since it was created). Before that the answer carries `availableAt` for the countdown.
 */
export function cancelEligibility(
  order: EligibilityOrder,
  service: EligibilityService | undefined,
  requests: RequestLike[],
  now: Date = new Date(),
  policy: { minAgeHours: number } = { minAgeHours: 72 }
): Eligibility {
  if (!service?.cancel) return { allowed: false, reason: "Layanan ini tidak mendukung pembatalan." };
  if (!isActiveStatus(order.status)) return { allowed: false, reason: "Pesanan yang sudah selesai tidak bisa dibatalkan." };
  if (requests.some((r) => r.status === "menunggu" || r.status === "berjalan")) {
    return { allowed: false, reason: "Permintaan pembatalan sebelumnya masih diproses." };
  }
  const availableAt = new Date(new Date(order.createdAt).getTime() + policy.minAgeHours * 3_600_000);
  if (now.getTime() < availableAt.getTime()) {
    return { allowed: false, reason: "Pembatalan belum bisa diajukan.", availableAt: availableAt.toISOString() };
  }
  return { allowed: true, reason: null, availableAt: availableAt.toISOString() };
}

/**
 * Refill: refill-enabled service, status selesai, inside the service's refill window,
 * not while an earlier refill is menunggu/berjalan, and at most once per 24h per order.
 */
export function refillEligibility(
  order: EligibilityOrder,
  service: EligibilityService | undefined,
  requests: RequestLike[],
  now: Date
): Eligibility {
  if (!service?.refill) return { allowed: false, reason: "Layanan ini tidak mendukung refill." };
  if (order.status !== "selesai") return { allowed: false, reason: "Refill hanya untuk pesanan yang sudah selesai." };
  const days = service.refillDays ?? DEFAULT_REFILL_DAYS;
  const finishedAt = new Date(order.completedAt ?? order.createdAt).getTime();
  if (now.getTime() - finishedAt > days * 86_400_000) {
    return { allowed: false, reason: `Masa refill ${days} hari sudah berakhir.` };
  }
  if (requests.some((r) => r.status === "menunggu" || r.status === "berjalan")) {
    return { allowed: false, reason: "Refill sebelumnya masih diproses." };
  }
  const last = requests.reduce((max, r) => Math.max(max, new Date(r.createdAt).getTime()), 0);
  if (last && now.getTime() - last < REFILL_COOLDOWN_MS) {
    return { allowed: false, reason: "Refill hanya bisa diajukan sekali dalam 24 jam." };
  }
  return { allowed: true, reason: null };
}

/** Bonus percent for a deposit amount (highest tier reached). */
export function bonusPercentFor(amount: number, tiers: { min: number; percent: number }[]): number {
  return [...tiers].sort((a, b) => b.min - a.min).find((t) => amount >= t.min)?.percent ?? 0;
}

/**
 * What the provider really charged us for an order. The stored providerCost is the estimate at order time; a cancelled or
 * failed order cost nothing and a partial one only costs the delivered share. Profit must use this, not the estimate.
 */
export function effectiveProviderCost(o: { status: OrderStatus; providerCost: number; quantity: number; remains: number }): number {
  if (o.status === "dibatalkan" || o.status === "gagal_kirim") return 0;
  if (o.status === "sebagian" && o.quantity > 0) return Math.floor((o.providerCost * Math.max(0, o.quantity - o.remains)) / o.quantity);
  return o.providerCost;
}
