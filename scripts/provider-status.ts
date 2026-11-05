/**
 * Diagnostic: npm run provider:status -- <order id>
 * Prints, for ONE order: the order row, the RAW answer of the provider's `status` call, the parsed fields and the mapped internal status.
 * Read-only (it changes nothing). The API key is decrypted in memory and never printed.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { decryptSecret, getProviderEncKey } from "../lib/server/crypto-at-rest";
import { mapProviderStatus } from "../lib/server/rules";
import { mapLikeoStatus } from "../lib/server/providers/likeo";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0 && !line.trim().startsWith("#") && process.env[line.slice(0, i).trim()] === undefined) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
}
const orderId = Number(process.argv[2]);
if (!Number.isInteger(orderId)) {
  console.error("Pemakaian: npm run provider:status -- <id pesanan>");
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;
const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

async function main() {
  const { data: o } = await db.from("orders").select("id,status,provider_order_id,provider_id,quantity,remains,start_count,last_synced_at,submit_attempts,needs_manual_check,created_at").eq("id", orderId).maybeSingle();
  if (!o) throw new Error("Pesanan tidak ditemukan.");
  console.log("ORDER ROW:", JSON.stringify(o));
  if (!o.provider_order_id) throw new Error("Pesanan ini belum punya provider_order_id (tidak pernah diterima provider).");
  const { data: p } = await db.from("providers").select("api_url,api_key_encrypted").eq("id", o.provider_id).single();
  let key: string | null = null;
  try {
    key = p?.api_key_encrypted ? decryptSecret(p.api_key_encrypted, getProviderEncKey()) : null;
  } catch {
    key = null;
  }
  key ??= process.env.LIKEO_API_KEY?.trim() || null;
  if (!key) throw new Error("API key tidak tersedia.");
  const apiUrl = process.env.LIKEO_API_URL?.trim() || p?.api_url || "https://likeo.net/api/v2";
  const res = await fetch(apiUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: new URLSearchParams({ key, action: "status", order: o.provider_order_id }).toString() });
  const text = await res.text();
  console.log(`RAW (HTTP ${res.status}):`, text.split(key).join("[KEY]").slice(0, 600));
  const j = JSON.parse(text) as { status?: string; start_count?: string | number; remains?: string | number };
  console.log("PARSED:", JSON.stringify({ status: j.status, start_count: j.start_count, remains: j.remains }));
  console.log("MAPPED (adapter):", mapLikeoStatus(String(j.status ?? "")), "| MAPPED (sync rule):", mapProviderStatus(String(j.status ?? "")));
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
