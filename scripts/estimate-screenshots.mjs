// Dev tool: screenshot diff of the pages that got the delivery-time estimate.
//   node scripts/estimate-screenshots.mjs --before http://localhost:3111 --after http://localhost:3112
// "before" is a server built from the commit BEFORE the feature, "after" the current build; both talk to the same DEV Supabase project.
// It creates a temporary user and admin (removed afterwards), takes full-page screenshots of /dashboard/services (collapsed and with the
// first group expanded), the order form and /admin/services on both servers, and prints which regions differ. A region is "explained"
// when it touches an element marked data-estimate (the new estimate elements) or, on the admin table, the new "Estimasi" column.
// Images go to .shots/ (git-ignored). pngjs is the PNG decoder that comes with `qrcode` (no new dependency).
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import * as OTPAuth from "otpauth";
import { chromium } from "playwright";
import { PNG } from "pngjs";
import { checkDevOnly, readDevRef } from "./lib/prod-guard.mjs";

const arg = (name) => process.argv[process.argv.indexOf(name) + 1];
const BEFORE = arg("--before");
const AFTER = arg("--after");
if (!BEFORE || !AFTER) {
  console.error("Pemakaian: node scripts/estimate-screenshots.mjs --before <url> --after <url>");
  process.exit(1);
}
const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const devCheck = checkDevOnly(env, readDevRef(env));
if (!devCheck.ok) {
  console.error(devCheck.error);
  process.exit(1);
}
const serviceKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const sb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const run = Math.random().toString(36).slice(2, 7);
const password = `Shot-${run}-Pass12`;
const uName = `zt_shu_${run}`;
const aName = `zt_sha_${run}`;
const email = (n) => `${n}@jagoansosmed-test.invalid`;
mkdirSync(".shots", { recursive: true });

let secret = "";
let lastUsed = "";
const totp = () => new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30 }).generate();
async function freshCode() {
  for (let i = 0; i < 70 && totp() === lastUsed; i++) await new Promise((r) => setTimeout(r, 500));
  lastUsed = totp();
  return lastUsed;
}

async function setup() {
  const mk = async (n) => (await sb.auth.admin.createUser({ email: email(n), password, email_confirm: true, user_metadata: { username: n } })).data.user.id;
  await mk(uName);
  const aid = await mk(aName);
  await sb.from("profiles").update({ role: "admin" }).eq("id", aid);
  const c = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  await c.auth.signInWithPassword({ email: email(aName), password });
  const enrol = await c.auth.mfa.enroll({ factorType: "totp", issuer: "JagoanSosmed" });
  secret = enrol.data.totp.secret;
  await c.auth.mfa.challengeAndVerify({ factorId: enrol.data.id, code: await freshCode() });
}

async function loginUser(ctx, base) {
  const page = await ctx.newPage();
  await page.goto(`${base}/login`);
  await page.getByPlaceholder("nama_pengguna").fill(uName);
  await page.getByPlaceholder("Minimal 8 karakter").fill(password);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await page.waitForURL("**/dashboard", { timeout: 40_000 });
  return page;
}
async function loginAdmin(ctx, base) {
  const page = await ctx.newPage();
  await page.goto(`${base}/admin/login`);
  await page.getByPlaceholder("nama_admin").fill(aName);
  await page.getByPlaceholder("Password admin").fill(password);
  await page.locator("form button[type=submit]").click();
  await page.getByPlaceholder("000000").waitFor({ timeout: 40_000 });
  await page.getByPlaceholder("000000").fill(await freshCode());
  await page.locator("form button[type=submit]").click();
  await page.waitForURL((u) => u.pathname === "/admin", { timeout: 40_000 });
  return page;
}

const STILL = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}";

async function shoot(page, base, spec, serviceId, label) {
  await page.goto(`${base}${spec.path.replace("{SERVICE}", serviceId)}`);
  await page.addStyleTag({ content: STILL });
  await spec.ready(page);
  if (spec.action) await spec.action(page);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1500);
  const file = `.shots/${spec.name}.${label}.png`;
  await page.screenshot({ path: file, fullPage: true, animations: "disabled", caret: "hide" });
  // rects of the new estimate elements (page coordinates)
  const rects = await page.evaluate((admin) => {
    const out = [];
    const add = (el) => {
      const r = el.getBoundingClientRect();
      out.push({ x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height });
    };
    document.querySelectorAll("[data-estimate]").forEach(add);
    if (admin) {
      const th = [...document.querySelectorAll("table th")].find((e) => e.textContent?.trim() === "Estimasi");
      if (th) {
        const idx = [...th.parentElement.children].indexOf(th);
        document.querySelectorAll("table").forEach((t) => t.querySelectorAll("tr").forEach((tr) => tr.children[idx] && add(tr.children[idx])));
      }
    }
    return out;
  }, spec.admin ?? false);
  // The new admin column makes the table reflow: also shoot the "after" page with that column hidden, which must equal "before".
  let hiddenFile = null;
  if (spec.admin) {
    await page.evaluate(() => {
      const th = [...document.querySelectorAll("table th")].find((e) => e.textContent?.trim() === "Estimasi");
      if (!th) return;
      const idx = [...th.parentElement.children].indexOf(th) + 1;
      const st = document.createElement("style");
      st.textContent = `table th:nth-child(${idx}), table td:nth-child(${idx}) { display: none !important; }`;
      document.head.appendChild(st);
    });
    await page.waitForTimeout(500);
    hiddenFile = `.shots/${spec.name}.${label}-hidden.png`;
    await page.screenshot({ path: hiddenFile, fullPage: true, animations: "disabled", caret: "hide" });
  }
  return { file, rects, hiddenFile };
}

