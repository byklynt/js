// Automated mobile audit (Playwright, WebKit + Chromium, DEV only).
//   node scripts/mobile-audit.mjs --base http://localhost:3112 --label before --out <folder> [--matrix quick|standard|full] [--engines chromium,webkit]
//        [--devices iphone-14,android-360] [--pages dashboard,admin/services] [--no-shots]
// Logs in once per engine (a temporary user, a long-named user for the long-text cases, and an admin with 2FA), seeds a little data (orders with long
// links and Rp 25.900.000 charges, a ticket thread, notifications, deposits in every state, a blog post), then visits every page / scenario on every
// device config and runs scripts/lib/mobile-checks.mjs inside the page. Prints a table and writes <out>/<label>.json; screenshots of failing pages go to <out>.
// Everything it creates carries the marker "ma" and is removed at the end by the in-process test cleanup. The server should run with PAYMENKU_API_KEY empty.
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import * as OTPAuth from "otpauth";
import { chromium, webkit } from "playwright";
import QRCode from "qrcode";
import { checkDevOnly, readDevRef } from "./lib/prod-guard.mjs";
import { cleanupTestData } from "./lib/test-cleanup.mjs";
import { auditInPage } from "./lib/mobile-checks.mjs";

const arg = (n, d) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);
const flag = (n) => process.argv.includes(n);
const BASE = arg("--base");
const LABEL = arg("--label", "audit");
const OUT = arg("--out");
if (!BASE || !OUT) {
  console.error("Pemakaian: node scripts/mobile-audit.mjs --base <url> --label <nama> --out <folder> [--matrix quick|standard|full]");
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });
const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const i = line.indexOf("=");
  if (i > 0 && !line.trim().startsWith("#")) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const guard = checkDevOnly(env, readDevRef(env));
if (!guard.ok) {
  console.error(guard.error);
  process.exit(1);
}
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const sb = createClient(url, env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const anonKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// ------------------------------------------------------------------------------------------------------------------------------------
// devices and the matrix
// ------------------------------------------------------------------------------------------------------------------------------------
const UA_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const UA_IPAD = "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const UA_ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
const DEVICES = {
  "iphone-se": { w: 320, h: 568, dpr: 2, ua: UA_IPHONE },
  "iphone-14": { w: 390, h: 844, dpr: 3, ua: UA_IPHONE },
  "iphone-15-pro-max": { w: 430, h: 932, dpr: 3, ua: UA_IPHONE },
  "pixel-7": { w: 412, h: 915, dpr: 2.625, ua: UA_ANDROID },
  "android-360": { w: 360, h: 640, dpr: 3, ua: UA_ANDROID },
  "ipad-mini": { w: 768, h: 1024, dpr: 2, ua: UA_IPAD },
};
function matrix() {
  const mode = arg("--matrix", "standard");
  const engines = arg("--engines", "chromium,webkit").split(",");
  const only = arg("--devices", "")?.split(",").filter(Boolean);
  const cfgs = [];
  const add = (engine, device, theme = "light", orient = "portrait") => cfgs.push({ engine, device, theme, orient });
  for (const engine of engines) {
    if (mode === "full") {
      for (const d of Object.keys(DEVICES)) for (const t of ["light", "dark"]) for (const o of ["portrait", "landscape"]) add(engine, d, t, o);
    } else if (mode === "quick") {
      for (const d of engine === "webkit" ? ["iphone-14"] : ["iphone-se", "iphone-14", "android-360"]) add(engine, d);
    } else if (engine === "chromium") {
      for (const d of ["iphone-se", "android-360", "iphone-14", "pixel-7", "ipad-mini"]) add(engine, d);
      add(engine, "iphone-14", "dark");
      add(engine, "iphone-14", "light", "landscape");
    } else {
      for (const d of ["iphone-se", "iphone-14", "iphone-15-pro-max"]) add(engine, d);
      add(engine, "iphone-14", "dark");
      add(engine, "iphone-14", "light", "landscape");
    }
  }
  return only.length ? cfgs.filter((c) => only.includes(c.device)) : cfgs;
}

// ------------------------------------------------------------------------------------------------------------------------------------
// seed
// ------------------------------------------------------------------------------------------------------------------------------------
const MARKER = arg("--marker", "ma"); // two audits can run side by side with different markers
const run = MARKER + Math.random().toString(36).slice(2, 6);
const password = `Mob-${run}-Pass12`;
const secretState = { secret: "", last: "" };
const totp = () => new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secretState.secret), digits: 6, period: 30 }).generate();
async function freshCode() {
  for (let i = 0; i < 70 && totp() === secretState.last; i++) await new Promise((r) => setTimeout(r, 500));
  secretState.last = totp();
  return secretState.last;
}
const mkUser = async (username) => {
  const { data, error } = await sb.auth.admin.createUser({ email: `${username}@jagoansosmed-test.invalid`, password, email_confirm: true, user_metadata: { username } });
  if (error) throw new Error(error.message);
  return { id: data.user.id, username };
};
const minutes = (n) => new Date(Date.now() + n * 60_000).toISOString();
const LONG_LINK = `https://www.instagram.com/p/${"AbCdEfGhIjKlMnOpQrStUvWxYz0123456789".repeat(4)}/?utm_source=ig_web_copy_link&igsh=${"x".repeat(60)}`;
const seeded = { depositIds: {}, ticketId: "", slug: "" };

