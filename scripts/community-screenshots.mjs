// Dev tool: screenshot diff for the community links (sidebar group, landing footer, admin settings).
//   node scripts/community-screenshots.mjs --before http://localhost:3121 --after http://localhost:3112
// "before" = a server built from the commit BEFORE the feature, "after" = the current build; same DEV Supabase project.
// Matrix: light / dark x desktop (1280x900) / mobile (390x844). For each page it compares
//   before vs after WITH NO links set  -> must be identical (admin settings: only the new section below the old form), and
//   before vs after WITH links set     -> only the new elements (and whatever they push down) may differ.
// Creates a temporary user + admin (removed afterwards) and restores the site settings. Images: .shots/community/ (git-ignored).
// pngjs is the PNG decoder that comes with `qrcode` (no new dependency).
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import * as OTPAuth from "otpauth";
import { chromium } from "playwright";
import { PNG } from "pngjs";

const arg = (name) => process.argv[process.argv.indexOf(name) + 1];
const BEFORE = arg("--before");
const AFTER = arg("--after");
if (!BEFORE || !AFTER) {
  console.error("Pemakaian: node scripts/community-screenshots.mjs --before <url> --after <url>");
  process.exit(1);
}
const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const ref = env.SUPABASE_DEV_PROJECT_REF;
if (!ref || !url.includes(ref)) {
  console.error("Ditolak: NEXT_PUBLIC_SUPABASE_URL tidak cocok dengan SUPABASE_DEV_PROJECT_REF.");
  process.exit(1);
}
const serviceKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const sb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const run = Math.random().toString(36).slice(2, 7);
const password = `Shot-${run}-Pass12`;
const uName = `zt_cshu_${run}`;
const aName = `zt_csha_${run}`;
const email = (n) => `${n}@jagoansosmed-test.invalid`;
const OUT = ".shots/community";
mkdirSync(OUT, { recursive: true });

const LINKS = { whatsappChannel: "https://whatsapp.com/channel/jagoansosmed", telegramChannel: "https://t.me/jagoansosmed", telegramBot: "https://t.me/jagoansosmed_bot" };
const VIEWPORTS = { desktop: { width: 1280, height: 900 }, mobile: { width: 390, height: 844 } };
const STILL = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}";

let secret = "";
let lastUsed = "";
const totp = () => new OTPAuth.TOTP({ secret, digits: 6, period: 30 }).generate();
async function freshCode() {
  for (let i = 0; i < 70 && totp() === lastUsed; i++) await new Promise((r) => setTimeout(r, 500));
  lastUsed = totp();
  return lastUsed;
}

