// Dev tool: screenshots of the admin list pages (desktop and mobile, light and dark) plus an overlap check of the page heading.
//   node scripts/admin-layout-shots.mjs --base http://localhost:3112 --label before
//   node scripts/admin-layout-shots.mjs --base http://localhost:3112 --label after --compare before
// The check: the subtitle of the page heading (the <p> under the <h1>) must not intersect any of the next elements that follow the heading.
// With --compare it also diffs every screenshot against the same page of the other label and prints the rows that changed (only the heading
// area is expected to change). It creates a temporary admin (removed afterwards). Images go to .shots/ (git-ignored).
import { mkdirSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import * as OTPAuth from "otpauth";
import { chromium } from "playwright";
import { PNG } from "pngjs";
import { checkDevOnly, readDevRef } from "./lib/prod-guard.mjs";
import { cleanupTestData } from "./lib/test-cleanup.mjs";

const arg = (n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : undefined);
const BASE = arg("--base");
const LABEL = arg("--label");
const COMPARE = arg("--compare");
if (!BASE || !LABEL) {
  console.error("Pemakaian: node scripts/admin-layout-shots.mjs --base <url> --label <nama> [--compare <nama-lain>]");
  process.exit(1);
}
const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const i = line.indexOf("=");
  if (i > 0 && !line.trim().startsWith("#")) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const guard = checkDevOnly(env, readDevRef(env));
if (!guard.ok) {
  console.error(guard.error);
  process.exit(1);
}
const sb = createClient(url, env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const anonKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const run = "al" + Math.random().toString(36).slice(2, 7);
const password = `Lay-${run}-Pass12`;
const aName = `zt_la_${run}`;
const email = `${aName}@jagoansosmed-test.invalid`;
mkdirSync(".shots", { recursive: true });

const PAGES = ["orders", "deposits", "refunds", "refills", "tickets", "users", "services", "providers", "ledger", "logs", "announcements", "notifications"];
const VIEWPORTS = { desktop: { width: 1280, height: 900 }, mobile: { width: 390, height: 844 } };
const STILL = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}";

let secret = "";
let lastUsed = "";
const totp = () => new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30 }).generate();
async function freshCode() {
  for (let i = 0; i < 70 && totp() === lastUsed; i++) await new Promise((r) => setTimeout(r, 500));
  lastUsed = totp();
  return lastUsed;
}

async function login(browser, vp, scheme) {
  const ctx = await browser.newContext({ viewport: vp, colorScheme: scheme, deviceScaleFactor: 1, baseURL: BASE });
  const page = await ctx.newPage();
  await page.goto("/admin/login");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.getByPlaceholder("nama_admin").fill(aName);
  await page.getByPlaceholder("Password admin").fill(password);
  await page.locator("form button[type=submit]").click();
  await page.getByPlaceholder("000000").waitFor({ timeout: 40_000 });
  await page.getByPlaceholder("000000").fill(await freshCode());
  await page.locator("form button[type=submit]").click();
  await page.waitForURL((u) => u.pathname === "/admin", { timeout: 40_000 });
  return { ctx, page };
}

/** The subtitle under the h1 versus the elements that follow the heading block. */
const overlapProbe = () => {
  const h1 = document.querySelector("main h1, h1");
  if (!h1) return { found: false, overlaps: [] };
  const heading = h1.parentElement;
  const sub = h1.nextElementSibling;
  const sr = sub.getBoundingClientRect();
  const hit = [];
  let n = 0;
  for (let el = heading.nextElementSibling; el && n < 4; el = el.nextElementSibling) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    n++;
    const overlapY = Math.min(sr.bottom, r.bottom) - Math.max(sr.top, r.top);
    const overlapX = Math.min(sr.right, r.right) - Math.max(sr.left, r.left);
    if (overlapY > 1 && overlapX > 1) hit.push({ el: `${el.tagName.toLowerCase()}${el.dataset.testid ? `[${el.dataset.testid}]` : ""}`, overlapY: Math.round(overlapY) });
  }
  return { found: true, subtitle: sub.textContent, overlaps: hit };
};

