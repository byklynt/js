import { requireAdmin } from "@/lib/auth-server";
import { getDb } from "@/lib/admin-db";

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
  const db = getDb();
  const names = new Map(db.users.map((u) => [u.id, u.username]));

  const rows = db.ledger.filter((l) => {
    if (type && l.type !== type) return false;
    const day = l.createdAt.slice(0, 10);
    if (from && day < from) return false;
    if (to && day > to) return false;
    if (!q) return true;
    return (names.get(l.userId) ?? "").toLowerCase().includes(q) || l.refId.toLowerCase().includes(q) || l.note.toLowerCase().includes(q);
  });

  const header = ["Waktu", "Pengguna", "Jenis", "Nominal", "Saldo sebelum", "Saldo sesudah", "Referensi", "Catatan", "Dibuat oleh"];
  const lines = [header.map(cell).join(",")];
  for (const l of rows) {
    lines.push([l.createdAt, names.get(l.userId) ?? l.userId, l.type, l.amount, l.balanceBefore, l.balanceAfter, `${l.refType}:${l.refId}`, l.note, l.createdBy].map(cell).join(","));
  }
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="buku-besar.csv"',
      "Cache-Control": "no-store",
    },
  });
}
