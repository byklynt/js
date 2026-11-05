/**
 * Refund journey in a real browser (Chromium) against `next start` (PROVIDER_MODE=mock) and the linked DEV Supabase project:
 * a user places a mock order through the UI, `npm run dev:simulate` forces the provider status to Partial (250 of 1000 remain),
 * the admin presses "Sinkronkan sekarang" in /admin/orders, and the user's balance, order chip, notification and ledger row show the refund.
 * Refuses to run unless the Supabase URL matches SUPABASE_DEV_PROJECT_REF. Never calls the real Likeo.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import * as OTPAuth from "otpauth";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
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
const LIKEO = "5c1e0a00-0000-4000-8000-00000000e001";

describe.skipIf(!enabled)("refund journey: simulate Partial, sync now, see it in the UI", () => {
  const run = Math.random().toString(36).slice(2, 7);
  const password = `Sim-${run}-Pass12`;
  const uName = `zt_s_${run}`;
  const aName = `zt_sa_${run}`;
  const SVC = `ZT-S${run.toUpperCase()}`;
  const email = (n: string) => `${n}@jagoansosmed-test.invalid`;
  let browser: Browser;
  let totpSecret = "";
  const id: Record<string, string> = {};
  const sb = () => createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const code = () => new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(totpSecret), digits: 6, period: 30 }).generate();
  let lastUsed = "";
  const freshCode = async () => {
    for (let i = 0; i < 70 && code() === lastUsed; i++) await new Promise((r) => setTimeout(r, 500));
    lastUsed = code();
    return lastUsed;
  };
  const balance = async (uid: string) => Number((await sb().from("profiles").select("balance").eq("id", uid).single()).data!.balance);
  const simulator = (...args: string[]) =>
    spawnSync("npx", ["tsx", "scripts/dev-simulate.ts", ...args], { encoding: "utf8", shell: process.platform === "win32", env: { ...process.env, ...env, PROVIDER_MODE: "mock" } });

  async function loginUser(): Promise<{ ctx: BrowserContext; page: Page }> {
    const ctx = await browser.newContext({ baseURL: BASE });
    const page = await ctx.newPage();
    await page.goto("/login");
    await page.getByPlaceholder("nama_pengguna").fill(uName);
    await page.getByPlaceholder("Minimal 8 karakter").fill(password);
    await page.getByRole("button", { name: "Masuk", exact: true }).click();
    await page.waitForURL("**/dashboard", { timeout: 30_000 });
    return { ctx, page };
  }

  beforeAll(async () => {
    const ref = env.SUPABASE_DEV_PROJECT_REF;
    if (!ref || !url.includes(ref)) throw new Error("Refusing to run: SUPABASE_DEV_PROJECT_REF does not match NEXT_PUBLIC_SUPABASE_URL.");
    const db = sb();
    const mk = async (n: string) => {
      const { data, error } = await db.auth.admin.createUser({ email: email(n), password, email_confirm: true, user_metadata: { username: n } });
      if (error || !data.user) throw new Error(error?.message);
      return data.user.id;
    };
    id.u = await mk(uName);
    id.a = await mk(aName);
    await db.from("profiles").update({ role: "admin" }).eq("id", id.a);
    const c = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    await c.auth.signInWithPassword({ email: email(aName), password });
    const enrol = await c.auth.mfa.enroll({ factorType: "totp", issuer: "JagoanSosmed" });
    totpSecret = enrol.data!.totp.secret;
    expect((await c.auth.mfa.challengeAndVerify({ factorId: enrol.data!.id, code: await freshCode() })).error).toBeNull();
    await db.from("service_categories").insert({ id: `zt-cat-${run}`, label: `ZT Kategori ${run}`, platform: "instagram" });
    expect((await db.from("services").insert({ id: SVC, provider_id: LIKEO, provider_service_id: "1001", category_id: `zt-cat-${run}`, name: `ZT Followers ${run}`, platform: "instagram", provider_price: 1000, price_per_1000: 1500, min: 100, max: 100000, cancel: true, refill: true, active: true, imported: true })).error).toBeNull();
    await db.rpc("apply_ledger_entry", { p_user: id.u, p_type: "deposit", p_amount: 20_000, p_ref_type: "e2e", p_ref_id: `${run}:u`, p_note: "e2e", p_by: "e2e" });
    browser = await chromium.launch();
  }, 90_000);

  afterAll(async () => {
    await browser?.close();
    simulator("--clear");
    const r = spawnSync("npx", ["supabase", "db", "query", "--remote", "--file", "scripts/db-cleanup-test-data.sql", "--yes"], { encoding: "utf8", shell: process.platform === "win32" });
    if (r.status !== 0) console.error("CLEANUP FAILED:", `${r.stdout}${r.stderr}`.slice(-1200));
  }, 120_000);

  it("Partial 250/1000: sync now refunds floor(1500 * 250 / 1000) = 375 and the UI shows balance, chip, notification and ledger row", async () => {
    // 1. the user places a (mock) order through the UI
    const user = await loginUser();
    await user.page.goto(`/dashboard?service=${SVC}`);
    await user.page.getByPlaceholder("Tempel link postingan atau profil").fill(`https://zt.test/sim-${run}`);
    await user.page.getByPlaceholder("Masukkan jumlah").fill("1000");
    await user.page.getByRole("button", { name: "Pesan Sekarang" }).click();
    await expect.poll(async () => (await sb().from("orders").select("provider_order_id").eq("user_id", id.u)).data?.[0]?.provider_order_id ?? "", { timeout: 40_000 }).toMatch(/^MK-/);
    const order = (await sb().from("orders").select("id,provider_order_id,charge,quantity,status").eq("user_id", id.u).single()).data!;
    expect(order).toMatchObject({ charge: 1500, quantity: 1000, status: "menunggu" });
    expect(await balance(id.u)).toBe(18_500);

    // 2. the simulator (CLI, dev only) forces the provider status
    const sim = simulator(String(order.id), "partial", "250");
    expect(`${sim.stdout}${sim.stderr}`).toContain('"Partial" dengan remains 250');
    expect(sim.status).toBe(0);

    // 3. the admin presses "Sinkronkan sekarang" in /admin/orders
    const actx = await browser.newContext({ baseURL: BASE });
    const admin = await actx.newPage();
    await admin.goto("/admin/login");
    await admin.getByPlaceholder("nama_admin").fill(aName);
    await admin.getByPlaceholder("Password admin").fill(password);
    await admin.locator("form button[type=submit]").click();
    await admin.getByPlaceholder("000000").waitFor({ timeout: 30_000 });
    await admin.getByPlaceholder("000000").fill(await freshCode());
    await admin.locator("form button[type=submit]").click();
    await admin.waitForURL((u) => u.pathname === "/admin", { timeout: 30_000 });
    await admin.goto("/admin/orders");
    await admin.getByPlaceholder("Cari di seluruh data...").fill(String(order.id));
    await admin.getByPlaceholder("Cari di seluruh data...").press("Enter");
    await admin.getByRole("button", { name: `Aksi untuk pesanan ${order.id}` }).click();
    await admin.getByRole("menuitem", { name: "Sinkronkan sekarang" }).click();
    await expect.poll(async () => (await sb().from("orders").select("status").eq("id", order.id).single()).data!.status, { timeout: 30_000 }).toBe("sebagian");
    await admin.getByText(/Provider menjawab "Partial"/).waitFor({ state: "visible", timeout: 20_000 });
    // the refund shows its formula in /admin/refunds
    await admin.goto("/admin/refunds");
    await admin.waitForLoadState("networkidle");
    await expect.poll(async () => admin.locator('[data-testid="refund-formula"]').allInnerTexts().then((t) => t.join("\n")), { timeout: 20_000 }).toContain("floor(1.500 x 250 / 1.000) = Rp375");
    await actx.close();

    // 4. the user's side: balance, status chip, notification, ledger row
    expect(await balance(id.u)).toBe(18_875);
    await user.page.goto("/dashboard/orders");
    await user.page.waitForLoadState("networkidle");
    await expect.poll(async () => user.page.locator("body").innerText(), { timeout: 20_000 }).toContain("Sebagian");
    await user.page.goto("/dashboard");
    await expect.poll(async () => user.page.locator("header").first().innerText(), { timeout: 20_000 }).toContain("Rp18.875");
    await user.page.goto("/dashboard/notifications");
    await user.page.waitForLoadState("networkidle");
    await expect.poll(async () => user.page.locator("body").innerText(), { timeout: 20_000 }).toContain("Refund Rp 375 masuk");
    await user.page.goto("/dashboard/ledger");
    await user.page.waitForLoadState("networkidle");
    const ledgerText = async () => (await user.page.locator("body").innerText()).replace(/\s+/g, " ");
    await expect.poll(ledgerText, { timeout: 20_000 }).toContain(`Refund pesanan #${order.id} (sebagian)`);
    expect(await ledgerText()).toContain("375");
    await user.ctx.close();
  }, 250_000);
});
