// Wording for the top-up flow. Pure functions so the fee text can be tested. There is no "free of fees" claim anywhere: when the customer pays no fee the
// fee line is simply absent; when the customer pays a fee it is stated with the numbers that really apply.
import { formatIdr } from "@/lib/balance";
import { feeQuote, totalLimitProblem, type RuleChannel } from "@/lib/server/payments/gateway-rules";

type FeeChannel = Pick<RuleChannel, "feeMode" | "feeFlat" | "feePercent">;

/** Short neutral hint shown next to a method in the dropdown. Never mentions fees: they depend on the channel and are stated below the amount field. */
export const gatewayMethodHint = "otomatis";
export const manualMethodHint = "dikonfirmasi admin setelah pembayaran diterima";

/**
 * The one-line fee summary under the amount field, or null when there is nothing to say: no amount yet, an amount outside the limits (the limit message
 * shows instead), no channel (manual transfer) or no fee for the customer.
 * - "Teruskan biaya ke pelanggan" on (Paymenku bills the merchant): the fee is computed here, so the numbers are exact.
 * - Customer / split channels: Paymenku's own quote decides, so the numbers are marked "±" (split: "maksimal").
 */
export function feeSummary(channel: FeeChannel | null, amount: number, limits?: { min: number; max: number }, passthrough = false): string | null {
  if (!channel) return null;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (limits && (amount < limits.min || amount > limits.max)) return null;
  const q = feeQuote(channel, amount, passthrough);
  if (!q || q.fee <= 0) return null;
  const mark = q.kind === "upper" ? "maksimal " : q.kind === "estimate" ? "± " : "";
  return `Biaya layanan ${mark}${formatIdr(q.fee)}. Total bayar ${mark}${formatIdr(q.total)}, saldo masuk ${formatIdr(amount)}.`;
}

/** The message when the grossed-up total does not fit the channel's own limits (pass-through only), else null. */
export function totalProblem(channel: Pick<RuleChannel, "name" | "feeMode" | "feeFlat" | "feePercent" | "minAmount" | "maxAmount"> | null, amount: number, passthrough: boolean): string | null {
  if (!channel || !passthrough || channel.feeMode !== "merchant") return null;
  const q = feeQuote(channel, amount, true);
  return q && q.fee > 0 ? totalLimitProblem(channel, q.total) : null;
}

/** What a STORED deposit says about the fee: from the amounts we saved, never from the channel's current settings. */
export function depositFee(d: { amount: number; payAmount: number; feeAmount?: number | null }): { kind: "none" | "fee" | "unknown"; fee: number } {
  const diff = d.payAmount - d.amount;
  if (!Number.isFinite(diff) || diff < 0) return { kind: "unknown", fee: 0 };
  const stored = d.feeAmount ?? null;
  if (diff > 0) return { kind: "fee", fee: diff };
  if (stored !== null && stored > 0) return { kind: "unknown", fee: 0 }; // inconsistent: say nothing
  return { kind: "none", fee: 0 };
}

/** The short fee line for a deposit (history). null when the customer paid no fee (nothing is claimed) or the amounts are inconsistent. */
export function depositFeeLine(d: { amount: number; payAmount: number; feeAmount?: number | null }): string | null {
  const f = depositFee(d);
  return f.kind === "fee" ? `Biaya layanan ${formatIdr(f.fee)}` : null;
}
