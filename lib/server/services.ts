/**
 * The user-facing service catalogue, queried on the server. Nothing here sends the whole catalogue anywhere: callers get
 * one page of lightweight rows, the category list with counts, or one service in full.
 *
 * Cache: the visible catalogue is turned into an indexed view once and reused until something that affects it changes
 * (a fingerprint of prices, flags and providers is compared on every call, so a sync, an admin edit or a switched-off
 * provider is picked up immediately; invalidateServicesCache() forces a rebuild). Per-category lists come from the view's
 * category index, so a page of one category never scans the other ~5,000 services.
 */
import { finalPrice, type AdminDb, type AdminService } from "@/lib/admin-data";
import { cleanServiceName } from "@/lib/service-format";
import { isUserVisible } from "@/lib/server/providers/catalog";
import {
  DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, MIN_SEARCH_LENGTH,
  type CategoryRow, type ServiceDetailData, type ServiceRow, type ServiceSort, type ServicesPage, type ServicesQuery,
} from "@/lib/services-types";

type Entry = { row: ServiceRow; hay: string; platformId: string; num: number; src: AdminService };
type View = {
  fingerprint: string;
  all: Entry[];
  byId: Map<string, Entry>;
  byCategory: Map<string, Entry[]>;
  categories: CategoryRow[];
  sortedCache: Map<ServiceSort, Entry[]>;
};

const PLATFORM_ORDER = ["instagram", "youtube", "tiktok", "twitter", "spotify", "telegram", "facebook", "twitch", "reddit", "website-traffic", "seo-backlink", "lainnya"];
const platformRank = (id: string) => {
  const i = PLATFORM_ORDER.indexOf(id);
  return i === -1 ? PLATFORM_ORDER.length - 1 : i;
};

let cached: { db: AdminDb; view: View } | null = null;
let forceRebuild = false;

/** Call after anything that changes what users see (provider sync apply, service edits). The fingerprint also catches it. */
export function invalidateServicesCache(): void {
  forceRebuild = true;
}

function fingerprint(db: AdminDb): string {
  let h = 17;
  let n = 0;
  for (const s of db.services) {
    if (!s.imported) continue;
    n++;
    h = (Math.imul(h, 31) + Math.round(s.providerPrice * 100) + (s.active ? 1 : 0) + (s.providerRemoved ? 2 : 0) + s.min + (s.max % 9973) + s.name.length + Math.round(s.markup * 7) + s.categoryId.length) | 0;
    h = (Math.imul(h, 31) + finalPrice(s)) | 0;
  }
  const providers = db.providers.map((p) => `${p.id}:${p.status}:${p.kind ?? ""}`).join(",");
  return `${n}|${h}|${providers}`;
}

function buildView(db: AdminDb, fp: string): View {
  const all: Entry[] = [];
  for (const s of db.services) {
    if (!s.imported || !isUserVisible(db, s)) continue;
    const name = cleanServiceName(s.name);
    const row: ServiceRow = {
      id: s.id, name, categoryId: s.categoryId, price: finalPrice(s), min: s.min, max: s.max,
      refillDays: s.refill ? (s.refillDays ?? 30) : null,
    };
    all.push({ row, hay: `${s.id} ${name}`.toLowerCase(), platformId: s.platform || "lainnya", num: Number(s.id), src: s });
  }
  all.sort((a, b) => (Number.isFinite(a.num) && Number.isFinite(b.num) ? a.num - b.num : a.row.id.localeCompare(b.row.id)));
  const byId = new Map<string, Entry>();
  const byCategory = new Map<string, Entry[]>();
  const labels = new Map<string, { label: string; platformId: string }>();
  for (const e of all) {
    byId.set(e.row.id, e);
    const list = byCategory.get(e.row.categoryId);
    if (list) list.push(e);
    else byCategory.set(e.row.categoryId, [e]);
    if (!labels.has(e.row.categoryId)) labels.set(e.row.categoryId, { label: e.src.categoryLabel || "Lainnya", platformId: e.platformId });
  }
  const categories = sortCategories(Array.from(labels, ([id, v]) => ({ id, label: v.label, platformId: v.platformId, count: byCategory.get(id)!.length })));
  return { fingerprint: fp, all, byId, byCategory, categories, sortedCache: new Map() };
}

function sortCategories(list: CategoryRow[]): CategoryRow[] {
  return list.sort((a, b) => platformRank(a.platformId) - platformRank(b.platformId) || a.label.localeCompare(b.label, "id", { numeric: true }));
}

function viewOf(db: AdminDb): View {
  const fp = fingerprint(db);
  if (cached && cached.db === db && cached.view.fingerprint === fp && !forceRebuild) return cached.view;
  forceRebuild = false;
  const view = buildView(db, fp);
  cached = { db, view };
  return view;
}

function comparator(sort: ServiceSort): (a: Entry, b: Entry) => number {
  switch (sort) {
    case "termurah": return (a, b) => a.row.price - b.row.price || a.num - b.num;
    case "termahal": return (a, b) => b.row.price - a.row.price || a.num - b.num;
    case "tercepat": return (a, b) => (b.row.speed ?? 0) - (a.row.speed ?? 0) || a.num - b.num;
    default: return (a, b) => a.num - b.num;
  }
}

