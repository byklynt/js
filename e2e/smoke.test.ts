/**
 * Smoke test of EVERY admin route and EVERY user route in a real browser, on an empty database and again after a little data exists.
 * A page FAILS the test on: an error overlay / "page couldn't load" text, a console error, an uncaught page error, a failed request,
 * or any same-origin response >= 400. Run with `npm run test:e2e` (build first). Temp accounts are removed afterwards.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import * as OTPAuth from "otpauth";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const BASE = process.env.E2E_BASE ?? "http://localhost:3110";
const env: Record<string, string> = {};
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0 && !line.startsWith("#")) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
}
const enabled = process.env.RUN_E2E === "1" && Boolean(env.NEXT_PUBLIC_SUPABASE_URL);
const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "";
const anonKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const ADMIN_ROUTES = [
  "/admin", "/admin/stats", "/admin/stats?tab=layanan", "/admin/stats?tab=pengguna", "/admin/stats?tab=provider", "/admin/stats?tab=operasional",
  "/admin/stats?range=7&compare=1", "/admin/users", "/admin/orders", "/admin/services", "/admin/providers", "/admin/deposits", "/admin/refills", "/admin/refunds",
  "/admin/ledger", "/admin/tickets", "/admin/announcements", "/admin/logs", "/admin/notifications",
  "/admin/settings", "/admin/settings/notifications", "/admin/settings/operations", "/admin/settings/order-rules", "/admin/settings/payments", "/admin/settings/ranks", "/admin/settings/security",
];
export const USER_ROUTES = [
  "/dashboard", "/dashboard/services", "/dashboard/orders", "/dashboard/mass-order", "/dashboard/refill", "/dashboard/refunds", "/dashboard/ledger", "/dashboard/add-funds",
  "/dashboard/tickets", "/dashboard/notifications", "/dashboard/updates", "/dashboard/api", "/dashboard/affiliates", "/dashboard/child-panel",
  "/dashboard/settings", "/dashboard/settings/2fa", "/dashboard/settings/experience", "/dashboard/settings/invoice", "/dashboard/settings/notifications", "/dashboard/settings/timezone-api",
];

const CRASH_TEXT = /This page couldn[’']t load|A server error occurred|Application error|Runtime Error|Unhandled Runtime Error|Internal Server Error|Terjadi kesalahan di server/i;

describe.skipIf(!enabled)("smoke: every admin and user route renders cleanly", () => {
  const run = Math.random().toString(36).slice(2, 7);
  const password = `Smk-${run}-Pass12`;
  const userName = `zt_smk_${run}`;
  const adminName = `zt_sadm_${run}`;
  const svcId = `ZT-S${run.toUpperCase()}`;
  let browser: Browser;
  let totpSecret = "";
  let ids = { user: "", admin: "" };
  const sb = () => createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const code = () => new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(totpSecret), digits: 6, period: 30 }).generate();
  // Supabase refuses a TOTP code that was already used, so every login waits for the next 30 s step.
  let lastUsed = "";
  const freshCode = async () => {
    for (let i = 0; i < 70 && code() === lastUsed; i++) await new Promise((r) => setTimeout(r, 500));
    lastUsed = code();
    return lastUsed;
  };

  /** Visits `routes` and returns every problem found (route + what). Never throws on the first one. */
  async function visit(page: Page, routes: string[]) {
    const problems: string[] = [];
    let current = "";
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      const text = m.text();
      // Resource errors are reported by the response / requestfailed handlers below with the URL; avoid double counting.
      if (/Failed to load resource/.test(text)) return;
      problems.push(`${current}: console error: ${text.slice(0, 200)}`);
    });
    page.on("pageerror", (e) => problems.push(`${current}: page error: ${e.message.slice(0, 200)}`));
    page.on("requestfailed", (r) => {
      const why = r.failure()?.errorText ?? "";
      if (/ERR_ABORTED/.test(why)) return; // navigations / prefetches cancelled by the next click are not failures
      problems.push(`${current}: request failed ${r.method()} ${r.url()} (${why})`);
    });
    page.on("response", (r) => {
      if (r.url().startsWith(BASE) && r.status() >= 400) problems.push(`${current}: HTTP ${r.status()} ${r.url().replace(BASE, "")}`);
    });
    for (const route of routes) {
      current = route;
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle").catch(() => undefined);
      await page.waitForTimeout(400); // streamed boundaries / client effects settle
      const text = await page.locator("body").innerText().catch(() => "");
      if (CRASH_TEXT.test(text)) problems.push(`${route}: crash text on page: "${text.match(CRASH_TEXT)?.[0]}"`);
      if (await page.locator("nextjs-portal, [data-nextjs-dialog-overlay], vite-error-overlay").count()) problems.push(`${route}: error overlay present`);
      const path = new URL(page.url()).pathname;
      const wanted = route.split("?")[0];
      if (path !== wanted && !(wanted === "/admin/stats" && path === "/admin/stats")) problems.push(`${route}: ended on ${path} (unexpected redirect)`);
      if (text.trim().length < 20) problems.push(`${route}: page is blank`);
    }
    return problems;
  }

  async function adminPage() {
    const ctx = await browser.newContext({ baseURL: BASE });
    const page = await ctx.newPage();
    await page.goto("/admin/login");
    await page.getByPlaceholder("nama_admin").fill(adminName);
    await page.getByPlaceholder("Password admin").fill(password);
    await page.locator("form button[type=submit]").click();
    await page.getByPlaceholder("000000").waitFor({ timeout: 30_000 });
    await page.getByPlaceholder("000000").fill(await freshCode());
    await page.locator("form button[type=submit]").click();
    await page.waitForURL((u) => u.pathname === "/admin", { timeout: 30_000 });
    return { ctx, page };
  }
  async function userPage() {
    const ctx = await browser.newContext({ baseURL: BASE });
    const page = await ctx.newPage();
    await page.goto("/login");
    await page.getByPlaceholder("nama_pengguna").fill(userName);
    await page.getByPlaceholder("Minimal 8 karakter").fill(password);
    await page.getByRole("button", { name: "Masuk", exact: true }).click();
    await page.waitForURL("**/dashboard", { timeout: 30_000 });
    return { ctx, page };
  }

  beforeAll(async () => {
    const ref = env.SUPABASE_DEV_PROJECT_REF;
    if (!ref || !url.includes(ref)) throw new Error("Refusing to run: SUPABASE_DEV_PROJECT_REF does not match NEXT_PUBLIC_SUPABASE_URL.");
    const admin = sb();
    const mk = async (username: string) => {
      const { data, error } = await admin.auth.admin.createUser({ email: `${username}@jagoansosmed-test.invalid`, password, email_confirm: true, user_metadata: { username } });
      if (error || !data.user) throw new Error(error?.message);
      return data.user.id;
    };
    ids = { user: await mk(userName), admin: await mk(adminName) };
    await admin.from("profiles").update({ role: "admin" }).eq("id", ids.admin);
    const c = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    await c.auth.signInWithPassword({ email: `${adminName}@jagoansosmed-test.invalid`, password });
    const enrol = await c.auth.mfa.enroll({ factorType: "totp", issuer: "JagoanSosmed" });
    totpSecret = enrol.data!.totp.secret;
    expect((await c.auth.mfa.challengeAndVerify({ factorId: enrol.data!.id, code: await freshCode() })).error).toBeNull();
    browser = await chromium.launch();
  }, 90_000);

  afterAll(async () => {
    await browser?.close();
    const r = spawnSync("npx", ["supabase", "db", "query", "--remote", "--file", "scripts/db-cleanup-test-data.sql", "--yes"], { encoding: "utf8", shell: process.platform === "win32" });
    if (r.status !== 0) console.error("CLEANUP FAILED:", `${r.stdout}${r.stderr}`.slice(-1200));
  }, 120_000);

  it("admin: every route renders on an empty database", async () => {
    const { ctx, page } = await adminPage();
    const problems = await visit(page, ADMIN_ROUTES);
    await ctx.close();
    expect(problems).toEqual([]);
  }, 400_000);

  it("user: every route renders for a brand-new account", async () => {
    const { ctx, page } = await userPage();
    const problems = await visit(page, USER_ROUTES);
    await ctx.close();
    expect(problems).toEqual([]);
  }, 400_000);

  it("admin and user: every route renders after data exists (user, order, ticket, deposit, refund, announcement)", async () => {
    const db = sb();
    await db.from("service_categories").insert({ id: `zt-cat-${run}`, label: `ZT Kategori ${run}`, platform: "instagram" });
    expect((await db.from("services").insert({ id: svcId, provider_id: "5c1e0a00-0000-4000-8000-00000000e001", provider_service_id: "1001", category_id: `zt-cat-${run}`, name: `ZT Followers ${run}`, platform: "instagram", provider_price: 1000, price_per_1000: 1500, min: 100, max: 100000, cancel: true, refill: true, active: true, imported: true })).error).toBeNull();
    await db.rpc("apply_ledger_entry", { p_user: ids.user, p_type: "deposit", p_amount: 50_000, p_ref_type: "smoke", p_ref_id: `${run}:seed`, p_note: "smoke", p_by: "smoke" });
    const placed = await db.rpc("place_order", { p_user: ids.user, p_service: svcId, p_link: "https://zt.test/smoke", p_quantity: 1000 });
    expect(placed.error).toBeNull();
    const orderId = placed.data![0].order_id;
    await db.from("orders").update({ status: "sebagian", remains: 250 }).eq("id", orderId);
    expect((await db.rpc("create_refund_for_order", { p_order: orderId, p_reason: "sebagian" })).error).toBeNull();
    expect((await db.rpc("create_refund_for_order", { p_order: orderId, p_reason: "manual", p_amount: 100, p_source: "admin", p_by: ids.admin, p_note: "uji refund manual smoke", p_settle: false })).error).toBeNull();
    const t = await db.from("tickets").insert({ user_id: ids.user, title: "Pesanan - Lainnya", category: "pesanan", subcategory: "Lainnya", status: "menunggu" }).select("id").single();
    await db.from("ticket_messages").insert({ ticket_id: t.data!.id, sender: "user", sender_id: ids.user, body: "Halo, ini tiket uji smoke." });
    await db.from("deposits").insert({ user_id: ids.user, method: "Transfer manual", amount: 20_000, status: "menunggu" });
    await db.from("announcements").insert({ title: `ZT Pengumuman ${run}`, body: "Isi pengumuman uji.", audience: "semua", placements: ["dashboard", "pembaruan"], publish_at: new Date(Date.now() - 120_000).toISOString() });

    const a = await adminPage();
    const adminProblems = await visit(a.page, ADMIN_ROUTES);
    // the data must actually show up where it belongs
    await a.page.goto("/admin/users");
    await a.page.waitForLoadState("networkidle");
    expect(await a.page.locator("body").innerText()).toContain(userName);
    await a.page.goto("/admin/tickets");
    await a.page.waitForLoadState("networkidle");
    expect(await a.page.locator("body").innerText()).toContain("Pesanan - Lainnya");
    await a.ctx.close();
    const u = await userPage();
    const userProblems = await visit(u.page, USER_ROUTES);
    await u.ctx.close();
    expect([...adminProblems, ...userProblems]).toEqual([]);
  }, 600_000);
});
