/** Display helpers for services (client and server safe). */

/** Providers send 2147483647 (a 32-bit max) or similar for "no upper limit". */
export const NO_LIMIT_FROM = 1_000_000_000;

export function isNoLimit(max: number): boolean {
  return max >= NO_LIMIT_FROM;
}

/** "Tanpa batas" for an unlimited maximum, otherwise the number in Indonesian format. */
export function formatMaxQty(max: number): string {
  return isNoLimit(max) ? "Tanpa batas" : max.toLocaleString("id-ID");
}

/** "10 - 100.000" or "10 - Tanpa batas". */
export function formatQtyRange(min: number, max: number): string {
  return `${min.toLocaleString("id-ID")} - ${formatMaxQty(max)}`;
}

/** Trims and collapses repeated whitespace for display. The original text stays in provider_name. */
export function cleanServiceName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}
