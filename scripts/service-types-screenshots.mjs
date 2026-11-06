// Dev tool: screenshot diff of the order form for a NORMAL service before and after the service-types change, plus the new textarea state.
//   node scripts/service-types-screenshots.mjs --before http://localhost:3111 --after http://localhost:3112
// "before" is a server built from the commit BEFORE the feature (main), "after" the current build; both talk to the same DEV Supabase project.
// It creates a temporary user and a ZT- category with one normal service and one Custom Comments service (everything is removed afterwards by the
// in-process test cleanup), screenshots the order form of the normal service on both servers (they must be identical: 0 differing pixels), and
// screenshots the Custom Comments form (empty and with three comments) on the "after" server. Images go to .shots/ (git-ignored).
import { mkdirSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { PNG } from "pngjs";
import { checkDevOnly, readDevRef } from "./lib/prod-guard.mjs";
import { cleanupTestData } from "./lib/test-cleanup.mjs";

const arg = (name) => process.argv[process.argv.indexOf(name) + 1];
const BEFORE = arg("--before");
const AFTER = arg("--after");
if (!BEFORE || !AFTER) {
  console.error("Pemakaian: node scripts/service-types-screenshots.mjs --before <url> --after <url>");
  process.exit(1);
}
const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const i = line.indexOf("=");
  if (i > 0 && !line.trim().startsWith("#")) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const devCheck = checkDevOnly(env, readDevRef(env));
if (!devCheck.ok) {
  console.error(devCheck.error);
  process.exit(1);
}
const sb = createClient(url, env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const run = "sh" + Math.random().toString(36).slice(2, 7);
const password = `Shot-${run}-Pass12`;
const uName = `zt_shu_${run}`;
const NORMAL = `ZT-${run.toUpperCase()}N`;
const CC = `ZT-${run.toUpperCase()}C`;
mkdirSync(".shots", { recursive: true });

const STILL = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}";

async function loginUser(ctx, base) {
  const page = await ctx.newPage();
  await page.goto(`${base}/login`);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.getByPlaceholder("nama_pengguna").fill(uName);
  await page.getByPlaceholder("Minimal 8 karakter").fill(password);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await page.waitForURL("**/dashboard", { timeout: 40_000 });
  return page;
}

async function shoot(base, service, label, fill) {
  const browser = shoot.browser;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "light", deviceScaleFactor: 1 });
  const page = await loginUser(ctx, base);
  await page.goto(`${base}/dashboard?service=${service}`);
  await page.addStyleTag({ content: STILL });
  await page.getByText(/Min: /).first().waitFor({ timeout: 40_000 });
  if (fill) await fill(page);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1200);
  const file = `.shots/${label}.png`;
  await page.screenshot({ path: file, fullPage: true, animations: "disabled", caret: "hide" });
  await ctx.close();
  return file;
}

function diffPixels(fileA, fileB) {
  const a = PNG.sync.read(readFileSync(fileA));
  const b = PNG.sync.read(readFileSync(fileB));
  if (a.width !== b.width || a.height !== b.height) return { sizeBefore: [a.width, a.height], sizeAfter: [b.width, b.height], pixels: -1 };
  let pixels = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2] || a.data[i + 3] !== b.data[i + 3]) pixels++;
  }
  return { sizeBefore: [a.width, a.height], sizeAfter: [b.width, b.height], pixels };
}

let exitCode = 0;
try {
  const { data: u, error } = await sb.auth.admin.createUser({ email: `${uName}@jagoansosmed-test.invalid`, password, email_confirm: true, user_metadata: { username: uName } });
  if (error) throw new Error(error.message);
  const prov = await sb.from("providers").insert({ name: `ZT ${run}`, slug: `zt-${run}`, mode: "mock", active: true }).select("id").single();
  if (prov.error) throw new Error(prov.error.message);
  await sb.from("service_categories").insert({ id: `zt-cat-${run}`, label: `ZT Kategori ${run}`, platform: "instagram" });
  for (const [id, type, min, max, pid] of [[NORMAL, "Default", 100, 100000, "1001"], [CC, "Custom Comments", 2, 10, "1005"]]) {
    const r = await sb.from("services").insert({ id, provider_id: prov.data.id, provider_service_id: pid, category_id: `zt-cat-${run}`, name: `ZT ${type} ${run}`, platform: "instagram", provider_type: type, provider_price: 1000, price_per_1000: 2500, min, max, active: true, imported: true });
    if (r.error) throw new Error(r.error.message);
  }
  void u;
  shoot.browser = await chromium.launch();
  const before = await shoot(BEFORE, NORMAL, "st-normal.before");
  const after = await shoot(AFTER, NORMAL, "st-normal.after");
  const d = diffPixels(before, after);
  const identical = d.pixels === 0;
  console.log(`order form, normal service: before ${d.sizeBefore.join("x")} / after ${d.sizeAfter.join("x")}: ${identical ? "IDENTIK (0 piksel berbeda)" : `BERBEDA (${d.pixels} piksel)`}`);
  if (!identical) exitCode = 1;
  console.log(`  ${before}\n  ${after}`);
  const empty = await shoot(AFTER, CC, "st-comments.empty");
  const filled = await shoot(AFTER, CC, "st-comments.filled", async (p) => {
    await p.getByLabel("Komentar (satu komentar per baris)").fill("Mantap sekali\n\nKeren banget\nTop");
    await p.getByText("Jumlah: 3 komentar").waitFor({ timeout: 10_000 });
  });
  console.log(`Custom Comments (hanya after): ${empty}, ${filled}`);
  await shoot.browser.close();
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  exitCode = 1;
} finally {
  try {
    console.log(`pembersihan: ${JSON.stringify(await cleanupTestData({ marker: "sh" }))}`);
  } catch (e) {
    console.error(`PEMBERSIHAN GAGAL: ${e instanceof Error ? e.message : String(e)}`);
    exitCode = 1;
  }
}
process.exit(exitCode);
