import "server-only";
import { cleanServiceName } from "@/lib/service-format";
import { chooseEstimate, statsFromColumns } from "@/lib/service-estimate";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import {
  DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, MIN_SEARCH_LENGTH,
  type CategoryRow, type ServiceDetailData, type ServiceRow, type ServicesPage, type ServicesQuery,
} from "@/lib/services-types";

/**
 * The user-facing service catalogue, queried in Postgres (functions catalogue_page / catalogue_categories over the
 * catalogue_services view; trigram index for name search, expression index for the numeric id order). Nothing here
 * sends the whole catalogue anywhere: callers get one page of lightweight rows, the category list with counts, or one
 * service in full. Only public fields leave this module (never provider ids, cost or markup).
 * Visibility rule (in the view): active, priced, not dropped by the provider, provider active, imported.
 */

const PLATFORM_ORDER = ["instagram", "youtube", "tiktok", "twitter", "spotify", "telegram", "facebook", "twitch", "reddit", "website-traffic", "seo-backlink", "lainnya"];
const platformRank = (id: string) => {
  const i = PLATFORM_ORDER.indexOf(id);
  return i === -1 ? PLATFORM_ORDER.length - 1 : i;
};

type PageRow = { id: string; name: string; category_id: string; price: number; min: number; max: number; refill_days: number | null; avg_time: string | null; speed: number | null; total: number;
  est_n?: number | null; est_median?: number | null; est_p25?: number | null; est_p75?: number | null; est_buckets?: unknown; est_override?: string | null; est_min?: number | null };

const rowOf = (r: Omit<PageRow, "total">): ServiceRow => ({
  ...(statsFromColumns(r) ? { est: statsFromColumns(r) } : {}),
  id: r.id, name: cleanServiceName(r.name), categoryId: r.category_id, price: Number(r.price), min: Number(r.min), max: Number(r.max),
  refillDays: r.refill_days === null ? null : Number(r.refill_days),
  ...(r.avg_time ? { avgTime: r.avg_time } : {}), ...(r.speed ? { speed: Number(r.speed) } : {}),
});

function filterArgs(q: ServicesQuery) {
  const text = (q.search ?? "").trim();
  const ids = q.favoritesOnly ? (q.favoriteIds ?? []) : undefined;
  return {
    p_platform: q.platform && q.platform !== "semua" ? q.platform : undefined,
    p_search: text.length >= MIN_SEARCH_LENGTH ? text : undefined,
    p_price_min: typeof q.priceMin === "number" && Number.isFinite(q.priceMin) ? Math.floor(q.priceMin) : undefined,
    p_price_max: typeof q.priceMax === "number" && Number.isFinite(q.priceMax) ? Math.floor(q.priceMax) : undefined,
    p_guarantee: q.guarantee && q.guarantee !== "semua" ? q.guarantee : undefined,
    // "favorites only" with no favorites matches nothing (an empty array, not "no filter").
    p_ids: ids,
  };
}

