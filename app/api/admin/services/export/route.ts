import { requireAdmin } from "@/lib/auth-server";
import { finalPrice, setPriceRounding } from "@/lib/admin-data";
import { loadProviders } from "@/lib/server/repo/providers";
import { loadServicesOf } from "@/lib/server/repo/services-repo";
import { loadSettings } from "@/lib/server/repo/settings";

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
  const [providers, settings] = await Promise.all([loadProviders(), loadSettings()]);
  setPriceRounding(settings.pricing.roundTo);
  const header = "id,nama,provider,id_provider,harga_provider,markup_jenis,markup,harga_akhir,min,maks,refill,batal,aktif,urutan";
  const lines: string[] = [header];
  for (const p of providers) {
    for (const s of await loadServicesOf(p.id)) {
      lines.push([s.id, s.name, p.name, s.providerServiceId, s.providerPrice, s.markupType, s.markup, finalPrice(s), s.min, s.max, s.refill, s.cancel, s.active, s.sort].map(cell).join(","));
    }
  }
  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="layanan-jagoansosmed.csv"', "Cache-Control": "private, no-store" },
  });
}
