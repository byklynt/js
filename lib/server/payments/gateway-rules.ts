/** Pure rules of the Paymenku top-up flow (no I/O): channel filtering by fee policy, fee estimate, amount limits. Shared by the server and the tests. */
export type FeePolicy = "ikuti" | "pengguna" | "kami";
export type RuleChannel = { code: string; name: string; type?: string; feeMode: "merchant" | "customer" | "split"; feeFlat: number; feePercent: number; minAmount: number; maxAmount: number };

export const FEE_POLICY_LABEL: Record<FeePolicy, string> = {
  ikuti: "Ikuti pengaturan kanal Paymenku",
  pengguna: "Biaya ditanggung pengguna (ditambahkan ke nominal bayar)",
  kami: "Biaya kami tanggung (pengguna membayar sesuai nominal)",
};

/**
 * Paymenku decides who bears the fee PER CHANNEL (fee_mode: merchant | customer | split); a transaction cannot override it. Our policy therefore decides
 * which channels may be offered: "pengguna" only channels where the customer pays the fee (customer / split), "kami" only channels where the fee
 * is taken from the merchant side, "ikuti" every enabled channel as it is. Either way the balance credited is the agreed amount, never more.
 */
export function channelAllowed(channel: Pick<RuleChannel, "feeMode">, policy: FeePolicy): boolean {
  if (policy === "pengguna") return channel.feeMode === "customer" || channel.feeMode === "split";
  if (policy === "kami") return channel.feeMode === "merchant";
  return true;
}

/** The fee the CUSTOMER pays on top of the amount, estimated from the channel (flat + percent, rounded up to whole Rupiah); 0 when the merchant bears it. "split" is an upper bound. */
export function estimateCustomerFee(channel: Pick<RuleChannel, "feeMode" | "feeFlat" | "feePercent">, amount: number): number {
  if (channel.feeMode === "merchant") return 0;
  return Math.ceil(channel.feeFlat + (amount * channel.feePercent) / 100 - 1e-9);
}

/** Smallest / largest amount for a channel: our settings and the channel's own limits both apply. */
export function amountLimits(channel: Pick<RuleChannel, "minAmount" | "maxAmount">, settings: { minDeposit: number; maxDeposit: number }): { min: number; max: number } {
  return { min: Math.max(settings.minDeposit, channel.minAmount), max: channel.maxAmount > 0 ? Math.min(settings.maxDeposit, channel.maxAmount) : settings.maxDeposit };
}

/**
 * What Paymenku quoted at creation must make sense for the channel: the customer never pays LESS than the agreed amount, pays exactly the amount when the
 * merchant bears the fee, and never more than twice the estimated fee (plus Rp 1.000 of slack) otherwise. Returns an error text or null.
 */
export function checkQuote(channel: Pick<RuleChannel, "feeMode" | "feeFlat" | "feePercent">, amount: number, payAmount: number): string | null {
  if (!Number.isInteger(payAmount) || payAmount < amount) return "Nominal bayar dari Paymenku lebih kecil dari nominal deposit.";
  const extra = payAmount - amount;
  if (channel.feeMode === "merchant" && extra !== 0) return "Kanal ini seharusnya tanpa biaya untuk pengguna, tetapi Paymenku meminta biaya.";
  if (extra > estimateCustomerFee(channel, amount) * 2 + 1000) return "Biaya dari Paymenku jauh di atas perkiraan. Deposit dibatalkan demi keamanan.";
  return null;
}

/** Concurrent pending gateway deposits per user. */
export const MAX_PENDING_GATEWAY_DEPOSITS = 3;
/** Pending longer than this: the cron asks Paymenku (a lost webhook). */
export const RECONCILE_AFTER_MINUTES = 5;