async function seed(user, long) {
  const { data: svc } = await sb.from("services").select("id,provider_id,name").eq("active", true).eq("imported", true).order("name", { ascending: false }).limit(1).single();
  await sb.rpc("apply_ledger_entry", { p_user: user.id, p_type: "deposit", p_amount: 25_900_000, p_ref_type: "ma", p_ref_id: `${run}:${user.id}`, p_note: "audit", p_by: "audit" });
  await sb.rpc("apply_ledger_entry", { p_user: long.id, p_type: "deposit", p_amount: 1_234_567, p_ref_type: "ma", p_ref_id: `${run}:${long.id}`, p_note: "audit", p_by: "audit" });
  const statuses = ["menunggu", "berjalan", "selesai", "dibatalkan", "gagal_kirim", "sebagian"];
  for (const [i, status] of statuses.entries()) {
    await sb.from("orders").insert({ user_id: i % 2 ? long.id : user.id, service_id: svc.id, provider_id: svc.provider_id, provider_order_id: `MK-MA${run}${i}`, link: `${LONG_LINK}${i}`, quantity: 1_000_000, charge: 25_900_000, remains: 1_000_000, status, created_at: minutes(-60 * (i + 1)) });
  }
  const qr = await QRCode.toDataURL(`QRIS-${run}`, { margin: 1, width: 480 });
  const base = { user_id: user.id, gateway: "paymenku", is_sandbox: true, created_at: minutes(-1) };
  const dep = {
    "pending-qris": { method: "QRIS", channel_code: "qris", amount: 50_000, pay_amount: 50_550, fee_amount: 550, status: "menunggu", expires_at: minutes(14), payment_info: { qr_url: qr } },
    "pending-va": { method: "BCA Virtual Account", channel_code: "bca_va", amount: 100_000, pay_amount: 100_000, fee_amount: 0, status: "menunggu", expires_at: minutes(1380), payment_info: { bank: "BCA", va_number: "8277012345678901" } },
    "pending-ewallet": { method: "DANA", channel_code: "dana", amount: 75_000, pay_amount: 75_000, fee_amount: 0, status: "menunggu", expires_at: minutes(30), payment_info: { checkout_url: "https://example.invalid/checkout" }, pay_url: "https://example.invalid/pay" },
    paid: { method: "QRIS", channel_code: "qris", amount: 25_900_000, pay_amount: 25_900_550, fee_amount: 550, status: "berhasil", expires_at: minutes(10), paid_at: new Date().toISOString(), payment_info: {} },
    expired: { method: "QRIS", channel_code: "qris", amount: 50_000, pay_amount: 50_550, fee_amount: 550, status: "kedaluwarsa", expires_at: minutes(-5), payment_info: {} },
    failed: { method: "DANA", channel_code: "dana", amount: 75_000, pay_amount: 75_000, fee_amount: 0, status: "gagal", expires_at: minutes(-5), payment_info: {} },
    cancelled: { method: "QRIS", channel_code: "qris", amount: 20_000, pay_amount: 20_550, fee_amount: 550, status: "dibatalkan", expires_at: minutes(5), payment_info: {} },
  };
  let n = 0;
  for (const [name, row] of Object.entries(dep)) {
    const { data, error } = await sb.from("deposits").insert({ ...base, gateway_status: row.status === "berhasil" ? "paid" : "pending", external_id: `zt-${run}-${++n}`, ...row }).select("id").single();
    if (error) throw new Error(`${name}: ${error.message}`);
    seeded.depositIds[name] = data.id;
  }
  const { data: t } = await sb.from("tickets").insert({ user_id: user.id, title: `Pertanyaan tentang pesanan dengan judul yang cukup panjang supaya bisa menguji pemotongan teks ${run}`, category: "pesanan", status: "dibalas" }).select("id").single();
  seeded.ticketId = t.id;
  await sb.from("ticket_messages").insert([
    { ticket_id: t.id, sender: "user", sender_id: user.id, body: `Halo, pesanan saya belum masuk. Link: ${LONG_LINK}` },
    { ticket_id: t.id, sender: "support", body: "Terima kasih, kami cek dulu ya. ".repeat(12) },
    { ticket_id: t.id, sender: "user", sender_id: user.id, body: "Oke, saya tunggu." },
  ]);
  for (const title of ["Deposit Rp 25.900.000 berhasil dan saldo sudah bertambah", "Pesanan #71268 selesai", "Pengumuman layanan: pemeliharaan sistem dijadwalkan malam ini"]) {
    await sb.rpc("internal_notify", { p_user: user.id, p_type: "sistem", p_title: title, p_body: "Isi notifikasi yang cukup panjang untuk menguji pemotongan teks di layar kecil. ".repeat(3), p_href: "/dashboard", p_dedupe: `ma:${run}:${title.slice(0, 12)}` });
  }
  const { data: cat } = await sb.from("blog_categories").insert({ slug: `zt-${run}-kategori`, name: "Panduan" }).select("id").single();
  seeded.slug = `zt-${run}-artikel-uji-tampilan-seluler`;
  await sb.from("blog_posts").insert({
    slug: seeded.slug, title: "Artikel uji tampilan seluler dengan judul yang sengaja dibuat panjang agar bisa dipakai menguji pemotongan teks", excerpt: "Ringkasan artikel uji.",
    content_md: `## Bagian satu\n\n${"Paragraf uji dengan banyak kata untuk melihat pembungkusan teks di layar kecil. ".repeat(8)}\n\nTautan panjang: [${LONG_LINK}](${LONG_LINK})\n\n- satu\n- dua\n- tiga\n\n\`\`\`\n${"kode-yang-sangat-panjang-tanpa-spasi-".repeat(8)}\n\`\`\`\n`,
    status: "terbit", published_at: minutes(-30), category_id: cat.id, author_id: user.id,
  });
}