function sortedAll(view: View, sort: ServiceSort): Entry[] {
  if (sort === "id-asc") return view.all;
  const hit = view.sortedCache.get(sort);
  if (hit) return hit;
  const list = [...view.all];
  list.sort(comparator(sort));
  view.sortedCache.set(sort, list);
  return list;
}

type Filter = (e: Entry) => boolean;

function buildFilter(q: ServicesQuery): Filter | null {
  const text = (q.search ?? "").trim().toLowerCase();
  const tokens = text.length >= MIN_SEARCH_LENGTH ? text.split(/\s+/).filter(Boolean) : [];
  const fav = q.favoritesOnly ? new Set(q.favoriteIds ?? []) : null;
  const { priceMin, priceMax, guarantee, platform } = q;
  const checks: Filter[] = [];
  if (platform && platform !== "semua") checks.push((e) => e.platformId === platform);
  if (tokens.length) checks.push((e) => tokens.every((t) => e.hay.includes(t)));
  if (typeof priceMin === "number" && Number.isFinite(priceMin)) checks.push((e) => e.row.price >= priceMin);
  if (typeof priceMax === "number" && Number.isFinite(priceMax)) checks.push((e) => e.row.price <= priceMax);
  if (guarantee === "ada-garansi") checks.push((e) => e.row.refillDays !== null);
  else if (guarantee === "tanpa-garansi") checks.push((e) => e.row.refillDays === null);
  if (fav) checks.push((e) => fav.has(e.row.id));
  if (checks.length === 0) return null;
  return (e) => {
    for (const c of checks) if (!c(e)) return false;
    return true;
  };
}

function parseCursor(cursor: string | null | undefined): number {
  const n = Number(cursor);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/** One page of services, filtered, sorted and paginated on the server. `cursor` is opaque: pass back `nextCursor`. */
export function getServices(db: AdminDb, q: ServicesQuery = {}): ServicesPage {
  const view = viewOf(db);
  const sort = q.sort ?? "id-asc";
  const limit = Math.min(Math.max(Math.floor(q.limit ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const offset = parseCursor(q.cursor);
  const filter = buildFilter(q);

  let base: Entry[];
  if (q.category) {
    const list = view.byCategory.get(q.category) ?? [];
    base = sort === "id-asc" ? list : [...list].sort(comparator(sort));
  } else {
    base = sortedAll(view, sort);
  }
  const matched = filter ? base.filter(filter) : base;
  const slice = matched.slice(offset, offset + limit);
  const fav = q.favoriteIds ? new Set(q.favoriteIds) : null;
  const items = slice.map((e) => (fav ? { ...e.row, favorite: fav.has(e.row.id) } : e.row));
  const next = offset + limit;
  return { items, nextCursor: next < matched.length ? String(next) : null, total: matched.length };
}

/** Categories with the number of services in them. With filters (search, platform, price, ...), counts only matching services. */
export function listCategories(db: AdminDb, q: Omit<ServicesQuery, "category" | "cursor" | "limit" | "sort"> = {}): CategoryRow[] {
  const view = viewOf(db);
  const filter = buildFilter(q);
  if (!filter) return view.categories;
  const counts = new Map<string, number>();
  for (const e of view.all) if (filter(e)) counts.set(e.row.categoryId, (counts.get(e.row.categoryId) ?? 0) + 1);
  const rows: CategoryRow[] = [];
  for (const c of view.categories) {
    const count = counts.get(c.id);
    if (count) rows.push({ ...c, count });
  }
  return rows;
}

/** What the order page needs on first render: whether any service exists, and the preselected service (?service=ID) with its category. */
export function getOrderBootstrap(db: AdminDb, serviceId?: string): { hasServices: boolean; preselect: { service: ServiceDetailData; category: CategoryRow | null } | null } {
  const view = viewOf(db);
  const service = serviceId ? getServiceDetail(db, serviceId) : null;
  const category = service ? (view.categories.find((c) => c.id === service.categoryId) ?? null) : null;
  return { hasServices: view.all.length > 0, preselect: service ? { service, category } : null };
}

/** Total number of services users can see (cheap). */
export function countServices(db: AdminDb): number {
  return viewOf(db).all.length;
}

/** Rows for specific ids (mass order validation, preselected service). At most 100 ids. */
export function getServicesByIds(db: AdminDb, ids: string[]): ServiceRow[] {
  const view = viewOf(db);
  const out: ServiceRow[] = [];
  for (const id of ids.slice(0, 100)) {
    const e = view.byId.get(id);
    if (e) out.push(e.row);
  }
  return out;
}

/** One service with its description, fetched on demand ("Deskripsi", the order form's detail panel). */
export function getServiceDetail(db: AdminDb, id: string): ServiceDetailData | null {
  const e = viewOf(db).byId.get(id);
  if (!e) return null;
  const s = e.src;
  return {
    ...e.row,
    badges: [],
    guarantee: s.refill ? "Garansi refill" : "Tanpa garansi",
    linkFormat: "https://",
    estimate: "Bervariasi",
    description: [s.providerName && s.providerName !== e.row.name ? `Nama asli di provider: ${s.providerName}` : e.row.name],
  };
}
