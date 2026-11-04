// Dev only: npm run provider:check
// Prints the resolved provider mode, then calls Likeo (action=balance and action=services) and prints the RAW JSON shape,
// so the adapter can be matched to the real API. Never prints the API key (only whether it is set).
import { existsSync } from "node:fs";

// Same precedence as `next dev`: .env.development.local, .env.local, .env.development, .env (first one wins).
const files = [".env.development.local", ".env.local", ".env.development", ".env"];
const loaded = [];
for (const f of files) {
  if (existsSync(f)) {
    process.loadEnvFile(f); // does not override variables that are already set
    loaded.push(f);
  }
}

const rawMode = process.env.PROVIDER_MODE;
const mode = (rawMode ?? "").trim().replace(/^["']|["']$/g, "").toLowerCase() === "live" ? "live" : "mock";
const key = (process.env.LIKEO_API_KEY ?? "").trim();
const keySet = key !== "" && key !== "isi_api_key_likeo_di_sini";
const url = (process.env.LIKEO_API_URL ?? "").trim() || "https://likeo.net/api/v2";

console.log("env files read      :", loaded.join(", ") || "(none)");
console.log("PROVIDER_MODE (raw) :", rawMode === undefined ? "(not set)" : JSON.stringify(rawMode));
console.log("resolved mode       :", mode, mode === "live" ? "" : "(anything other than \"live\" means mock)");
console.log("LIKEO_API_KEY set   :", keySet);
console.log("LIKEO_API_URL       :", url);
console.log("");

if (!keySet) {
  console.error("LIKEO_API_KEY belum diisi. Isi di .env.local lalu jalankan lagi.");
  process.exit(1);
}
if (mode !== "live") console.log("Catatan: mode di app = mock. Skrip ini tetap memanggil Likeo sungguhan untuk diagnosa.\n");

const redact = (text) => (key.length >= 4 ? String(text).split(key).join("***") : String(text));

/** Compact description of a JSON value: types instead of data. */
function shape(v, depth = 0) {
  if (v === null) return "null";
  if (Array.isArray(v)) return v.length === 0 ? "[]" : `[${shape(v[0], depth + 1)}] (length ${v.length})`;
  if (typeof v === "object") {
    if (depth > 3) return "{...}";
    return "{ " + Object.entries(v).map(([k, x]) => `${k}: ${shape(x, depth + 1)}`).join(", ") + " }";
  }
  return typeof v;
}

async function call(action, extra = {}) {
  const started = Date.now();
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ key, action, ...extra }).toString(),
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    console.error(`[${action}] GAGAL tanpa respons:`, redact(e?.cause?.code ?? e?.name ?? "error"), redact(e?.cause?.message ?? e?.message ?? ""));
    return null;
  }
  const body = await res.text();
  const ms = Date.now() - started;
  console.log(`[${action}] HTTP ${res.status} ${res.statusText} · ${ms} ms · content-type: ${res.headers.get("content-type") ?? "?"}`);
  if (res.status >= 300 && res.status < 400) console.log(`[${action}] redirect ke:`, redact(res.headers.get("location") ?? "?"));
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    console.log(`[${action}] BUKAN JSON. 200 karakter pertama:`, redact(body.replace(/\s+/g, " ").slice(0, 200)));
    return null;
  }
  console.log(`[${action}] shape:`, redact(shape(json)));
  return json;
}

const balance = await call("balance");
if (balance !== null) console.log("[balance] raw JSON:", redact(JSON.stringify(balance)));
console.log("");

const services = await call("services");
if (Array.isArray(services)) {
  console.log(`[services] total: ${services.length}; 3 item pertama (raw JSON):`);
  console.log(redact(JSON.stringify(services.slice(0, 3), null, 2)));
  const types = {};
  for (const s of services) types[s?.type ?? "(tanpa type)"] = (types[s?.type ?? "(tanpa type)"] ?? 0) + 1;
  console.log("[services] jumlah per type:", JSON.stringify(types));
} else if (services !== null) {
  console.log("[services] raw JSON:", redact(JSON.stringify(services).slice(0, 400)));
}