function diffRows(a, b) {
  const A = PNG.sync.read(readFileSync(a));
  const B = PNG.sync.read(readFileSync(b));
  if (A.width !== B.width) return { sizeMismatch: true, a: [A.width, A.height], b: [B.width, B.height] };
  const h = Math.min(A.height, B.height);
  let first = -1;
  let last = -1;
  let pixels = 0;
  for (let y = 0; y < h; y++) {
    let rowDiff = false;
    for (let x = 0; x < A.width; x++) {
      const i = (y * A.width + x) * 4;
      if (A.data[i] !== B.data[i] || A.data[i + 1] !== B.data[i + 1] || A.data[i + 2] !== B.data[i + 2]) {
        pixels++;
        rowDiff = true;
      }
    }
    if (rowDiff) {
      if (first < 0) first = y;
      last = y;
    }
  }
  return { pixels, first, last, heightA: A.height, heightB: B.height };
}

let exitCode = 0;
try {
  const { data: u, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username: aName } });
  if (error) throw new Error(error.message);
  await sb.from("profiles").update({ role: "admin" }).eq("id", u.user.id);
  const c = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  await c.auth.signInWithPassword({ email, password });
  const enrol = await c.auth.mfa.enroll({ factorType: "totp", issuer: "JagoanSosmed" });
  secret = enrol.data.totp.secret;
  await c.auth.mfa.challengeAndVerify({ factorId: enrol.data.id, code: await freshCode() });

  const browser = await chromium.launch();
  const flagged = [];
  const changes = [];
  for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
    for (const scheme of ["light", "dark"]) {
      const { ctx, page } = await login(browser, vp, scheme);
      for (const name of PAGES) {
        await page.goto(`/admin/${name}`);
        await page.addStyleTag({ content: STILL });
        await page.locator("h1").first().waitFor({ timeout: 40_000 });
        await page.waitForLoadState("networkidle").catch(() => {});
        await page.waitForTimeout(700);
        const probe = await page.evaluate(overlapProbe);
        if (probe.overlaps.length) flagged.push({ page: name, viewport: vpName, scheme, overlaps: probe.overlaps });
        const file = `.shots/al-${name}-${vpName}-${scheme}.${LABEL}.png`;
        await page.screenshot({ path: file, fullPage: true, animations: "disabled", caret: "hide" });
        if (COMPARE) changes.push({ page: name, viewport: vpName, scheme, ...diffRows(`.shots/al-${name}-${vpName}-${scheme}.${COMPARE}.png`, file) });
      }
      await ctx.close();
    }
  }
  await browser.close();
  console.log(`[${LABEL}] halaman dengan subtitle yang tumpang tindih: ${flagged.length === 0 ? "tidak ada" : ""}`);
  for (const f of flagged) console.log(`  ${f.page} (${f.viewport}, ${f.scheme}): ${f.overlaps.map((o) => `${o.el} -${o.overlapY}px`).join(", ")}`);
  if (COMPARE) {
    const moved = changes.filter((c) => c.sizeMismatch || c.pixels > 0);
    console.log(`[${LABEL}] dibanding "${COMPARE}": ${changes.length - moved.length} dari ${changes.length} tangkapan identik; berubah:`);
    for (const m of moved) console.log(`  ${m.page} ${m.viewport} ${m.scheme}: ${m.sizeMismatch ? "ukuran beda" : `${m.pixels} px, baris ${m.first}-${m.last}, tinggi ${m.heightA}->${m.heightB}`}`);
  }
  if (flagged.length && LABEL !== "before") exitCode = 1;
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  exitCode = 1;
} finally {
  try {
    console.log(`pembersihan: ${JSON.stringify(await cleanupTestData({ marker: "al" }))}`);
  } catch (e) {
    console.error(`PEMBERSIHAN GAGAL: ${e instanceof Error ? e.message : String(e)}`);
    exitCode = 1;
  }
}
process.exit(exitCode);
