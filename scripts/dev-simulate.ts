/**
 * DEV ONLY provider simulator for the MOCK adapter:
 *   npm run dev:simulate -- <order_id> <partial|canceled|failed|completed|refill> [remains]
 *   npm run dev:simulate -- --clear
 * It makes the mock provider answer the given status for that order on the next sync (the app must run with PROVIDER_MODE=mock).
 * Refuses to run unless NEXT_PUBLIC_SUPABASE_URL matches SUPABASE_DEV_PROJECT_REF. Changes nothing in the database: it only reads the order.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { clearMockOverrides, writeMockOverride } from "../lib/server/providers/mock-overrides";
import { assertDevOnly } from "./lib/prod-guard.mjs";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0 && !line.trim().startsWith("#") && process.env[line.slice(0, i).trim()] === undefined) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
}
const fail = (m: string): never => {
  console.error(m);
  process.exit(1);
};
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
assertDevOnly(); // exact host match with SUPABASE_DEV_PROJECT_REF
if (process.env.PROVIDER_MODE?.trim().toLowerCase() !== "mock") fail("Ditolak: simulator hanya berlaku dengan PROVIDER_MODE=mock (di .env.local dan di server yang berjalan).");

const STATUSES: Record<string, string> = { partial: "Partial", canceled: "Canceled", cancelled: "Canceled", failed: "Failed", completed: "Completed", refill: "Completed" };

async function main() {
  if (process.argv[2] === "--clear") {
    clearMockOverrides();
    console.log("Semua override simulator dihapus.");
    return;
  }
  const orderId = Number(process.argv[2]);
  const kind = (process.argv[3] ?? "").toLowerCase();
  if (!Number.isInteger(orderId) || !STATUSES[kind]) fail("Pemakaian: npm run dev:simulate -- <id pesanan> <partial|canceled|failed|completed|refill> [remains]");
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: o } = await db.from("orders").select("id,status,provider_order_id,quantity,remains,start_count,charge").eq("id", orderId).maybeSingle();
  if (!o) return fail("Pesanan tidak ditemukan.");
  if (!o.provider_order_id.startsWith("MK-")) return fail(`Ditolak: pesanan ini bukan pesanan mock (provider_order_id "${o.provider_order_id}").`);
  let remains = 0;
  if (kind === "partial") {
    if (process.argv[4] === undefined || !/^\d+$/.test(process.argv[4])) return fail("Partial butuh nilai remains (bilangan bulat >= 0): npm run dev:simulate -- <id> partial <remains>");
    remains = Number(process.argv[4]);
    if (remains > o.quantity) console.warn(`Peringatan: remains ${remains} lebih besar dari jumlah pesanan ${o.quantity}. Sinkronisasi akan menolaknya.`);
  } else if (kind === "canceled" || kind === "cancelled" || kind === "failed") {
    remains = o.quantity;
  }
  writeMockOverride(o.provider_order_id, { status: STATUSES[kind], remains, startCount: Number(o.start_count) || 0 });
  console.log(`Pesanan #${o.id} (${o.provider_order_id}, status ${o.status}, jumlah ${o.quantity}, charge ${o.charge}): provider mock sekarang menjawab "${STATUSES[kind]}" dengan remains ${remains}.`);
  if (kind === "refill") console.log("Refill tersedia bila layanan mendukung refill; ajukan dari halaman pesanan pengguna.");
  console.log('Jalankan sinkronisasi (npm run dev:cron, atau "Sinkronkan sekarang" di /admin/orders).');
}
void main();
