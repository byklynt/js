import { getDb } from "@/lib/admin-db";
import { currentUserId } from "@/lib/current-user";
import { MAX_PAGE_SIZE, type GuaranteeFilter, type ServiceSort, type ServicesQuery } from "@/lib/services-types";

const SORTS: ServiceSort[] = ["id-asc", "termurah", "termahal", "tercepat"];
const GUARANTEES: GuaranteeFilter[] = ["semua", "ada-garansi", "tanpa-garansi"];

const num = (v: string | null): number | undefined => {
  if (v === null || v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/** Reads and validates the services query from a URL. Unknown or invalid values are ignored, never trusted. */
export function parseServicesQuery(params: URLSearchParams): ServicesQuery {
  const sort = params.get("sort");
  const guarantee = params.get("guarantee");
  const fav = (params.get("fav") ?? "").split(",").map((s) => s.trim()).filter((s) => /^[\w-]{1,40}$/.test(s)).slice(0, 500);
  return {
    category: params.get("category")?.slice(0, 80) || undefined,
    platform: params.get("platform")?.slice(0, 40) || undefined,
    search: params.get("search")?.slice(0, 80) || undefined,
    sort: SORTS.includes(sort as ServiceSort) ? (sort as ServiceSort) : undefined,
    guarantee: GUARANTEES.includes(guarantee as GuaranteeFilter) ? (guarantee as GuaranteeFilter) : undefined,
    priceMin: num(params.get("priceMin")),
    priceMax: num(params.get("priceMax")),
    favoritesOnly: params.get("favoritesOnly") === "1",
    favoriteIds: fav.length ? fav : undefined,
    cursor: params.get("cursor") ?? undefined,
    limit: Math.min(num(params.get("limit")) ?? 20, MAX_PAGE_SIZE),
  };
}

const HEADERS = { "Cache-Control": "private, no-store" };

/** Signed-in users only. Returns the db, or a ready 401 response. */
export async function userDbOr401(): Promise<{ db: ReturnType<typeof getDb> } | { response: Response }> {
  if (!(await currentUserId())) return { response: Response.json({ error: "Silakan masuk terlebih dahulu." }, { status: 401, headers: HEADERS }) };
  return { db: getDb() };
}

export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: HEADERS });
