/**
 * "Perlu dicek": a service that looks wrong enough that an admin should look at it before users can buy it.
 * Pure rules shared by the sync (preview and apply) and the admin list:
 *  - the selling price per 1000 is above the review threshold (settings.pricing.reviewPriceThreshold, default Rp 5.000.000);
 *  - the name or the category is shorter than 3 characters (for example the provider test services "mm" in category "0m").
 */
export const DEFAULT_REVIEW_PRICE = 5_000_000;
export const MIN_TEXT_LENGTH = 3;

export type ReviewReason = "harga" | "nama" | "kategori";

export function reviewReasons(s: { name: string; category: string; price: number; threshold?: number }): ReviewReason[] {
  const out: ReviewReason[] = [];
  const threshold = s.threshold && s.threshold > 0 ? s.threshold : DEFAULT_REVIEW_PRICE;
  if (Number.isFinite(s.price) && s.price > threshold) out.push("harga");
  if ([...String(s.name ?? "").trim()].length < MIN_TEXT_LENGTH) out.push("nama");
  if ([...String(s.category ?? "").trim()].length < MIN_TEXT_LENGTH) out.push("kategori");
  return out;
}

const rp = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

/** One line for a tooltip: why the service needs checking. */
export function reviewText(reasons: ReviewReason[], threshold = DEFAULT_REVIEW_PRICE): string {
  const parts: string[] = [];
  if (reasons.includes("harga")) parts.push(`harga jual di atas ${rp(threshold)} per 1000`);
  if (reasons.includes("nama")) parts.push(`nama kurang dari ${MIN_TEXT_LENGTH} karakter`);
  if (reasons.includes("kategori")) parts.push(`kategori kurang dari ${MIN_TEXT_LENGTH} karakter`);
  return parts.length ? `Perlu dicek: ${parts.join(", ")}.` : "";
}
