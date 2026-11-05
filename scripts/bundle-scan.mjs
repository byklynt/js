// Security check: after `npm run build`, no secret VALUE may appear anywhere in .next, and the client bundle must not even
// mention the service-role key. Secrets are read from .env.local and never printed.  Usage: node scripts/bundle-scan.mjs
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const env = {};
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0 && !line.trim().startsWith("#")) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
}
const SECRET_NAMES = ["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "PROVIDER_KEY_ENC_KEY", "LIKEO_API_KEY", "CRON_SECRET", "PAYMENT_WEBHOOK_SECRET"];
const secrets = SECRET_NAMES.filter((k) => env[k] && env[k].length >= 12).map((k) => [k, env[k]]);

function* walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (f === "cache" || f === "dev") continue;
      yield* walk(p);
    } else if (s.size < 8_000_000) yield p;
  }
}

if (!existsSync(".next")) {
  console.error("Jalankan `npm run build` dulu.");
  process.exit(1);
}
let files = 0;
let clientFiles = 0;
let failed = false;
const found = new Map();
const nameHits = [];
for (const p of walk(".next")) {
  files++;
  const client = p.split("\\").join("/").includes(".next/static/");
  if (client) clientFiles++;
  let text;
  try {
    text = readFileSync(p, "utf8");
  } catch {
    continue;
  }
  for (const [k, v] of secrets) if (text.includes(v)) found.set(k, [...(found.get(k) ?? []), p]);
  if (client && /SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|service_role/.test(text)) nameHits.push(p);
}
console.log(`dipindai: ${files} berkas (${clientFiles} berkas klien di .next/static), ${secrets.length} rahasia diperiksa`);
for (const [k] of secrets) {
  const hit = found.get(k);
  if (hit) failed = true;
  console.log(`${k.padEnd(28)} ${hit ? `DITEMUKAN di ${hit.length} berkas, contoh: ${hit[0]}` : "tidak ada"}`);
}
console.log(`berkas klien yang menyebut nama kunci service-role: ${nameHits.length}`);
if (nameHits.length) failed = true;
process.exit(failed ? 1 : 0);
