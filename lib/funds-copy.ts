// Wording for the top-up flow. Pure functions so the fee claims can be tested: nothing here may say "tanpa biaya" unless the data says the customer pays no fee.
import { formatIdr } from "@/lib/balance";
import { estimateCustomerFee } from "@/lib/server/payments/gateway-rules";

type FeeChannel = { feeMode: "merchant" | "customer" | "split"; feeFlat: number; feePercent: number };

/** Short neutral hint shown next to a method in the dropdown. Never mentions fees: that depends on the channel's fee policy and is stated below the amount field. */
export const gatewayMethodHint = "otomatis";
export const manualMethodHint = "dikonfirmasi admin setelah pembayaran diterima";

/**
 * The one-line fee summary under the amount field. Returns null when nothing can be said yet (no amount, or amount outside the limits), so the page shows nothing rather than a guess.
 * Merchant-borne fee -> "Tanpa biaya tambahan". Customer-borne (or split, an upper bound) -> the estimated fee, the total to pay and the credited amount.
 */
export function feeSummary(channel: FeeChannel | null, amount: number, limits?: { min: number; max: number }): string | null {
  if (!channel) return null;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (limits && (amount < limits.min || amount > limits.max)) return null;
  const fee = estimateCustomerFee(channel, amount);
  if (fee <= 0) return `Tanpa biaya tambahan. Saldo masuk ${formatIdr(amount)}.`;
  return `Biaya layanan ${channel.feeMode === "split" ? "maksimal " : "± "}${formatIdr(fee)}. Total bayar ${channel.feeMode === "split" ? "maksimal " : "± "}${formatIdr(amount + fee)}, saldo masuk ${formatIdr(amount)}.`;
}

/** What a STORED deposit says about the fee: from the amounts we saved, never from the channel's current settings. */
export function depositFee(d: { amount: number; payAmount: number; feeAmount?: number | null }): { kind: "none" | "fee" | "unknown"; fee: number } {
  const diff = d.payAmount - d.amount;
  if (!Number.isFinite(diff) || diff < 0) return { kind: "unknown", fee: 0 };
  const stored = d.feeAmount ?? null;
  if (diff > 0) return { kind: "fee", fee: diff };
  // pay = amount: only "no fee" when the stored fee agrees (a stored fee > 0 with pay = amount would be inconsistent, so say nothing)
  if (stored !== null && stored > 0) return { kind: "unknown", fee: 0 };
  return { kind: "none", fee: 0 };
}

/** The short fee line for a deposit (payment page, history). null for deposits without gateway amounts. */
export function depositFeeLine(d: { amount: number; payAmount: number; feeAmount?: number | null }): string | null {
  const f = depositFee(d);
  if (f.kind === "fee") return `Biaya layanan ${formatIdr(f.fee)}`;
  if (f.kind === "none") return "Tanpa biaya tambahan";
  return null;
}
