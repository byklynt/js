import { requireAdmin } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

/** Escape a CSV cell and neutralise spreadsheet formulas (=, +, -, @). */
function cell(value: string | number): string {
  const text = String(value);
  const safe = /^[=+\-@]/.test(text) && typeof value === "string" ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  try {
    await requireAdmin("action");
  } catch {
    return new Response("Tidak diizinkan.", { status: 401 });
  }
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const q = (url.searchParams.get("q") ?? "").toLowerCase();
  // The export reads the REAL ledger (not the dashboard snapshot), filtered in SQL, in pages of 1000 up to 20,000 rows.
  const db = supabaseAdmin();
  const rows: { created_at: string; user_id: string; type: string; amount: number; balance_before: number; balance_after: number; ref_type: string; ref_id: string; note: string; created_by: string; user: { username: string } | null }[] = [];
  for (let offset = 0; offset < 20_000; offset += 1000) {
    let query = db.from("balance_ledger").select("*, user:profiles!balance_ledger_user_id_fkey(username)").order("created_at", { ascending: false }).range(offset, offset + 999);
    if (type) query = query.eq("type", type);
    if (from) query = query.gte("created_at", `${from}T00:00:00+07:00`);
    if (to) query = query.lte("created_at", `${to}T23:59:59.999+07:00`);
    const { data } = await query;
    rows.push(...((data ?? []) as unknown as typeof rows));
    if ((data?.length ?? 0) < 1000) break;
  }
  const shown = q ? rows.filter((l) => (l.user?.username ?? "").toLowerCase().includes(q) || l.ref_id.toLowerCase().includes(q) || l.note.toLowerCase().includes(q)) : rows;

  const header = ["Waktu", "Pengguna", "Jenis", "Nominal", "Saldo sebelum", "Saldo sesudah", "Referensi", "Catatan", "Dibuat oleh"];
  const lines = [header.map(cell).join(",")];
  for (const l of shown) {
    lines.push([l.created_at, l.user?.username ?? l.user_id, l.type, Number(l.amount), Number(l.balance_before), Number(l.balance_after), `${l.ref_type}:${l.ref_id}`, l.note, l.created_by].map(cell).join(","));
  }
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="buku-besar.csv"',
      "Cache-Control": "no-store",
    },
  });
}
