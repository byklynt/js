/**
 * BOOTSTRAP: the only seed. Run with: npm run bootstrap
 *
 * Creates (never overwrites) what the app needs to operate, nothing else:
 *  - site_settings: cancel policy 72 jam / 50%, bonus tiers (none), low-balance thresholds, maintenance off.
 *    Exchange rate and markup are stored as "belum diatur" (0) so a catalogue sync is blocked until the admin sets them.
 *  - service_rules: the platform rule texts (version v1).
 *  - the Likeo provider row (empty balance until fetched). Its API key is read from LIKEO_API_KEY in the environment and
 *    stored ENCRYPTED (AES-256-GCM, PROVIDER_KEY_ENC_KEY) in providers.api_key_encrypted.
 * The first admin is created with: npm run admin:create -- <username> <email>
 * Existing rows are kept, so running this again is safe.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { defaultSettings } from "../lib/admin-data";
import { defaultOrderRules, RULE_KEYS } from "../lib/order-rules";
import { encryptSecret, getProviderEncKey } from "../lib/server/crypto-at-rest";
import { LIKEO_DEFAULT_URL, LIKEO_ID } from "../lib/server/providers/config";

function loadEnvFile() {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0 && !line.trim().startsWith("#")) {
      const k = line.slice(0, i).trim();
      if (process.env[k] === undefined) process.env[k] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    }
  }
}
loadEnvFile();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SECRET_KEY harus ada di .env.local.");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function main() {
  // 1. site settings
  const settings = defaultSettings();
  const { orderRules: _rules, ...data } = settings;
  void _rules;
  data.pricing = { ...data.pricing, rateIdr: 0, defaultMarkup: { markupType: "persen", markup: 0 } }; // "belum diatur"
  const existing = await db.from("site_settings").select("id").maybeSingle();
  if (existing.data) console.log("site_settings: sudah ada, tidak diubah.");
  else {
    const { error } = await db.from("site_settings").insert({ id: true, data: data as never });
    if (error) throw new Error(`site_settings: ${error.message}`);
    console.log("site_settings: dibuat (kebijakan batal 72 jam / 50%, kurs & markup belum diatur).");
  }

  // 2. platform rules (never overwrite an admin edit)
  const rules = defaultOrderRules();
  const { data: haveRules } = await db.from("service_rules").select("platform");
  const have = new Set((haveRules ?? []).map((r) => r.platform));
  const rows = RULE_KEYS.filter((k) => !have.has(k)).map((k) => ({ platform: k, label: rules[k].label, title: rules[k].title, bullets: rules[k].bullets, version: rules[k].version }));
  if (rows.length) {
    const { error } = await db.from("service_rules").insert(rows);
    if (error) throw new Error(`service_rules: ${error.message}`);
  }
  console.log(`service_rules: ${rows.length} ditambahkan, ${have.size} sudah ada.`);

  // 3. Likeo provider (key encrypted)
  const mode = process.env.PROVIDER_MODE?.trim().toLowerCase() === "mock" ? "mock" : "live";
  const apiKey = process.env.LIKEO_API_KEY?.trim();
  let encrypted: string | null = null;
  if (apiKey && apiKey !== "isi_api_key_likeo_di_sini") {
    try {
      encrypted = encryptSecret(apiKey, getProviderEncKey());
    } catch (e) {
      console.warn(`Kunci provider TIDAK disimpan: ${e instanceof Error ? e.message : e}`);
    }
  }
  const { data: prov } = await db.from("providers").select("id,api_key_encrypted").eq("id", LIKEO_ID).maybeSingle();
  if (!prov) {
    const { error } = await db.from("providers").insert({
      id: LIKEO_ID, name: "Likeo", slug: "likeo", api_url: process.env.LIKEO_API_URL?.trim() || LIKEO_DEFAULT_URL, api_key_encrypted: encrypted,
      mode, active: true, currency: "USD", exchange_rate: null, low_balance_threshold: settings.operations.lowBalanceThreshold,
    });
    if (error) throw new Error(`providers: ${error.message}`);
    console.log(`providers: Likeo dibuat (kunci ${encrypted ? "tersimpan terenkripsi" : "belum ada"}).`);
  } else if (!prov.api_key_encrypted && encrypted) {
    await db.from("providers").update({ api_key_encrypted: encrypted }).eq("id", LIKEO_ID);
    console.log("providers: kunci Likeo disimpan terenkripsi.");
  } else console.log("providers: Likeo sudah ada, tidak diubah.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
