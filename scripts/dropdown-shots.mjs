// Dev tool: screenshots of the Order Baru form with the category dropdown open, and of the Layanan page (DEV only, seeded catalogue).
//   node scripts/dropdown-shots.mjs --base http://localhost:3112 --label after --out <folder>
// Seeds one provider with categories that are stored under "lainnya" (WhatsApp, Shopee, Kick, Kwai, LinkedIn, Snapchat, Google Maps, CoinMarketCap and an unknown one),
// logs in as a temporary user and takes shots at 1440 and 390 px wide in light and dark. Everything carries the marker "dr" and is removed afterwards.
import { mkdirSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { checkDevOnly, readDevRef } from "./lib/prod-guard.mjs";
import { cleanupTestData } from "./lib/test-cleanup.mjs";

const arg = (n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : undefined);
const BASE = arg("--base");
const LABEL = arg("--label") ?? "shot";
const OUT = arg("--out");
if (!BASE || !OUT) {
  console.error("Pemakaian: node scripts/dropdown-shots.mjs --base <url> --label <nama> --out <folder>");
  process.exit(1);
}
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
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const run = "dr" + Math.random().toString(36).slice(2, 7);
const password = `Drp-${run}-Pass12`;
mkdirSync(OUT, { recursive: true });

const CATS = [
  ["WhatsApp Channel Members", "WhatsApp Channel Members | Real"],
  ["CoinMarketCap Votes", "CoinMarketCap Daily Votes"],
  ["Shopee Followers", "Shopee Followers | Indonesia"],
  ["Kick Livestream Viewers", "Kick Livestream Viewers 30 Min"],
  ["Kwai Likes", "Kwai Likes | Fast"],
  ["LinkedIn Followers", "LinkedIn Company Followers"],
  ["Snapchat Story Views", "Snapchat Story Views"],
  ["Google Maps Reviews", "Google Maps 5 Star Reviews"],
  ["Clubhouse Members", "Clubhouse Room Members"],
];

try {
  const username = `zt_dr_${run}`;
  const { data: u, error: ue } = await sb.auth.admin.createUser({ email: `${username}@jagoansosmed-test.invalid`, password, email_confirm: true, user_metadata: { username } });
  if (ue) throw new Error(ue.message);
  const prov = await sb.from("providers").insert({ name: `ZT ${run}`, slug: `zt-${run}`, mode: "mock", active: true }).select("id").single();
  if (prov.error) throw new Error(prov.error.message);
  await sb.from("service_categories").insert(CATS.map(([label], i) => ({ id: `zt-cat-${run}-${i}`, label, platform: "lainnya" })));
  for (const [i, [, svc]] of CATS.entries()) {
    const r = await sb.from("services").insert({ id: `ZT-${run.toUpperCase()}${i}`, provider_id: prov.data.id, provider_service_id: `${run}${i}`, category_id: `zt-cat-${run}-${i}`, name: svc, platform: "lainnya", min: 100, max: 100000, active: true, imported: true, provider_price: 1000, price_per_1000: 2000 });
    if (r.error) throw new Error(r.error.message);
  }
  const browser = await chromium.launch();
  const shots = [];
  for (const [vpName, vp, touch] of [["desktop", { width: 1440, height: 900 }, false], ["mobile", { width: 390, height: 844 }, true]]) {
    for (const scheme of ["light", "dark"]) {
      const ctx = await browser.newContext({ viewport: vp, colorScheme: scheme, deviceScaleFactor: 1, isMobile: touch, hasTouch: touch, baseURL: BASE });
      await ctx.addInitScript((s) => { try { localStorage.setItem("theme", s); } catch { /* ignore */ } }, scheme);
      const page = await ctx.newPage();
      await page.goto("/login");
      await page.waitForLoadState("networkidle").catch(() => {});
      for (let attempt = 0; attempt < 4; attempt++) {
        await page.waitForTimeout(800);
        await page.getByPlaceholder("nama_pengguna").fill(username);
        await page.getByPlaceholder("Minimal 8 karakter").fill(password);
        await page.getByRole("button", { name: "Masuk", exact: true }).click();
        if (await page.waitForURL("**/dashboard", { timeout: 12_000 }).then(() => true, () => false)) break;
        await page.reload();
        await page.waitForLoadState("networkidle").catch(() => {});
      }
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(1200);
      const shot = async (name, full = false) => {
        const file = `${OUT}/${LABEL}-${name}-${vpName}-${scheme}.png`;
        await page.screenshot({ path: file, fullPage: full, animations: "disabled" });
        shots.push(file);
      };
      await shot("order-baru", true);
      // the "Lainnya" chip shows the categories stored under the catch-all platform (WhatsApp, Kwai, Google Maps, ...)
      await page.getByRole("tab", { name: "Lainnya" }).click().catch(() => {});
      await page.waitForTimeout(700);
      const trigger = page.getByRole("button", { name: /Kategori|Pilih kategori|Category/ }).first();
      await trigger.scrollIntoViewIfNeeded().catch(() => {});
      await trigger.click().catch(() => {});
      await page.waitForTimeout(600);
      await page.evaluate(() => window.scrollBy(0, 160)).catch(() => {});
      await page.waitForTimeout(300);
      await shot("order-kategori-terbuka");
      await page.keyboard.press("Escape");
      await page.goto("/dashboard/services");
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(1200);
      await shot("layanan", true);
      await page.getByRole("button", { name: /^Kategori/ }).first().click().catch(() => {});
      await page.waitForTimeout(500);
      await shot("layanan-kategori-terbuka");
      await ctx.close();
    }
  }
  await browser.close();
  console.log(`${shots.length} tangkapan layar di ${OUT}`);
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
} finally {
  try {
    console.log(`pembersihan: ${JSON.stringify(await cleanupTestData({ marker: "dr" }))}`);
  } catch (e) {
    console.error(`PEMBERSIHAN GAGAL: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  }
}
