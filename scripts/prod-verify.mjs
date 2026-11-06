// Read-only verification of a Supabase project after a deploy.
//   npm run prod:verify -- PROJECT_REF
//
// Reads NOTHING from files. Everything comes from the terminal session environment:
//   NEXT_PUBLIC_SUPABASE_URL          must be exactly https://PROJECT_REF.supabase.co
//   SUPABASE_SECRET_KEY               (or SUPABASE_SERVICE_ROLE_KEY) the service role / secret key of THAT project
//   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or ..._ANON_KEY)   optional: enables the live "anon cannot read" probe
// It calls public.prod_verify() (migration 28, service role only) and, with the anon key, probes every table over REST. It writes nothing.
// Prints a pass/fail table and exits 1 when anything fails.
import { checkProdTarget, readDevRef, urlMatchesRef } from "./lib/prod-guard.mjs";

const ref = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "";
const die = (m) => {
  console.error(m);
  process.exit(1);
};

const check = checkProdTarget(ref, readDevRef());
// Verifying the DEV project is harmless (read-only) and useful as a rehearsal, so only a malformed ref stops us here.
if (!check.ok && !/DITOLAK/.test(check.error)) die(check.error);
const isDev = !check.ok;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (!urlMatchesRef(url, ref)) die(`NEXT_PUBLIC_SUPABASE_URL di session harus persis https://${ref}.supabase.co (dibaca dari environment saja, bukan dari file).`);
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!serviceKey) die("SUPABASE_SECRET_KEY (atau SUPABASE_SERVICE_ROLE_KEY) belum ada di session terminal ini.");
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const rows = [];
const add = (name, ok, detail) => rows.push({ name, ok, detail });
const base = url.replace(/\/$/, "");

async function rest(path, key, init = {}) {
  return fetch(`${base}${path}`, { ...init, headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
}

console.log(`\nprod:verify -> ${ref}${isDev ? "  (project DEV, hanya latihan)" : ""}\n`);

let report = null;
try {
  const res = await rest("/rest/v1/rpc/prod_verify", serviceKey, { method: "POST", body: "{}" });
  if (res.ok) report = await res.json();
  else add("Fungsi prod_verify() bisa dipanggil dengan service role", false, `HTTP ${res.status}: migrasi 28 belum diterapkan, atau kunci bukan service role`);
} catch (e) {
  add("Menghubungi project", false, e instanceof Error ? e.message : String(e));
}

if (report) {
  add("Fungsi prod_verify() bisa dipanggil dengan service role", true, "migrasi 28 terpasang");
  const list = (a) => (a.length ? a.join(", ") : "-");

  add("Semua tabel public memakai RLS", report.rlsDisabled.length === 0, report.rlsDisabled.length ? `RLS mati: ${list(report.rlsDisabled)}` : `${report.tables.length} tabel`);
  add("Role anon tidak punya akses ke tabel/view mana pun", report.anonAccess.length === 0, report.anonAccess.length ? `anon bisa akses: ${list(report.anonAccess)}` : "tidak ada hak akses");
  add("Tidak ada policy untuk anon / public", report.anonPolicies.length === 0, report.anonPolicies.length ? list(report.anonPolicies) : "tidak ada policy");

  if (anonKey) {
    const readable = [];
    for (const t of report.tables) {
      const r = await rest(`/rest/v1/${encodeURIComponent(t)}?select=*&limit=1`, anonKey);
      if (r.ok) {
        const body = await r.json().catch(() => []);
        if (Array.isArray(body) && body.length > 0) readable.push(t);
      }
    }
    add("Probe REST dengan kunci anon: tidak ada baris yang terbaca", readable.length === 0, readable.length ? `terbaca: ${list(readable)}` : `${report.tables.length} tabel diperiksa`);
  } else {
    add("Probe REST dengan kunci anon", false, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY tidak ada di session: pemeriksaan ini dilewati (dianggap gagal)");
  }

  for (const [name, ok] of Object.entries(report.integrity)) add(`Integritas uang: ${name}`, Boolean(ok), ok ? "ada" : "TIDAK ADA");
  add("Tabel cron_leases ada", Boolean(report.present.cron_leases), "");
  add("Tabel rate_limits ada", Boolean(report.present.rate_limits), "");

  const bucket = (id) => report.buckets.find((b) => b.id === id);
  const att = bucket("ticket-attachments");
  add("Bucket ticket-attachments ada dan PRIVAT", Boolean(att) && att.public === false, att ? (att.public ? "PUBLIK" : "privat") : "tidak ada");
  const av = bucket("avatars");
  add("Bucket avatars ada (publik untuk dibaca)", Boolean(av), av ? (av.public ? "publik" : "privat") : "tidak ada");
  const publicOthers = report.buckets.filter((b) => b.public && b.id !== "avatars").map((b) => b.id);
  add("Tidak ada bucket publik selain avatars", publicOthers.length === 0, publicOthers.length ? list(publicOthers) : "-");
  add("Realtime aktif untuk notifications dan ticket_messages", ["notifications", "ticket_messages"].every((t) => report.realtime.includes(t)), `publikasi: ${list(report.realtime)}`);

  const flags = report.devFlags ?? [];
  add("Tidak ada dev flag yang aktif (mis. allow_test_cleanup)", flags.length === 0, flags.length ? `AKTIF: ${list(flags)} (hanya boleh di project DEV)` : "tidak ada");

  const tr = report.testRows;
  const dirty = Object.entries(tr).filter(([, n]) => Number(n) > 0).map(([k, n]) => `${k}=${n}`);
  add("Tidak ada baris uji / demo (akun uji, layanan ZT-, pesanan MK-, dll.)", dirty.length === 0, dirty.length ? dirty.join(", ") : "bersih");
}

const w = Math.max(...rows.map((r) => r.name.length));
for (const r of rows) console.log(`${r.ok ? "LULUS" : "GAGAL"}  ${r.name.padEnd(w)}  ${r.detail}`);
const failed = rows.filter((r) => !r.ok).length;
console.log(`\n${rows.length - failed} lulus, ${failed} gagal.`);
process.exit(failed ? 1 : 0);