async function createAccounts() {
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

/** Sign in once per account (on the "after" server); the cookies work on both servers (same host, same project, same secrets). */
async function loginStates(browser) {
  const ctx1 = await browser.newContext({ viewport: VIEWPORTS.desktop });
  const u = await ctx1.newPage();
  await u.goto(`${AFTER}/login`);
  await u.getByPlaceholder("nama_pengguna").fill(uName);
  await u.getByPlaceholder("Minimal 8 karakter").fill(password);
  await u.getByRole("button", { name: "Masuk", exact: true }).click();
  await u.waitForURL("**/dashboard", { timeout: 40_000 });
  const userState = await ctx1.storageState();
  await ctx1.close();
  const ctx2 = await browser.newContext({ viewport: VIEWPORTS.desktop });
  const a = await ctx2.newPage();
  await a.goto(`${AFTER}/admin/login`);
  await a.getByPlaceholder("nama_admin").fill(aName);
  await a.getByPlaceholder("Password admin").fill(password);
  await a.locator("form button[type=submit]").click();
  await a.getByPlaceholder("000000").waitFor({ timeout: 40_000 });
  await a.getByPlaceholder("000000").fill(await freshCode());
  await a.locator("form button[type=submit]").click();
  await a.waitForURL((x) => x.pathname === "/admin", { timeout: 40_000 });
  const adminState = await ctx2.storageState();
  await ctx2.close();
  return { userState, adminState };
}

const SPECS = [
  {
    name: "sidebar", role: "user", path: "/dashboard",
    newSelector: 'nav[aria-label="Tautan lainnya"]',
    async capture(page, vp) {
      if (vp === "mobile") {
        await page.getByRole("button", { name: "Buka menu navigasi" }).click();
        await page.getByText("Order Baru").last().waitFor({ timeout: 40_000 });
        await page.waitForTimeout(900);
      } else {
        await page.getByText("Order Baru").first().waitFor({ timeout: 40_000 });
      }
      return page.locator("aside:visible").last();
    },
  },
  {
    name: "landing-footer", role: "anon", path: "/",
    newSelector: '[data-testid="footer-community"]',
    async capture(page) {
      const f = page.locator("footer").last();
      await f.waitFor({ timeout: 40_000 });
      await f.scrollIntoViewIfNeeded();
      return f;
    },
  },
  {
    name: "admin-settings", role: "admin", path: "/admin/settings", fullPage: true,
    newSelector: '[data-testid="community-links-form"]',
    async capture(page) {
      await page.getByText("Pengaturan Umum").first().waitFor({ timeout: 40_000 });
      return null;
    },
  },
];

async function shoot(browser, states, base, label, theme, vpName, spec) {
  const state = spec.role === "user" ? states.userState : spec.role === "admin" ? states.adminState : undefined;
  const ctx = await browser.newContext({ viewport: VIEWPORTS[vpName], deviceScaleFactor: 1, ...(state ? { storageState: state } : {}), colorScheme: theme });
  await ctx.addInitScript((t) => { try { localStorage.setItem("theme", t); } catch { /* ignore */ } }, theme);
  const page = await ctx.newPage();
  await page.goto(`${base}${spec.path}`);
  await page.addStyleTag({ content: STILL });
  const el = await spec.capture(page, vpName);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1200);
  const file = `${OUT}/${spec.name}.${theme}.${vpName}.${label}.png`;
  // Page coordinates of the new elements (relative to the captured element when there is one).
  const info = await page.evaluate(({ sel, withEl }) => {
    const root = withEl ? document.querySelector("aside:last-of-type") : null;
    void root;
    return [...document.querySelectorAll(sel)].map((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
    });
  }, { sel: spec.newSelector, withEl: Boolean(el) });
  let origin = { x: 0, y: 0 };
  if (el) {
    await el.screenshot({ path: file, animations: "disabled", caret: "hide" });
    const b = await el.boundingBox();
    origin = { x: (b?.x ?? 0) + (await page.evaluate(() => scrollX)), y: (b?.y ?? 0) + (await page.evaluate(() => scrollY)) };
  } else {
    // viewport only: a taller page makes Playwright resize the window for a full-page shot, which re-rasterizes the fixed top bar (not a real change)
    await page.screenshot({ path: file, fullPage: false, animations: "disabled", caret: "hide" });
  }
  await ctx.close();
  return { file, rects: info.map((r) => ({ x: r.x - origin.x, y: r.y - origin.y, w: r.w, h: r.h })) };
}

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

/** Explained: touches a new element, or sits at/below the first new element (new rows push what follows down). */
function unexplained(boxes, rects) {
  if (!rects.length) return boxes;
  const top = Math.min(...rects.map((r) => r.y)) - 40; // the new column title sits just above its links
  return boxes.filter((b) => !(b.y + b.h >= top));
}

