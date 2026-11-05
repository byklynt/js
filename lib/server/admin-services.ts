/**
 * Admin service list, paginated and filtered on the server (the admin page never receives the whole catalogue).
 * Pure functions over AdminDb so they can be tested.
 */
import type { AdminDb, AdminService } from "@/lib/admin-data";
import { marginPercent } from "@/lib/server/pricing";

export type AdminServicesQuery = {
  /** A category id, or undefined for all. */
  category?: string;
  /** Only active services below the minimum margin. */
  thinMargin?: boolean;
  search?: string;
  cursor?: string | null;
  limit?: number;
};

export type AdminServicesPage = { items: AdminService[]; nextCursor: string | null; total: number };
export type AdminServicesMeta = { total: number; thinCount: number; categories: { id: string; label: string; count: number }[] };

export const ADMIN_PAGE_SIZE = 15;

/** Services of removed demo providers are not part of the catalogue. */
function listed(db: AdminDb): AdminService[] {
  const known = new Set(db.providers.map((p) => p.id));
  return db.services.filter((s) => known.has(s.providerId));
}

export function adminServicesMeta(db: AdminDb): AdminServicesMeta {
  const services = listed(db);
  const min = db.settings.pricing.minMarginPercent;
  const cats = new Map<string, { id: string; label: string; count: number }>();
  let thin = 0;
  for (const s of services) {
    const c = cats.get(s.categoryId);
    if (c) c.count++;
    else cats.set(s.categoryId, { id: s.categoryId, label: s.categoryLabel, count: 1 });
    if (s.active && marginPercent(s) < min) thin++;
  }
  return { total: services.length, thinCount: thin, categories: Array.from(cats.values()) };
}

export function adminServicesPage(db: AdminDb, q: AdminServicesQuery = {}): AdminServicesPage {
  const min = db.settings.pricing.minMarginPercent;
  const needle = (q.search ?? "").trim().toLowerCase();
  const limit = Math.min(Math.max(Math.floor(q.limit ?? ADMIN_PAGE_SIZE) || ADMIN_PAGE_SIZE, 1), 100);
  const offset = Number.isInteger(Number(q.cursor)) && Number(q.cursor) > 0 ? Number(q.cursor) : 0;
  const matched = listed(db)
    .filter((s) => (q.thinMargin ? s.active && marginPercent(s) < min : !q.category || s.categoryId === q.category))
    .filter((s) => needle.length < 2 || s.id.includes(needle) || s.name.toLowerCase().includes(needle))
    .sort((a, b) => a.sort - b.sort);
  const next = offset + limit;
  return { items: matched.slice(offset, next), nextCursor: next < matched.length ? String(next) : null, total: matched.length };
}
