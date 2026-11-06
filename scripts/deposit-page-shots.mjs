// Dev tool: screenshots of the payment page /deposit/[id] in every state (DEV only, seeded deposits, no gateway calls).
//   node scripts/deposit-page-shots.mjs --base http://localhost:3112 --label after --out <folder>
// Creates a temporary user (and a second one for the not-found view) and Paymenku-style deposit rows in each state, logs in, and takes full-page shots at
// 1440 and 390 px wide in light and dark. Start the server with PAYMENKU_API_KEY empty so that opening a pending deposit never calls the gateway.
// Everything it creates carries the marker "ds" and is removed afterwards by the in-process test cleanup.
import { mkdirSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import QRCode from "qrcode";
import { checkDevOnly, readDevRef } from "./lib/prod-guard.mjs";
import { cleanupTestData } from "./lib/test-cleanup.mjs";

const arg = (n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : undefined);
const BASE = arg("--base");
const LABEL = arg("--label") ?? "shot";
const OUT = arg("--out");
if (!BASE || !OUT) {
  console.error("Pemakaian: node scripts/deposit-page-shots.mjs --base <url> --label <nama> --out <folder>");
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
const run = "ds" + Math.random().toString(36).slice(2, 7);
const password = `Dsh-${run}-Pass12`;
const mkUser = async (n) => {
  const username = `zt_${n}_${run}`;
  const { data, error } = await sb.auth.admin.createUser({ email: `${username}@jagoansosmed-test.invalid`, password, email_confirm: true, user_metadata: { username } });
  if (error) throw new Error(error.message);
  return { id: data.user.id, username };
};
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };
const minutes = (n) => new Date(Date.now() + n * 60_000).toISOString();

try {
  const u = await mkUser("du");
  const v = await mkUser("dv");
  const qr = await QRCode.toDataURL(`QRIS-${run}-demo`, { margin: 1, width: 480 });
  const base = { user_id: u.id, gateway: "paymenku", is_sandbox: true, created_at: minutes(-1) };
  const rows = {
    "pending-qris": { ...base, method: "QRIS", channel_code: "qris", amount: 50_000, pay_amount: 50_550, fee_amount: 550, status: "menunggu", gateway_status: "pending", expires_at: minutes(14), external_id: `zt-${run}-1`, payment_info: { qr_url: qr, transaction_status: "pending", sandbox: true }, pay_url: "https://example.invalid/pay/1" },
    "pending-qris-low": { ...base, method: "QRIS", channel_code: "qris", amount: 25_000, pay_amount: 25_000, fee_amount: 0, status: "menunggu", gateway_status: "pending", expires_at: minutes(1.5), external_id: `zt-${run}-2`, payment_info: { qr_url: qr, transaction_status: "pending" }, pay_url: "https://example.invalid/pay/2" },
    "pending-va": { ...base, method: "BCA Virtual Account", channel_code: "bca_va", amount: 100_000, pay_amount: 100_000, fee_amount: 0, status: "menunggu", gateway_status: "pending", expires_at: minutes(1380), external_id: `zt-${run}-3`, payment_info: { bank: "BCA", va_number: "8277012345678901", transaction_status: "pending" }, pay_url: "https://example.invalid/pay/3" },
    "pending-ewallet": { ...base, method: "DANA", channel_code: "dana", amount: 75_000, pay_amount: 75_000, fee_amount: 0, status: "menunggu", gateway_status: "pending", expires_at: minutes(30), external_id: `zt-${run}-4`, payment_info: { checkout_url: "https://example.invalid/checkout/4", transaction_status: "pending" }, pay_url: "https://example.invalid/pay/4" },
    paid: { ...base, method: "QRIS", channel_code: "qris", amount: 50_000, pay_amount: 50_550, fee_amount: 550, status: "berhasil", gateway_status: "paid", expires_at: minutes(10), paid_at: new Date().toISOString(), external_id: `zt-${run}-5`, payment_info: { qr_url: qr } },
    expired: { ...base, method: "QRIS", channel_code: "qris", amount: 50_000, pay_amount: 50_550, fee_amount: 550, status: "kedaluwarsa", gateway_status: "expired", expires_at: minutes(-5), external_id: `zt-${run}-6`, payment_info: { qr_url: qr } },
    failed: { ...base, method: "DANA", channel_code: "dana", amount: 75_000, pay_amount: 75_000, fee_amount: 0, status: "gagal", gateway_status: "failed", expires_at: minutes(-5), external_id: `zt-${run}-7`, payment_info: {} },
    cancelled: { ...base, method: "QRIS", channel_code: "qris", amount: 20_000, pay_amount: 20_550, fee_amount: 550, status: "dibatalkan", gateway_status: "cancelled", expires_at: minutes(5), external_id: `zt-${run}-8`, payment_info: {} },
  };
  const ids = {};
  for (const [name, row] of Object.entries(rows)) {
    const { data, error } = await sb.from("deposits").insert(row).select("id").single();
    if (error) throw new Error(`${name}: ${error.message}`);
    ids[name] = data.id;
  }
  const browser = await chromium.launch();
  const shots = [];
  for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
    for (const scheme of ["light", "dark"]) {
      const login = async (name) => {
        const ctx = await browser.newContext({ viewport: vp, colorScheme: scheme, deviceScaleFactor: 1, baseURL: BASE });
        await ctx.addInitScript((s) => { try { localStorage.setItem("theme", s); } catch { /* ignore */ } }, scheme);
        const page = await ctx.newPage();
        await page.goto("/login");
        await page.waitForLoadState("networkidle").catch(() => {});
        await page.getByPlaceholder("nama_pengguna").fill(name);
        await page.getByPlaceholder("Minimal 8 karakter").fill(password);
        await page.getByRole("button", { name: "Masuk", exact: true }).click();
        await page.waitForURL("**/dashboard", { timeout: 40_000 });
        return { ctx, page };
      };
      const mine = await login(u.username);
      const other = await login(v.username);
      for (const [name, depId] of Object.entries(ids)) {
        await mine.page.goto(`/deposit/${depId}`);
        await mine.page.waitForLoadState("networkidle").catch(() => {});
        await mine.page.waitForTimeout(900);
        const file = `${OUT}/${LABEL}-${name}-${vpName}-${scheme}.png`;
        await mine.page.screenshot({ path: file, fullPage: true, animations: "disabled" });
        shots.push(file);
      }
      // another user's deposit: the not-found view
      await other.page.goto(`/deposit/${ids.paid}`);
      await other.page.waitForLoadState("networkidle").catch(() => {});
      await other.page.waitForTimeout(700);
      const nf = `${OUT}/${LABEL}-notfound-${vpName}-${scheme}.png`;
      await other.page.screenshot({ path: nf, fullPage: true, animations: "disabled" });
      shots.push(nf);
      // the loading skeleton: the first paint of the route (best effort)
      await mine.page.goto(`/deposit/${ids["pending-qris"]}`, { waitUntil: "commit" });
      const sk = `${OUT}/${LABEL}-loading-${vpName}-${scheme}.png`;
      await mine.page.screenshot({ path: sk, fullPage: true, animations: "disabled" });
      shots.push(sk);
      await mine.ctx.close();
      await other.ctx.close();
    }
  }
  await browser.close();
  console.log(`${shots.length} tangkapan layar di ${OUT}`);
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
} finally {
  try {
    console.log(`pembersihan: ${JSON.stringify(await cleanupTestData({ marker: "ds" }))}`);
  } catch (e) {
    console.error(`PEMBERSIHAN GAGAL: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  }
}
