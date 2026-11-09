/**
 * Per-provider money conversion (pure). Each provider prices in its own currency; its own `exchange_rate` (Rupiah per 1 unit of `currency`)
 * turns that into Rupiah. The first provider (Likeo) keeps using the global pricing settings, so nothing changes for it.
 */
import { LIKEO_ID } from "./config";

export type RateInfo = {
  currency: string;
  /** Rupiah per 1 unit of `currency`; null = the admin has not set a rate for this provider yet (pricing / balance in Rupiah are unknown). */
  rateIdr: number | null;
  /** The first provider's old behaviour: a balance in a currency other than the configured one is taken as Rupiah as is. */
  legacy: boolean;
};

type ProviderLike = { id: string; currency?: string | null; exchangeRate?: number | null };
type PricingLike = { currency: string; rateIdr: number };

export function providerRate(p: ProviderLike | undefined, pricing: PricingLike): RateInfo {
  if (!p || p.id === LIKEO_ID) return { currency: pricing.currency, rateIdr: pricing.rateIdr, legacy: true };
  const rate = p.exchangeRate !== null && p.exchangeRate !== undefined && Number.isFinite(p.exchangeRate) && p.exchangeRate > 0 ? p.exchangeRate : null;
  return { currency: (p.currency ?? "").toUpperCase() || "IDR", rateIdr: rate, legacy: false };
}

/** Native amount -> whole Rupiah, or null when it cannot be converted (no rate, or a currency that is not the one the admin configured). */
export function nativeToRupiah(native: number, currency: string, rate: RateInfo): number | null {
  const cur = currency.toUpperCase();
  if (rate.legacy) return Math.round(cur === rate.currency.toUpperCase() ? native * (rate.rateIdr ?? 0) : native);
  if (cur === "IDR") return Math.round(native);
  if (cur === rate.currency.toUpperCase() && rate.rateIdr !== null) return Math.round(native * rate.rateIdr);
  return null;
}