// ------------------------------------------------------------------------------------------------------------------------------------
// scenarios
// ------------------------------------------------------------------------------------------------------------------------------------
const click = async (page, locator, ms = 400) => {
  const el = locator.first();
  if (!(await el.count())) return false;
  await el.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(ms);
  return true;
};
function scenarios() {
  const S = [];
  const pub = (name, path, act) => S.push({ name, path, role: "public", act });
  const usr = (name, path, act) => S.push({ name, path, role: "user", act });
  const adm = (name, path, act) => S.push({ name, path, role: "admin", act });
  pub("landing", "/");
  pub("landing + menu", "/", (p) => click(p, p.getByRole("button", { name: /menu/i })));
  pub("login", "/login");
  pub("signup", "/signup");
  pub("forgot-password", "/forgot-password");
  pub("services (public)", "/services");
  pub("blog list", "/blog");
  pub("blog article", `/blog/${seeded.slug}`);
  pub("syarat-ketentuan", "/syarat-ketentuan");
  pub("kebijakan-refund", "/kebijakan-refund");
  pub("kebijakan-privasi", "/kebijakan-privasi");
  pub("404", "/halaman-yang-tidak-ada");
  pub("admin login", "/admin/login");
  usr("dashboard (Order Baru)", "/dashboard");
  usr("dashboard + drawer", "/dashboard", (p) => click(p, p.getByRole("button", { name: "Buka menu navigasi" })));
  usr("dashboard + account menu", "/dashboard", (p) => click(p, p.getByRole("button", { name: "Buka menu akun" })));
  usr("dashboard + notifications", "/dashboard", (p) => click(p, p.getByRole("button", { name: /^Notifikasi/ })));
  usr("dashboard tab Cari", "/dashboard", (p) => click(p, p.getByRole("tab", { name: "Cari" })));
  usr("dashboard tab Order Massal", "/dashboard", (p) => click(p, p.getByRole("tab", { name: "Order Massal" })));
  usr("dashboard + category dropdown", "/dashboard", (p) => click(p, p.getByRole("button", { name: /Kategori/ })));
  usr("layanan", "/dashboard/services");
  usr("pesanan (list)", "/dashboard/orders");
  usr("tambah saldo", "/dashboard/add-funds");
  usr("tambah saldo + riwayat", "/dashboard/add-funds", (p) => click(p, p.getByRole("button", { name: "Riwayat pembayaran" })));
  for (const k of ["pending-qris", "pending-va", "pending-ewallet", "paid", "expired", "failed", "cancelled"]) usr(`deposit ${k}`, `/deposit/${seeded.depositIds[k]}`);
  usr("mutasi saldo", "/dashboard/ledger");
  usr("tiket (list)", "/dashboard/tickets");
  usr("tiket (thread)", `/dashboard/tickets/${seeded.ticketId}`);
  usr("pembaruan", "/dashboard/updates");
  usr("refill", "/dashboard/refill");
  usr("refund", "/dashboard/refunds");
  usr("order massal", "/dashboard/mass-order");
  usr("notifikasi", "/dashboard/notifications");
  for (const sub of ["", "/2fa", "/experience", "/invoice", "/notifications", "/timezone-api"]) usr(`pengaturan${sub}`, `/dashboard/settings${sub}`);
  usr("api", "/dashboard/api");
  usr("affiliates", "/dashboard/affiliates");
  usr("child-panel", "/dashboard/child-panel");
  for (const sub of ["", "/stats", "/users", "/orders", "/providers", "/deposits", "/refills", "/refunds", "/ledger", "/tickets", "/announcements", "/blog", "/blog/new", "/logs", "/notifications"]) adm(`admin${sub || " dasbor"}`, `/admin${sub}`);
  adm("admin + drawer", "/admin", (p) => click(p, p.getByRole("button", { name: "Buka menu navigasi" })));
  adm("admin layanan + aksi massal", "/admin/services", (p) => click(p, p.getByRole("button", { name: "Aksi massal", exact: true })));
  adm("admin layanan + sinkronkan", "/admin/services", (p) => click(p, p.getByRole("button", { name: "Sinkronkan dari provider" }), 1200));
  adm("admin layanan + tambah", "/admin/services", (p) => click(p, p.getByRole("button", { name: "Tambah layanan" })));
  adm("admin layanan + pilih baris", "/admin/services", async (p) => {
    const box = p.locator("input[type='checkbox'][aria-label^='Pilih layanan']").first();
    if (await box.count()) await box.check({ force: true }).catch(() => {});
    await p.waitForTimeout(400);
  });
  for (const sub of ["", "/notifications", "/operations", "/order-rules", "/payments", "/ranks", "/security"]) adm(`admin pengaturan${sub}`, `/admin/settings${sub}`);
  return S;
}
const filterPages = arg("--pages", "")?.split(",").filter(Boolean) ?? [];

