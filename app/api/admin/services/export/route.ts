import { requireAdmin } from "@/lib/auth-server";
import { getDb } from "@/lib/admin-db";
import { finalPrice } from "@/lib/admin-data";
import { withAdminDb } from "@/lib/server/admin-snapshot";

/** Escape a CSV cell and neutralise spreadsheet formulas (=, +, -, @). */
function cell(value: string | number | boolean): string {
  const text = String(value);
  const safe = /^[=+\-@]/.test(text) && typeof value === "string" ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** The full service list as CSV (admins only). The page itself only ever loads one page at a time. */
export async function GET() {
  try {
    await requireAdmin("action");
  } catch {
    return new Response("Tidak diizinkan.", { status: 401 });
  }
  return withAdminDb(async () => {
  const db = getDb();
  const known = new Set(db.providers.map((p) => p.id));
  const provider = (id: string) => db.providers.find((p) => p.id === id)?.name ?? id;
  const header = "id,nama,provider,id_provider,harga_provider,markup_jenis,markup,harga_akhir,min,maks,refill,batal,aktif,urutan";
  const rows = db.services
    .filter((s) => known.has(s.providerId))
    .map((s) => [s.id, s.name, provider(s.providerId), s.providerServiceId, s.providerPrice, s.markupType, s.markup, finalPrice(s), s.min, s.max, s.refill, s.cancel, s.active, s.sort].map(cell).join(","));
  return new Response([header, ...rows].join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="layanan-jagoansosmed.csv"', "Cache-Control": "private, no-store" },
  });
  });
}
