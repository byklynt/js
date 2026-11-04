import { finalPrice, MOCK_TODAY, type AdminDb, type AdminService } from "@/lib/admin-data";

const rupiah = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

/** Margin = share of the selling price that is profit: (price - cost) / price * 100. Negative = selling below cost. */
export function marginPercent(s: Pick<AdminService, "providerPrice" | "markupType" | "markup">): number {
  const price = finalPrice(s);
  return Math.round(((price - s.providerPrice) / price) * 1000) / 10;
}

export const isThinMargin = (s: Pick<AdminService, "providerPrice" | "markupType" | "markup">, minPercent: number) => marginPercent(s) < minPercent;

export function thinMarginServices(db: AdminDb): AdminService[] {
  return db.services.filter((s) => s.active && isThinMargin(s, db.settings.pricing.minMarginPercent));
}

/** Markup (as fixed amount) that reaches exactly the minimum margin: price = cost / (1 - m). */
export function markupForMargin(providerPrice: number, minPercent: number): { markupType: "tetap"; markup: number; price: number } {
  const price = Math.ceil(providerPrice / (1 - minPercent / 100));
  return { markupType: "tetap", markup: price - providerPrice, price };
}

export type MarkupChange = { serviceId: string; name: string; oldPrice: number; newPrice: number; oldMargin: number; newMargin: number };

/** Preview only: nothing is changed. */
export function previewAutoMarkup(db: AdminDb, serviceIds?: string[]): MarkupChange[] {
  const min = db.settings.pricing.minMarginPercent;
  return db.services
    .filter((s) => (serviceIds ? serviceIds.includes(s.id) : isThinMargin(s, min)))
    .filter((s) => isThinMargin(s, min))
    .map((s) => {
      const next = markupForMargin(s.providerPrice, min);
      return { serviceId: s.id, name: s.name, oldPrice: finalPrice(s), newPrice: next.price, oldMargin: marginPercent(s), newMargin: marginPercent({ providerPrice: s.providerPrice, markupType: "tetap", markup: next.markup }) };
    });
}

/** Records a price change so it shows on the user's "Pembaruan" page. */
export function recordPriceChange(db: AdminDb, s: AdminService, oldPrice: number, newPrice: number) {
  if (oldPrice === newPrice) return;
  db.priceUpdates.unshift({
    id: `pu_${Date.now().toString(36)}_${db.priceUpdates.length}`,
    serviceId: s.id,
    platform: s.platform,
    name: s.name,
    type: newPrice > oldPrice ? "naik" : "turun",
    date: MOCK_TODAY,
    detail: `Harga berubah dari ${rupiah(oldPrice)} menjadi ${rupiah(newPrice)} per 1000.`,
  });
}

export function applyAutoMarkup(db: AdminDb, serviceIds?: string[]): MarkupChange[] {
  const changes = previewAutoMarkup(db, serviceIds);
  for (const c of changes) {
    const s = db.services.find((x) => x.id === c.serviceId)!;
    const next = markupForMargin(s.providerPrice, db.settings.pricing.minMarginPercent);
    const old = finalPrice(s);
    s.markupType = next.markupType;
    s.markup = next.markup;
    recordPriceChange(db, s, old, finalPrice(s));
  }
  return changes;
}

/**
 * Call after a provider price changed (sync). Always records the user-visible change; with "autoAdjust" on, a
 * margin that fell below the minimum is lifted back to it. Returns true when the selling price was adjusted.
 */
export function afterProviderPriceChange(db: AdminDb, s: AdminService, oldSellingPrice: number): boolean {
  let adjusted = false;
  if (db.settings.pricing.autoAdjust && isThinMargin(s, db.settings.pricing.minMarginPercent)) {
    const next = markupForMargin(s.providerPrice, db.settings.pricing.minMarginPercent);
    s.markupType = next.markupType;
    s.markup = next.markup;
    adjusted = true;
  }
  recordPriceChange(db, s, oldSellingPrice, finalPrice(s));
  return adjusted;
}
