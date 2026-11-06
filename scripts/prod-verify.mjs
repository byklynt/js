// Read-only verification of a Supabase project after a deploy.
//   npm run prod:verify -- PROJECT_REF
//
// Reads NOTHING from files. Everything comes from the terminal session environment:
//   NEXT_PUBLIC_SUPABASE_URL          must be exactly https://PROJECT_REF.supabase.co
//   SUPABASE_SECRET_KEY               (or SUPABASE_SERVICE_ROLE_KEY) the service role / secret key of THAT project
//   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or ..._ANON_KEY)   optional: enables the live "anon cannot read" probe
// It calls public.prod_verify() (migration 28), public.prod_verify_blog() (34) and public.prod_verify_payments() (37), service role only, and, with the anon key, probes every table
// over REST. The ONLY public data are the published blog posts (and the categories / tags / links of those posts): everything else must stay closed.
// It writes nothing.
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

/** The one thing anon may read: blog data of PUBLISHED posts (RLS decides). Nothing else, and never a write. */
const BLOG_TABLES = ["blog_categories", "blog_post_tags", "blog_posts", "blog_tags"];
const BLOG_ANON_POLICIES = ["blog_categories.blog_categories_public", "blog_post_tags.blog_post_tags_public", "blog_posts.blog_posts_public", "blog_tags.blog_tags_public"];

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
  const anonExtra = report.anonAccess.filter((t) => !BLOG_TABLES.includes(t));
  add("Role anon tidak punya akses ke tabel/view mana pun (selain 4 tabel blog, hanya baca)", anonExtra.length === 0, anonExtra.length ? `anon bisa akses: ${list(anonExtra)}` : "hanya tabel blog");
  const policyExtra = report.anonPolicies.filter((p) => !BLOG_ANON_POLICIES.includes(p));
  add("Tidak ada policy untuk anon / public (selain baca artikel blog yang terbit)", policyExtra.length === 0, policyExtra.length ? list(policyExtra) : "hanya policy baca blog");

  if (anonKey) {
    const readable = [];
    for (const t of report.tables.filter((x) => !BLOG_TABLES.includes(x))) {
      const r = await rest(`/rest/v1/${encodeURIComponent(t)}?select=*&limit=1`, anonKey);
      if (r.ok) {
        const body = await r.json().catch(() => []);
        if (Array.isArray(body) && body.length > 0) readable.push(t);
      }
    }
    add("Probe REST dengan kunci anon: tidak ada baris yang terbaca", readable.length === 0, readable.length ? `terbaca: ${list(readable)}` : `${report.tables.length - BLOG_TABLES.length} tabel diperiksa (tabel blog diperiksa terpisah)`);
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
  const publicOthers = report.buckets.filter((b) => b.public && b.id !== "avatars" && b.id !== "blog-images").map((b) => b.id);
  add("Tidak ada bucket publik selain avatars dan blog-images", publicOthers.length === 0, publicOthers.length ? list(publicOthers) : "-");
  add("Realtime aktif untuk notifications dan ticket_messages", ["notifications", "ticket_messages"].every((t) => report.realtime.includes(t)), `publikasi: ${list(report.realtime)}`);

  const flags = report.devFlags ?? [];
  add("Tidak ada dev flag yang aktif (mis. allow_test_cleanup)", flags.length === 0, flags.length ? `AKTIF: ${list(flags)} (hanya boleh di project DEV)` : "tidak ada");

  const tr = report.testRows;
  const dirty = Object.entries(tr).filter(([, n]) => Number(n) > 0).map(([k, n]) => `${k}=${n}`);
  add("Tidak ada baris uji / demo (akun uji, layanan ZT-, pesanan MK-, dll.)", dirty.length === 0, dirty.length ? dirty.join(", ") : "bersih");
}

// --- blog: RLS on the tables, anon sees no draft, "blog-images" is public-read / admin-write only ---
let blog = null;
if (report) {
  try {
    const res = await rest("/rest/v1/rpc/prod_verify_blog", serviceKey, { method: "POST", body: "{}" });
    if (res.ok) blog = await res.json();
    else add("Fungsi prod_verify_blog() bisa dipanggil", false, `HTTP ${res.status}: migrasi 34 (blog) belum diterapkan`);
  } catch (e) {
    add("Fungsi prod_verify_blog() bisa dipanggil", false, e instanceof Error ? e.message : String(e));
  }
}
if (blog) {
  const missing = BLOG_TABLES.filter((t) => !(t in blog.tables));
  const noRls = BLOG_TABLES.filter((t) => blog.tables[t] === false);
  add("Tabel blog ada dan memakai RLS", missing.length === 0 && noRls.length === 0, missing.length ? `tidak ada: ${missing.join(", ")}` : noRls.length ? `RLS mati: ${noRls.join(", ")}` : `${BLOG_TABLES.length} tabel`);
  add("Role anon tidak punya hak tulis di tabel blog", blog.anonWriteGrants.length === 0, blog.anonWriteGrants.length ? blog.anonWriteGrants.join(", ") : "tidak ada");
  if (anonKey) {
    // a post that is not public (draft, or a date in the future) must be invisible to anon: ask for everything that is NOT published
    const r = await rest("/rest/v1/blog_posts?select=id,slug,status,published_at&status=eq.draf&limit=5", anonKey);
    const drafts = r.ok ? await r.json().catch(() => []) : [];
    const future = await rest(`/rest/v1/blog_posts?select=id&published_at=gt.${encodeURIComponent(new Date().toISOString())}&limit=5`, anonKey);
    const scheduled = future.ok ? await future.json().catch(() => []) : [];
    add("Anon tidak bisa membaca draf maupun artikel terjadwal", r.ok && drafts.length === 0 && scheduled.length === 0,
      drafts.length || scheduled.length ? `TERBACA: ${drafts.length} draf, ${scheduled.length} terjadwal` : `${blog.draftPosts} artikel non-publik di database, tidak ada yang terbaca anon`);
  } else add("Anon tidak bisa membaca draf maupun artikel terjadwal", false, "kunci anon tidak ada di session: pemeriksaan dilewati (dianggap gagal)");
  const b = blog.bucket;
  add("Bucket blog-images ada dan publik untuk dibaca", Boolean(b) && b.public === true, b ? (b.public ? "publik" : "PRIVAT") : "tidak ada");
  add("Bucket blog-images: maks 2 MB, hanya png / jpeg / webp", Boolean(b) && b.sizeLimit === 2097152 && JSON.stringify([...(b.mimeTypes ?? [])].sort()) === JSON.stringify(["image/jpeg", "image/png", "image/webp"]),
    b ? `batas ${b.sizeLimit} byte; tipe: ${(b.mimeTypes ?? []).join(", ") || "semua"}` : "tidak ada");
  const sp = blog.storagePolicies ?? [];
  const writes = sp.filter((p) => ["INSERT", "UPDATE", "DELETE", "ALL"].includes(p.cmd));
  const badWrites = writes.filter((p) => !(p.roles.length === 1 && p.roles[0] === "authenticated" && p.admin));
  add("Tulis ke blog-images hanya untuk admin (insert / update / delete)", ["INSERT", "UPDATE", "DELETE"].every((c) => writes.some((p) => p.cmd === c)) && badWrites.length === 0,
    badWrites.length ? `policy tulis yang tidak dibatasi admin: ${badWrites.map((p) => p.name).join(", ")}` : `${writes.length} policy tulis, semuanya admin`);
}

