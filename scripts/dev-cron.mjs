// LOCAL scheduler: npm run dev:cron
// Calls the cron endpoints of a locally running app every CRON_INTERVAL_SECONDS (default 120 = 2 minutes), the way pg_cron does in production:
//   sync-orders every tick, stats-refresh every 30 minutes, sanity once a day. CRON_SECRET comes from .env.local and travels only in the
//   Authorization header. One log line per call. Ctrl+C stops cleanly.
import { existsSync, readFileSync } from "node:fs";

const env = {};
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0 && !line.trim().startsWith("#")) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
}
const get = (k) => process.env[k] ?? env[k];
const secret = get("CRON_SECRET");
const base = (get("CRON_BASE_URL") ?? "http://localhost:3000").replace(/\/+$/, "");
const interval = Math.max(10, Number(get("CRON_INTERVAL_SECONDS") ?? 120) || 120);

if (!secret) {
  console.error("CRON_SECRET belum diisi di .env.local.");
  process.exit(1);
}
if (!/^https:\/\//.test(base) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) {
  console.error("CRON_BASE_URL harus localhost atau HTTPS (rahasia tidak boleh lewat http ke host lain).");
  process.exit(1);
}

const ac = new AbortController();
let stopping = false;
process.on("SIGINT", () => {
  stopping = true;
  ac.abort();
  console.log("\n[dev:cron] berhenti.");
});

async function call(path) {
  const started = Date.now();
  try {
    const res = await fetch(`${base}${path}`, { method: "POST", headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.any([ac.signal, AbortSignal.timeout(65_000)]) });
    const body = await res.json().catch(() => ({}));
    const { ok: _ok, ...summary } = body;
    console.log(`[dev:cron] ${new Date().toLocaleTimeString("id-ID")} ${path} -> ${res.status} (${Date.now() - started} ms) ${JSON.stringify(summary)}`);
  } catch (e) {
    if (!stopping) console.log(`[dev:cron] ${new Date().toLocaleTimeString("id-ID")} ${path} -> GAGAL (${e instanceof Error ? e.message : "error"})`);
  }
}

console.log(`[dev:cron] ${base} setiap ${interval} detik. Ctrl+C untuk berhenti.`);
let tick = 0;
const everyTicks = (minutes) => Math.max(1, Math.round((minutes * 60) / interval));
while (!stopping) {
  await call("/api/cron/sync-orders");
  if (tick % everyTicks(30) === 0) await call("/api/cron/stats-refresh");
  if (tick % everyTicks(24 * 60) === 0) await call("/api/cron/sanity");
  tick++;
  await new Promise((r) => {
    const t = setTimeout(r, interval * 1000);
    ac.signal.addEventListener("abort", () => { clearTimeout(t); r(undefined); }, { once: true });
  });
}
