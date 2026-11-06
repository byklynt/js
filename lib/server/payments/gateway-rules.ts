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
 * With "Teruskan biaya ke pelanggan" on, merchant-billed channels also count as customer-pays channels (the app adds their fee), and "kami" offers none of them.
 */
export function channelAllowed(channel: Pick<RuleChannel, "feeMode">, policy: FeePolicy, passthrough = false): boolean {
  if (policy === "pengguna") return channel.feeMode === "customer" || channel.feeMode === "split" || (passthrough && channel.feeMode === "merchant");
  if (policy === "kami" && passthrough) return false;
  if (policy === "kami") return channel.feeMode === "merchant";
  return true;
}

/** The fee the CUSTOMER pays on top of the amount, estimated from the channel (flat + percent, rounded up to whole Rupiah); 0 when the merchant bears it. "split" is an upper bound. */
export function estimateCustomerFee(channel: Pick<RuleChannel, "feeMode" | "feeFlat" | "feePercent">, amount: number): number {
  if (channel.feeMode === "merchant") return 0;
  return Math.ceil(channel.feeFlat + (amount * channel.feePercent) / 100 - 1e-9);
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Fee pass-through ("Teruskan biaya ke pelanggan"): integer-only money maths, always rounded UP
// ---------------------------------------------------------------------------------------------------------------------------------
const ONE = BigInt(1);
const PPM = BigInt(1_000_000); // percent is carried as parts per million (0,7 % = 7.000 ppm): no floating point touches a Rupiah amount

/** A fee percentage as parts per million, or null when it is not a usable number (negative, NaN, 100 % or more). */
function percentToPpm(percent: number): bigint | null {
  if (!Number.isFinite(percent) || percent < 0 || percent >= 100) return null;
  return BigInt(Math.round(percent * 10_000));
}

/** What Paymenku takes from a payment of `total`: the fixed part plus the percentage, rounded up to whole Rupiah. */
export function gatewayFeeOn(total: number, feeFlat: number, feePercent: number): number | null {
  const ppm = percentToPpm(feePercent);
  if (ppm === null || !Number.isInteger(total) || total < 0 || !Number.isInteger(feeFlat) || feeFlat < 0) return null;
  const t = BigInt(total);
  const pct = (t * ppm + PPM - ONE) / PPM;
  return Number(BigInt(feeFlat) + pct);
}

/**
 * The gross total the customer pays so that the merchant nets AT LEAST `amount` after the channel fee (flat + percent):
 * total = ceil((amount + flat) / (1 - percent)). A final guard bumps the total until `total - fee(total) >= amount` also holds when the gateway rounds its
 * own fee up. Returns null for amounts or fee settings that cannot be grossed up.
 */
export function grossUpTotal(amount: number, feeFlat: number, feePercent: number): number | null {
  const ppm = percentToPpm(feePercent);
  if (ppm === null || !Number.isInteger(amount) || amount <= 0 || !Number.isInteger(feeFlat) || feeFlat < 0) return null;
  const num = (BigInt(amount) + BigInt(feeFlat)) * PPM;
  const den = PPM - ppm;
  let total = (num + den - ONE) / den;
  for (let guard = 0; guard < 5; guard++) {
    const fee = gatewayFeeOn(Number(total), feeFlat, feePercent);
    if (fee !== null && Number(total) - fee >= amount) break;
    total += ONE;
  }
  const out = Number(total);
  return Number.isSafeInteger(out) ? out : null;
}

/** True when the app adds this channel's fee to what the customer pays: the switch is on AND Paymenku bills the merchant for the channel. */
export function passesFeeToCustomer(channel: Pick<RuleChannel, "feeMode">, passthrough: boolean): boolean {
  return passthrough && channel.feeMode === "merchant";
}

export type FeeQuote = {
  /** What the customer pays (gross). */
  total: number;
  /** Fee on top of the base amount (0 = none). */
  fee: number;
  /** "exact": we computed it (pass-through). "estimate": Paymenku's own quote is the source of truth (customer / split channels). */
  kind: "none" | "exact" | "estimate" | "upper";
};

/** Fee and total for a deposit of `amount` on a channel, under the current switch. null when the amount cannot be quoted. */
export function feeQuote(channel: Pick<RuleChannel, "feeMode" | "feeFlat" | "feePercent">, amount: number, passthrough: boolean): FeeQuote | null {
  if (!Number.isInteger(amount) || amount <= 0) return null;
  if (passesFeeToCustomer(channel, passthrough)) {
    const total = grossUpTotal(amount, channel.feeFlat, channel.feePercent);
    if (total === null) return null;
    return { total, fee: total - amount, kind: total === amount ? "none" : "exact" };
  }
  const fee = estimateCustomerFee(channel, amount);
  return { total: amount + fee, fee, kind: fee <= 0 ? "none" : channel.feeMode === "split" ? "upper" : "estimate" };
}

/** The total must also fit the channel's own limits (the base amount is checked against ours). Returns a message or null. */
export function totalLimitProblem(channel: Pick<RuleChannel, "name" | "minAmount" | "maxAmount">, total: number): string | null {
  const rp = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;
  if (channel.maxAmount > 0 && total > channel.maxAmount) return `Total bayar ${rp(total)} melebihi batas ${channel.name} (${rp(channel.maxAmount)}). Kurangi nominal deposit.`;
  if (total < channel.minAmount) return `Total bayar ${rp(total)} di bawah batas minimal ${channel.name} (${rp(channel.minAmount)}). Naikkan nominal deposit.`;
  return null;
}

/** What Paymenku answered at creation of a pass-through deposit: the customer must be asked for exactly the stored total, nothing else. */
export function checkPassthroughQuote(total: number, quotedAmount: number): string | null {
  if (!Number.isInteger(quotedAmount) || quotedAmount !== total) return "Nominal bayar dari Paymenku tidak sama dengan total yang dihitung. Deposit dibatalkan demi keamanan.";
  return null;
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
  if (channel.feeMode === "merchant" && extra !== 0) return "Kanal ini seharusnya tidak membebankan biaya ke pengguna, tetapi Paymenku meminta biaya.";
  if (extra > estimateCustomerFee(channel, amount) * 2 + 1000) return "Biaya dari Paymenku jauh di atas perkiraan. Deposit dibatalkan demi keamanan.";
  return null;
}

/** Concurrent pending gateway deposits per user. */
export const MAX_PENDING_GATEWAY_DEPOSITS = 3;
/** Pending longer than this: the cron asks Paymenku (a lost webhook). */
export const RECONCILE_AFTER_MINUTES = 5;