/** Diff two PNGs: clusters of differing pixels as bounding boxes. */
function diff(fileA, fileB) {
  const a = PNG.sync.read(readFileSync(fileA));
  const b = PNG.sync.read(readFileSync(fileB));
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  const CELL = 8;
  const cols = Math.ceil(w / CELL);
  const rows = Math.ceil(h / CELL);
  const dirty = new Uint8Array(cols * rows);
  let pixels = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ia = (y * a.width + x) * 4;
      const ib = (y * b.width + x) * 4;
      if (a.data[ia] !== b.data[ib] || a.data[ia + 1] !== b.data[ib + 1] || a.data[ia + 2] !== b.data[ib + 2] || a.data[ia + 3] !== b.data[ib + 3]) {
        pixels++;
        dirty[Math.floor(y / CELL) * cols + Math.floor(x / CELL)] = 1;
      }
    }
  }
  const seen = new Uint8Array(cols * rows);
  const boxes = [];
  for (let i = 0; i < dirty.length; i++) {
    if (!dirty[i] || seen[i]) continue;
    const stack = [i];
    seen[i] = 1;
    let x0 = cols, y0 = rows, x1 = 0, y1 = 0;
    while (stack.length) {
      const c = stack.pop();
      const cx = c % cols;
      const cy = Math.floor(c / cols);
      x0 = Math.min(x0, cx); x1 = Math.max(x1, cx); y0 = Math.min(y0, cy); y1 = Math.max(y1, cy);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const n = ny * cols + nx;
        if (dirty[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
      }
    }
    boxes.push({ x: x0 * CELL, y: y0 * CELL, w: (x1 - x0 + 1) * CELL, h: (y1 - y0 + 1) * CELL });
  }
  return { sizeBefore: [a.width, a.height], sizeAfter: [b.width, b.height], pixels, boxes };
}
const touches = (box, rects) => rects.some((r) => box.x < r.x + r.w + 12 && box.x + box.w > r.x - 12 && box.y < r.y + r.h + 12 && box.y + box.h > r.y - 12);

const SPECS = [
  {
    name: "services-collapsed", path: "/dashboard/services",
    ready: async (p) => { await p.locator('button[aria-controls^="group-panel-"]').first().waitFor({ timeout: 40_000 }); },
  },
  {
    name: "services-expanded", path: "/dashboard/services",
    ready: async (p) => { await p.locator('button[aria-controls^="group-panel-"]').first().waitFor({ timeout: 40_000 }); },
    action: async (p) => { await p.locator('button[aria-controls^="group-panel-"]').first().click(); await p.locator("li.service-card").first().waitFor({ timeout: 40_000 }); },
  },
  {
    name: "order-form", path: "/dashboard?service={SERVICE}",
    ready: async (p) => { await p.getByPlaceholder("Masukkan jumlah").waitFor({ timeout: 40_000 }); await p.getByText(/Min: /).first().waitFor({ timeout: 40_000 }); },
  },
  {
    name: "admin-services", path: "/admin/services", admin: true,
    ready: async (p) => { await p.locator("table").first().waitFor({ timeout: 40_000 }); },
  },
];

let exitCode = 0;
try {
  await setup();
  const { data: first } = await sb.rpc("catalogue_page", { p_limit: 1, p_offset: 0 });
  const serviceId = first?.[0]?.id;
  if (!serviceId) throw new Error("Tidak ada layanan di katalog untuk dipakai.");
  const browser = await chromium.launch();
  const results = [];
  for (const spec of SPECS) {
    const shots = {};
    for (const [label, base] of [["before", BEFORE], ["after", AFTER]]) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "light", deviceScaleFactor: 1 });
      const page = spec.admin ? await loginAdmin(ctx, base) : await loginUser(ctx, base);
      shots[label] = await shoot(page, base, spec, serviceId, label);
      await ctx.close();
    }
    const d = diff(shots.before.file, shots.after.file);
    const unexplained = d.boxes.filter((b) => !touches(b, shots.after.rects));
    const hidden = shots.after.hiddenFile ? diff(shots.before.file, shots.after.hiddenFile) : null;
    results.push({ page: spec.name, ...d, estimateRects: shots.after.rects.length, regions: d.boxes.length, unexplained, hiddenColumnPixels: hidden ? hidden.pixels : null });
  }
  await browser.close();
  writeFileSync(".shots/report.json", JSON.stringify(results, null, 2));
  for (const r of results) {
    console.log(`\n${r.page}: ukuran ${r.sizeBefore.join("x")} -> ${r.sizeAfter.join("x")}, piksel beda ${r.pixels}, wilayah beda ${r.regions}, elemen estimasi ${r.estimateRects}, wilayah di luar elemen estimasi ${r.unexplained.length}`);
    if (r.hiddenColumnPixels !== null) console.log(`   dengan kolom Estimasi disembunyikan: piksel beda ${r.hiddenColumnPixels}`);
    for (const b of r.unexplained.slice(0, 6)) console.log(`   di luar estimasi: x=${b.x} y=${b.y} ${b.w}x${b.h}`);
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  exitCode = 1;
} finally {
  spawnSync("node", ["scripts/db-cleanup.mjs"], { encoding: "utf8", shell: process.platform === "win32" });
}
process.exit(exitCode);