// ------------------------------------------------------------------------------------------------------------------------------------
// run
// ------------------------------------------------------------------------------------------------------------------------------------
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const results = [];
const shotDirNote = [];

try {
  const user = await mkUser(`zt_mu_${run}`);
  const long = await mkUser(`zt_longname_${run}`.slice(0, 20));
  const adminU = await mkUser(`zt_ad_${run}`);
  await sb.from("profiles").update({ role: "admin" }).eq("id", adminU.id);
  const c = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  await c.auth.signInWithPassword({ email: `${adminU.username}@jagoansosmed-test.invalid`, password });
  const enrol = await c.auth.mfa.enroll({ factorType: "totp", issuer: "JagoanSosmed" });
  secretState.secret = enrol.data.totp.secret;
  await c.auth.mfa.challengeAndVerify({ factorId: enrol.data.id, code: await freshCode() });
  await seed(user, long);
  const all = scenarios().filter((s) => !filterPages.length || filterPages.some((f) => s.path.includes(f) || s.name.includes(f)));
  const cfgs = matrix();
  console.log(`${cfgs.length} konfigurasi x ${all.length} halaman = ${cfgs.length * all.length} pemeriksaan\n`);

  const launchers = { chromium, webkit };
  const states = {};
  for (const engine of [...new Set(cfgs.map((x) => x.engine))]) {
    const browser = await launchers[engine].launch();
    // log in once per engine (desktop-sized context), keep the cookies for every device
    const ctx0 = await browser.newContext({ viewport: { width: 1280, height: 900 }, baseURL: BASE });
    const loginUser = async (name) => {
      const page = await ctx0.newPage();
      await page.goto("/login");
      await page.waitForLoadState("networkidle").catch(() => {});
      // WebKit can fill before React has hydrated (the value is then wiped): retry until the form really holds it
      for (let attempt = 0; attempt < 4; attempt++) {
        await page.waitForTimeout(800);
        await page.getByPlaceholder("nama_pengguna").fill(name);
        await page.getByPlaceholder("Minimal 8 karakter").fill(password);
        await page.waitForTimeout(200);
        await page.getByRole("button", { name: "Masuk", exact: true }).click();
        if (await page.waitForURL("**/dashboard", { timeout: 12_000 }).then(() => true, () => false)) break;
        if (attempt === 3) throw new Error("login gagal setelah 4 percobaan");
        await page.reload();
        await page.waitForLoadState("networkidle").catch(() => {});
      }
      const st = await ctx0.storageState();
      await ctx0.clearCookies();
      await page.close();
      return st;
    };
    const userState = await loginUser(user.username);
    const adminState = await (async () => {
      const page = await ctx0.newPage();
      await page.goto("/admin/login");
      await page.waitForLoadState("networkidle").catch(() => {});
      for (let attempt = 0; attempt < 4; attempt++) {
        await page.waitForTimeout(800);
        await page.getByPlaceholder("nama_admin").fill(adminU.username);
        await page.getByPlaceholder("Password admin").fill(password);
        await page.waitForTimeout(200);
        await page.locator("form button[type=submit]").click();
        if (await page.getByPlaceholder("000000").waitFor({ timeout: 12_000 }).then(() => true, () => false)) break;
        if (attempt === 3) throw new Error("login admin gagal setelah 4 percobaan");
        await page.reload();
        await page.waitForLoadState("networkidle").catch(() => {});
      }
      await page.getByPlaceholder("000000").fill(await freshCode());
      await page.locator("form button[type=submit]").click();
      await page.waitForURL((u) => u.pathname === "/admin", { timeout: 40_000 });
      const st = await ctx0.storageState();
      await ctx0.clearCookies();
      await page.close();
      return st;
    })();
    await ctx0.close();
    states[engine] = { userState, adminState };

    for (const cfg of cfgs.filter((x) => x.engine === engine)) {
      const dev = DEVICES[cfg.device];
      const [w, h] = cfg.orient === "landscape" ? [dev.h, dev.w] : [dev.w, dev.h];
      for (const role of ["public", "user", "admin"]) {
        const ctx = await browser.newContext({
          viewport: { width: w, height: h }, deviceScaleFactor: dev.dpr, isMobile: true, hasTouch: true, userAgent: dev.ua, colorScheme: cfg.theme, baseURL: BASE,
          ...(role === "user" ? { storageState: userState } : role === "admin" ? { storageState: adminState } : {}),
        });
        await ctx.addInitScript((t) => { try { localStorage.setItem("theme", t); } catch { /* ignore */ } }, cfg.theme);
        for (const sc of all.filter((x) => x.role === role)) {
          const page = await ctx.newPage();
          const rec = { engine, device: cfg.device, theme: cfg.theme, orient: cfg.orient, page: sc.name, path: sc.path, status: 0, skipped: "", findings: null };
          try {
            const res = await page.goto(sc.path, { waitUntil: "load", timeout: 40_000 });
            rec.status = res?.status() ?? 0;
            await page.waitForLoadState("networkidle", { timeout: 1500 }).catch(() => {});
            await page.waitForTimeout(300);
            if (sc.act) {
              const did = await sc.act(page);
              if (did === false) rec.skipped = "elemen tidak ditemukan";
            }
            if (!rec.skipped) rec.findings = await page.evaluate(auditInPage, {});
          } catch (e) {
            rec.skipped = `gagal dimuat: ${String(e).slice(0, 80)}`;
          }
          const f = rec.findings;
          const bad = f && (f.doc.overflow || f.inputs.length || f.covered.length || f.dialogs.length || f.fixedOverlap.length || f.clipped.length || f.targets.length > 0);
          if (bad && !flag("--no-shots")) {
            const name = `${LABEL}__${cfg.engine}-${cfg.device}-${cfg.theme}-${cfg.orient}__${slug(sc.name)}.png`;
            await page.screenshot({ path: join(OUT, name), fullPage: false }).catch(() => {});
            rec.shot = name;
          }
          results.push(rec);
          await page.close();
        }
        await ctx.close();
      }
      console.log(`selesai: ${cfg.engine} ${cfg.device} ${cfg.theme} ${cfg.orient}`);
    }
    await browser.close();
  }
} catch (e) {
  console.error(e instanceof Error ? e.stack : String(e));
  process.exitCode = 1;
} finally {
  writeFileSync(join(OUT, `${LABEL}.json`), JSON.stringify(results));
  try {
    console.log(`pembersihan: ${Object.values(await cleanupTestData({ marker: MARKER })).reduce((a, b) => a + b, 0)} baris`);
  } catch (e) {
    console.error(`PEMBERSIHAN GAGAL: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  }
}

// ------------------------------------------------------------------------------------------------------------------------------------
// summary
// ------------------------------------------------------------------------------------------------------------------------------------
const CHECKS = [
  ["doc", "Overflow horizontal (halaman bisa digeser ke samping)", "breaks", (f) => (f.doc.overflow ? 1 : 0)],
  ["inputs", "Input di bawah 16px (iOS zoom saat fokus)", "breaks", (f) => f.inputs.length],
  ["covered", "Kontrol tertutup elemen lain", "breaks", (f) => f.covered.length],
  ["dialogs", "Dialog / drawer bermasalah (keluar layar, tidak bisa di-scroll, scroll halaman tidak terkunci)", "breaks", (f) => f.dialogs.length],
  ["fixedOverlap", "Lapisan fixed / sticky saling menimpa", "wrong", (f) => f.fixedOverlap.length],
  ["clipped", "Teks terpotong tanpa elipsis", "wrong", (f) => f.clipped.length],
  ["targets", "Target sentuh < 40px", "wrong", (f) => f.targets.length],
  ["kbd", "Atribut keyboard (inputmode / autocomplete / type)", "wrong", (f) => f.kbd.length],
  ["images", "Gambar tanpa ruang tercadang (layout shift)", "minor", (f) => f.images.length],
];
const rows = CHECKS.map(([key, label, severity, count]) => {
  const failing = results.filter((r) => r.findings && count(r.findings) > 0);
  const total = failing.reduce((n, r) => n + count(r.findings), 0);
  return { key, label, severity, pages: failing.length, total };
});
const measured = results.filter((r) => r.findings).length;
const skipped = results.filter((r) => r.skipped).length;
console.log(`\n=== RINGKASAN ${LABEL}: ${measured} pemeriksaan, ${skipped} dilewati ===`);
for (const r of rows) console.log(`${String(r.pages).padStart(5)} halaman, ${String(r.total).padStart(6)} temuan  [${r.severity.padEnd(6)}] ${r.label}`);
const noViewport = results.filter((r) => r.findings && !/width=device-width/.test(r.findings.viewport)).length;
console.log(`meta viewport tanpa width=device-width: ${noViewport}`);
console.log(`viewport: ${[...new Set(results.filter((r) => r.findings).map((r) => r.findings.viewport))].join(" | ")}`);
console.log(`theme-color: ${[...new Set(results.filter((r) => r.findings).map((r) => JSON.stringify(r.findings.misc.themeColor)))].join(" | ")}`);
console.log(`halaman status >= 400 (selain 404 yang disengaja): ${results.filter((r) => r.status >= 400 && r.page !== "404").length}`);
writeFileSync(join(OUT, `${LABEL}-summary.json`), JSON.stringify({ rows, measured, skipped }, null, 1));

// the source scan: patterns that cause the classic mobile problems
function walk(dir, acc = []) {
  for (const f of readdirSync(dir)) {
    if (["node_modules", ".next", ".git", "__tests__"].includes(f)) continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(tsx|ts|css)$/.test(f) && !/\.test\./.test(f)) acc.push(p);
  }
  return acc;
}
const files = ["app", "components", "lib"].flatMap((d) => walk(d));
const grep = (re) => files.flatMap((f) => readFileSync(f, "utf8").split("\n").map((l, i) => ({ f, i: i + 1, l })).filter((x) => re.test(x.l)));
const scan = {
  hScreen: grep(/\b(min-h-screen|h-screen|100vh)\b/).map((x) => `${x.f}:${x.i}`),
  dvh: grep(/\b(dvh|svh)\b/).length,
  safeArea: grep(/safe-area-inset/).length,
  maxScale: grep(/maximum-scale|user-scalable/).map((x) => `${x.f}:${x.i}`),
  backdropBlur: grep(/backdrop-blur/).map((x) => `${x.f}:${x.i}`),
  overscroll: grep(/overscroll/).length,
  textSizeAdjust: grep(/text-size-adjust/).length,
  tapHighlight: grep(/tap-highlight/).length,
};
console.log(`\nPemindaian kode: min-h-screen/h-screen/100vh = ${scan.hScreen.length}; dvh/svh = ${scan.dvh}; safe-area = ${scan.safeArea}; maximum-scale = ${scan.maxScale.length}; backdrop-blur = ${scan.backdropBlur.length}; overscroll = ${scan.overscroll}; text-size-adjust = ${scan.textSizeAdjust}; tap-highlight = ${scan.tapHighlight}`);
writeFileSync(join(OUT, `${LABEL}-scan.json`), JSON.stringify(scan, null, 1));