let original = null;
let exitCode = 0;
try {
  original = (await sb.from("site_settings").select("data").maybeSingle()).data?.data ?? {};
  await createAccounts();
  const browser = await chromium.launch();
  const states = await loginStates(browser);
  const results = [];
  const phases = [["empty", {}], ["links", LINKS]];
  const shots = {};
  for (const [phase, community] of phases) {
    await sb.from("site_settings").upsert({ id: true, data: { ...original, community } });
    if (phase === "links") {
      // The read is cached for up to a minute: wait until the "after" server really shows the links (sidebar group + landing footer).
      const ctx = await browser.newContext({ storageState: states.userState, viewport: VIEWPORTS.desktop });
      const p = await ctx.newPage();
      for (let i = 0; i < 40; i++) {
        await p.goto(`${AFTER}/dashboard`);
        await p.getByText("Order Baru").first().waitFor({ timeout: 40_000 });
        if ((await p.locator('nav[aria-label="Tautan lainnya"] a').count()) === 3) break;
        await new Promise((r) => setTimeout(r, 4000));
      }
      await ctx.close();
      const ctx2 = await browser.newContext({ viewport: VIEWPORTS.desktop });
      const q = await ctx2.newPage();
      for (let i = 0; i < 40; i++) {
        await q.goto(`${AFTER}/`);
        if ((await q.locator('[data-testid="footer-community"]').count()) === 3) break;
        await new Promise((r) => setTimeout(r, 4000));
      }
      await ctx2.close();
    } else {
      // the "empty" phase is only meaningful once the caches of the "after" server show no links
      const ctx = await browser.newContext({ storageState: states.userState, viewport: VIEWPORTS.desktop });
      const p = await ctx.newPage();
      for (let i = 0; i < 40; i++) {
        await p.goto(`${AFTER}/dashboard`);
        await p.getByText("Order Baru").first().waitFor({ timeout: 40_000 });
        const side = await p.locator('nav[aria-label="Tautan lainnya"] a').count();
        await p.goto(`${AFTER}/`);
        const foot = await p.locator('[data-testid="footer-community"]').count();
        if (side === 0 && foot === 0) break;
        await new Promise((r) => setTimeout(r, 4000));
      }
      await ctx.close();
    }
    for (const spec of SPECS) for (const theme of ["light", "dark"]) for (const vp of Object.keys(VIEWPORTS)) {
      const key = `${spec.name}.${theme}.${vp}`;
      shots[key] ??= {};
      if (phase === "empty") {
        shots[key].before = await shoot(browser, states, BEFORE, "before", theme, vp, spec);
        shots[key].noise = await shoot(browser, states, BEFORE, "before2", theme, vp, spec);
      }
      shots[key][phase] = await shoot(browser, states, AFTER, `after-${phase}`, theme, vp, spec);
    }
  }
  await browser.close();
  for (const [key, s] of Object.entries(shots)) {
    const dEmpty = diff(s.before.file, s.empty.file);
    const dLinks = diff(s.before.file, s.links.file);
    const out = unexplained(dLinks.boxes, s.links.rects);
    const noise = diff(s.before.file, s.noise.file);
    results.push({ noisePixels: noise.pixels, key, sizeBefore: dEmpty.sizeBefore, sizeEmpty: dEmpty.sizeAfter, sizeLinks: dLinks.sizeAfter, pixelsEmpty: dEmpty.pixels, pixelsLinks: dLinks.pixels, newElements: s.links.rects.length, unexplainedLinks: out.length, unexplainedBoxes: out.slice(0, 4) });
  }
  writeFileSync(`${OUT}/report.json`, JSON.stringify(results, null, 2));
  console.log("\npage.tema.viewport | ukuran sebelum -> sesudah(kosong) -> sesudah(ada tautan) | piksel beda (kosong) | piksel beda (tautan) | elemen baru | di luar elemen baru | derau (sebelum vs sebelum)");
  for (const r of results) {
    console.log(`${r.key} | ${r.sizeBefore.join("x")} -> ${r.sizeEmpty.join("x")} -> ${r.sizeLinks.join("x")} | ${r.pixelsEmpty} | ${r.pixelsLinks} | ${r.newElements} | ${r.unexplainedLinks} | ${r.noisePixels}`);
    for (const b of r.unexplainedBoxes) console.log(`   di luar: x=${b.x} y=${b.y} ${b.w}x${b.h}`);
  }
} catch (e) {
  console.error(e instanceof Error ? e.stack : e);
  exitCode = 1;
} finally {
  if (original) await sb.from("site_settings").upsert({ id: true, data: original });
  spawnSync("npx", ["supabase", "db", "query", "--remote", "--file", "scripts/db-cleanup-test-data.sql", "--yes"], { encoding: "utf8", shell: process.platform === "win32" });
}
process.exit(exitCode);
