import { requireAdmin } from "@/lib/auth-server";
import { getDb } from "@/lib/admin-db";
import { adminServicesPage } from "@/lib/server/admin-services";
import { withAdminDb } from "@/lib/server/admin-snapshot";

const HEADERS = { "Cache-Control": "private, no-store" };

/** One page of the admin service list (admins only). Filters, search and pagination run on the server. */
export async function GET(request: Request) {
  try {
    await requireAdmin("action");
  } catch {
    return Response.json({ error: "Tidak diizinkan." }, { status: 401, headers: HEADERS });
  }
  const p = new URL(request.url).searchParams;
  const filter = p.get("filter") ?? "semua";
  const page = await withAdminDb(async () => adminServicesPage(getDb(), {
    thinMargin: filter === "margin",
    category: filter !== "semua" && filter !== "margin" ? filter.slice(0, 80) : undefined,
    search: p.get("search")?.slice(0, 80) ?? undefined,
    cursor: p.get("cursor"),
    limit: Number(p.get("limit")) || undefined,
  }));
  return Response.json(page, { headers: HEADERS });
}
