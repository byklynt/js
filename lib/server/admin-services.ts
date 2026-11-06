import "server-only";
import type { AdminService } from "@/lib/admin-data";
import { loadSettings } from "@/lib/server/repo/settings";
import { toAdminService } from "@/lib/server/repo/services-repo";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { statsFromColumns } from "@/lib/service-estimate";
import { normalizeServiceSearch } from "@/lib/search-text";

/**
 * Admin service list: filtered, searched and paginated in Postgres (admin_services_page / admin_services_meta). The admin page never
 * receives the whole catalogue: one page at a time plus the category counts.
 */
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

export async function adminServicesPage(q: AdminServicesQuery = {}): Promise<AdminServicesPage> {
  const limit = Math.min(Math.max(Math.floor(q.limit ?? ADMIN_PAGE_SIZE) || ADMIN_PAGE_SIZE, 1), 100);
  const offset = Number.isInteger(Number(q.cursor)) && Number(q.cursor) > 0 ? Number(q.cursor) : 0;
  const minMargin = (await loadSettings()).pricing.minMarginPercent;
  const { data, error } = await supabaseAdmin().rpc("admin_services_page", {
    p_category: q.category, p_thin: Boolean(q.thinMargin), p_search: normalizeServiceSearch(q.search) || undefined, p_min_margin: minMargin, p_offset: offset, p_limit: limit,
  });
  if (error) throw new Error(`admin_services_page: ${error.message}`);
  const rows = (data ?? []) as { service: Record<string, unknown>; total: number }[];
  const total = rows.length ? Number(rows[0].total) : 0;
  const items = rows.map((r) => toAdminService({ ...(r.service as Record<string, unknown>), category: { label: String(r.service.category_label ?? "Lainnya") } } as never));
  // Measured delivery times + manual text for the services on this page: two batched reads, never one per row.
  if (items.length) {
    const ids = items.map((i) => i.id);
    const [{ data: stats }, { data: over }] = await Promise.all([
      supabaseAdmin().from("service_completion_stats").select("*").in("service_id", ids),
      supabaseAdmin().from("services").select("id,estimate_override").in("id", ids),
    ]);
    const minSamples = (await loadSettings()).estimates.minSamples;
    const statBy = new Map((stats ?? []).map((r) => [r.service_id, r]));
    const overBy = new Map((over ?? []).map((r) => [r.id, r.estimate_override]));
    for (const it of items) {
      const st = statBy.get(it.id);
      it.estimateOverride = overBy.get(it.id) ?? null;
      it.estimate = statsFromColumns({
        est_n: st?.sample_count, est_median: st?.median_seconds, est_p25: st?.p25_seconds, est_p75: st?.p75_seconds, est_buckets: st?.buckets, est_override: it.estimateOverride, est_min: minSamples,
      });
    }
  }
  const next = offset + limit;
  return { items, nextCursor: next < total ? String(next) : null, total };
}

export async function adminServicesMeta(): Promise<AdminServicesMeta> {
  const minMargin = (await loadSettings()).pricing.minMarginPercent;
  const { data, error } = await supabaseAdmin().rpc("admin_services_meta", { p_min_margin: minMargin });
  if (error) throw new Error(`admin_services_meta: ${error.message}`);
  const m = data as unknown as { total: number; thin: number; categories: { id: string; label: string; count: number }[] };
  return { total: Number(m.total), thinCount: Number(m.thin), categories: m.categories ?? [] };
}