function parseCursor(cursor: string | null | undefined): number {
  const n = Number(cursor);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/** One page of services, filtered, sorted and paginated in the database. `cursor` is opaque: pass back `nextCursor`. */
export async function getServices(q: ServicesQuery = {}): Promise<ServicesPage> {
  const limit = Math.min(Math.max(Math.floor(q.limit ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const offset = parseCursor(q.cursor);
  const { data, error } = await supabaseAdmin().rpc("catalogue_page", {
    p_category: q.category ?? undefined, p_sort: q.sort ?? "id-asc", p_offset: offset, p_limit: limit, ...filterArgs(q),
  });
  if (error) throw new Error(`catalogue_page: ${error.message}`);
  const rows = (data ?? []) as PageRow[];
  const total = rows.length ? Number(rows[0].total) : 0;
  const fav = q.favoriteIds ? new Set(q.favoriteIds) : null;
  const items = rows.map((r) => {
    const row = rowOf(r);
    return fav ? { ...row, favorite: fav.has(row.id) } : row;
  });
  const next = offset + limit;
  // An offset past the end returns no rows (and no total): report the real total with one cheap extra call only then.
  return { items, nextCursor: next < total ? String(next) : null, total };
}

/** Categories with the number of services in them. With filters (search, platform, price, ...), counts only matching services. */
export async function listCategories(q: Omit<ServicesQuery, "category" | "cursor" | "limit" | "sort"> = {}): Promise<CategoryRow[]> {
  const { data, error } = await supabaseAdmin().rpc("catalogue_categories", filterArgs(q));
  if (error) throw new Error(`catalogue_categories: ${error.message}`);
  const rows = ((data ?? []) as { id: string; label: string; platform: string; count: number }[]).map((r) => ({
    id: r.id, label: r.label || "Lainnya", platformId: r.platform || "lainnya", count: Number(r.count),
  }));
  return rows.sort((a, b) => platformRank(a.platformId) - platformRank(b.platformId) || a.label.localeCompare(b.label, "id", { numeric: true }));
}

/** Total number of services users can see (cheap). */
export async function countServices(): Promise<number> {
  const { count } = await supabaseAdmin().from("catalogue_services").select("id", { count: "exact", head: true });
  return count ?? 0;
}

/** Rows for specific ids (mass order validation, preselected service). At most 100 ids. */
export async function getServicesByIds(ids: string[]): Promise<ServiceRow[]> {
  const wanted = ids.slice(0, 100);
  if (!wanted.length) return [];
  const { data, error } = await supabaseAdmin().rpc("catalogue_page", { p_ids: wanted, p_limit: 100, p_offset: 0 });
  if (error) throw new Error(`catalogue_page: ${error.message}`);
  const byId = new Map(((data ?? []) as PageRow[]).map((r) => [r.id, rowOf(r)]));
  return wanted.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
}

/** One service with its description, fetched on demand ("Deskripsi", the order form's detail panel). */
export async function getServiceDetail(id: string): Promise<ServiceDetailData | null> {
  const { data } = await supabaseAdmin().from("catalogue_services").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const row = rowOf({ id: data.id!, name: data.name!, category_id: data.category_id!, price: data.price!, min: data.min!, max: data.max!, refill_days: data.refill_days, avg_time: data.avg_time, speed: data.speed,
    est_n: data.est_n, est_median: data.est_median, est_p25: data.est_p25, est_p75: data.est_p75, est_buckets: data.est_buckets, est_override: data.est_override, est_min: data.est_min });
  return {
    ...row,
    badges: [],
    guarantee: data.refill ? "Garansi refill" : "Tanpa garansi",
    linkFormat: "https://",
    // The panel's "Estimasi:" line: the provider's own text if it ever gives one, otherwise the measured estimate (service-wide) or "Belum ada estimasi".
    estimate: data.avg_time || chooseEstimate(row.est).text,
    description: [data.provider_name && data.provider_name !== data.name ? `Nama asli di provider: ${data.provider_name}` : row.name],
  };
}

/** What the order page needs on first render: whether any service exists, and the preselected service (?service=ID) with its category. */
export async function getOrderBootstrap(serviceId?: string): Promise<{ hasServices: boolean; preselect: { service: ServiceDetailData; category: CategoryRow | null } | null }> {
  const service = serviceId ? await getServiceDetail(serviceId) : null;
  const hasServices = service ? true : (await countServices()) > 0;
  const category = service ? ((await listCategories()).find((c) => c.id === service.categoryId) ?? null) : null;
  return { hasServices, preselect: service ? { service, category } : null };
}

/** Public price list (/services): names, prices and limits only. Read in pages of 1000 (the API's row cap). */
export async function getPublicCatalogue(): Promise<{ categories: { id: string; label: string; platformId: string }[]; items: { id: string; name: string; categoryId: string; price: number; min: number; max: number; refill: boolean }[] }> {
  const db = supabaseAdmin();
  const items: { id: string; name: string; categoryId: string; price: number; min: number; max: number; refill: boolean }[] = [];
  const cats = new Map<string, { id: string; label: string; platformId: string }>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("catalogue_services").select("id,name,category_id,category_label,platform,price,min,max,refill").order("id").range(from, from + 999);
    if (error) throw new Error(`catalogue_services: ${error.message}`);
    for (const r of data ?? []) {
      items.push({ id: r.id!, name: cleanServiceName(r.name!), categoryId: r.category_id!, price: Number(r.price), min: Number(r.min), max: Number(r.max), refill: Boolean(r.refill) });
      if (!cats.has(r.category_id!)) cats.set(r.category_id!, { id: r.category_id!, label: r.category_label || "Lainnya", platformId: r.platform || "lainnya" });
    }
    if ((data?.length ?? 0) < 1000) break;
  }
  items.sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0) || a.id.localeCompare(b.id));
  const categories = [...cats.values()].sort((a, b) => platformRank(a.platformId) - platformRank(b.platformId) || a.label.localeCompare(b.label, "id", { numeric: true }));
  return { categories, items };
}