// --- payments (Paymenku): columns, the credit functions (server only), no credited SANDBOX deposit, and the key / secret mode of THIS session ---
let pay = null;
if (report) {
  try {
    const res = await rest("/rest/v1/rpc/prod_verify_payments", serviceKey, { method: "POST", body: "{}" });
    if (res.ok) pay = await res.json();
    else add("Fungsi prod_verify_payments() bisa dipanggil", false, `HTTP ${res.status}: migrasi 36 / 37 (Paymenku) belum diterapkan`);
  } catch (e) {
    add("Fungsi prod_verify_payments() bisa dipanggil", false, e instanceof Error ? e.message : String(e));
  }
}
if (pay) {
  const need = ["gateway", "channel_code", "pay_amount", "fee_amount", "fee_passthrough", "pay_url", "payment_info", "gateway_status", "expires_at", "paid_at", "is_sandbox", "needs_review", "review_reason"];
  const missing = need.filter((c) => !pay.columns.includes(c));
  add("Kolom Paymenku ada di tabel deposits", missing.length === 0, missing.length ? `tidak ada: ${missing.join(", ")}` : `${need.length} kolom`);
  add("deposits.status mengizinkan 'dibatalkan' dan external_id (trx_id) UNIK", pay.statusAllowsCancelled && pay.externalIdUnique, `status: ${pay.statusAllowsCancelled ? "ok" : "BELUM"}; trx_id unik: ${pay.externalIdUnique ? "ok" : "BELUM"}`);
  const fns = ["paymenku_settle_deposit", "paymenku_mark_deposit", "paymenku_flag_deposit", "credit_deposit"];
  const bad = fns.filter((n) => !pay.functions[n] || pay.functions[n].anon || pay.functions[n].authenticated || !pay.functions[n].service);
  add("Fungsi kredit deposit hanya bisa dijalankan service role (bukan anon / pengguna)", bad.length === 0, bad.length ? `bermasalah: ${bad.join(", ")}` : fns.join(", "));
  if (!isDev) add("Tidak ada deposit SANDBOX yang sudah dikreditkan", pay.sandboxCredited === 0, pay.sandboxCredited ? `${pay.sandboxCredited} deposit sandbox berstatus berhasil: periksa ledger!` : "tidak ada");
  add("Deposit yang perlu dicek admin", pay.needsReview === 0, pay.needsReview ? `${pay.needsReview} deposit bertanda Perlu dicek (admin > Deposit > Perlu dicek)` : "tidak ada");
  // the API key and the webhook secret of THIS session (never printed): a live key only with the matching approval, never a sandbox key on production
  const key = process.env.PAYMENKU_API_KEY ?? "";
  if (key) {
    const live = key.startsWith("sk_live_");
    const approved = (process.env.PAYMENT_LIVE_APPROVED_REF ?? "") === ref;
    add("Kunci Paymenku di session sesuai project", isDev ? key.startsWith("sk_test_") : live && approved, isDev ? (key.startsWith("sk_test_") ? "sandbox di DEV" : "DEV hanya boleh kunci sandbox") : live ? (approved ? "live, PAYMENT_LIVE_APPROVED_REF cocok" : "live tetapi PAYMENT_LIVE_APPROVED_REF tidak sama dengan ref project") : "kunci sandbox di production: gateway akan mati");
    add("PAYMENKU_WEBHOOK_SECRET terisi di session", Boolean(process.env.PAYMENKU_WEBHOOK_SECRET), process.env.PAYMENKU_WEBHOOK_SECRET ? "terisi (isinya tidak ditampilkan)" : "kosong: webhook akan ditolak");
  }
}

const w = Math.max(...rows.map((r) => r.name.length));
for (const r of rows) console.log(`${r.ok ? "LULUS" : "GAGAL"}  ${r.name.padEnd(w)}  ${r.detail}`);
const failed = rows.filter((r) => !r.ok).length;
console.log(`\n${rows.length - failed} lulus, ${failed} gagal.`);
process.exit(failed ? 1 : 0);
