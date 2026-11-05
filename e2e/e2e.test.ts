/**
 * End-to-end in a real browser (Chromium) against `next start` and the linked DEV Supabase project.
 * Run with: npm run test:e2e   (builds nothing: run `npm run build` first). Temp accounts (@jagoansosmed-test.invalid) are
 * created through the service role, used through the UI, and removed afterwards by scripts/db-cleanup-test-data.sql.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import * as OTPAuth from "otpauth";
import { chromium, type Browser, type BrowserContext, type Page, type Response } from "playwright";
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
const SECRETS = [serviceKey, env.PROVIDER_KEY_ENC_KEY, env.LIKEO_API_KEY, env.CRON_SECRET].filter((v): v is string => Boolean(v && v.length >= 12));

describe.skipIf(!enabled)("browser e2e: auth, roles, MFA, data isolation", () => {
  const run = Math.random().toString(36).slice(2, 7);
  const password = `E2e-${run}-Pass12`;
  const userName = `zt_e2e_${run}`;
  const adminName = `zt_adm_${run}`;
  let browser: Browser;
  let ids = { user: "", admin: "" };
  let totpSecret = "";
  const leaks: string[] = [];
  const db = () => createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const watch = (page: Page) =>
    page.on("response", async (r: Response) => {
      if (!r.url().startsWith(BASE)) return;
      try {
        const type = r.headers()["content-type"] ?? "";
        if (!/json|text|javascript|html/.test(type)) return;
        const body = await r.text();
        for (const s of SECRETS) if (body.includes(s)) leaks.push(`${r.url()} contains a secret`);
      } catch {
        /* streamed / aborted responses */
      }
    });
  const code = () => new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(totpSecret), digits: 6, period: 30 }).generate();
  async function fresh(): Promise<[BrowserContext, Page]> {
    const ctx = await browser.newContext({ baseURL: BASE });
    const page = await ctx.newPage();
    watch(page);
    return [ctx, page];
  }

  beforeAll(async () => {
    const ref = env.SUPABASE_DEV_PROJECT_REF;
    if (!ref || !url.includes(ref)) throw new Error("Refusing to run: SUPABASE_DEV_PROJECT_REF does not match NEXT_PUBLIC_SUPABASE_URL.");
    const admin = db();
    const mk = async (username: string) => {
      const { data, error } = await admin.auth.admin.createUser({ email: `${username}@jagoansosmed-test.invalid`, password, email_confirm: true, user_metadata: { username } });
      if (error || !data.user) throw new Error(error?.message);
      return data.user.id;
    };
    ids = { user: await mk(userName), admin: await mk(adminName) };
    await admin.from("profiles").update({ role: "admin" }).eq("id", ids.admin);
    await admin.rpc("apply_ledger_entry", { p_user: ids.user, p_type: "deposit", p_amount: 123_456, p_ref_type: "e2e", p_ref_id: `${run}:seed`, p_note: "e2e", p_by: "e2e" });
    // Enrol TOTP for the admin exactly as the app does (Supabase MFA), keeping the secret to generate codes.
    const c = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    await c.auth.signInWithPassword({ email: `${adminName}@jagoansosmed-test.invalid`, password });
    const enrol = await c.auth.mfa.enroll({ factorType: "totp", issuer: "JagoanSosmed" });
    totpSecret = enrol.data!.totp.secret;
    const v = await c.auth.mfa.challengeAndVerify({ factorId: enrol.data!.id, code: code() });
    expect(v.error).toBeNull();
    browser = await chromium.launch();
  }, 90_000);

  afterAll(async () => {
    await browser?.close();
    const r = spawnSync("npx", ["supabase", "db", "query", "--remote", "--file", "scripts/db-cleanup-test-data.sql", "--yes"], { encoding: "utf8", shell: process.platform === "win32" });
    if (r.status !== 0) console.error("CLEANUP FAILED:", `${r.stdout}${r.stderr}`.slice(-1200));
  }, 120_000);

  it("signed-out visitors are sent to the login pages", async () => {
    const [ctx, page] = await fresh();
    await page.goto("/dashboard");
    expect(new URL(page.url()).pathname).toBe("/login");
    await page.goto("/dashboard/orders");
    expect(new URL(page.url()).pathname).toBe("/login");
    await page.goto("/admin");
    expect(new URL(page.url()).pathname).toBe("/admin/login");
    await ctx.close();
  }, 60_000);

  it("user login by USERNAME works; a wrong password and an unknown username give the same generic error", async () => {
    const [ctx, page] = await fresh();
    const attempt = async (u: string, p: string) => {
      await page.goto("/login");
      await page.getByPlaceholder("nama_pengguna").fill(u);
      await page.getByPlaceholder("Minimal 8 karakter").fill(p);
      await page.getByRole("button", { name: "Masuk", exact: true }).click();
    };
    await attempt(userName, "salah-salah-1");
    await expect.poll(async () => page.locator("body").innerText(), { timeout: 20_000 }).toContain("Username atau password salah");
    const wrongPassword = await page.locator('[role="alert"]').first().innerText().catch(() => "");
    await attempt(`tidak_ada_${run}`, "salah-salah-1");
    await expect.poll(async () => page.locator("body").innerText(), { timeout: 20_000 }).toContain("Username atau password salah");
    const unknownUser = await page.locator('[role="alert"]').first().innerText().catch(() => "");
    expect(unknownUser).toBe(wrongPassword);
    await attempt(userName, password);
    await page.waitForURL("**/dashboard", { timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: ".e2e-dashboard.png" });
    await expect.poll(async () => page.locator("body").innerText(), { timeout: 20_000, message: "dashboard shows the ledger balance" }).toContain("123.456");
    await ctx.close();
  }, 120_000);

  it("a normal user cannot open /admin", async () => {
    const [ctx, page] = await fresh();
    await page.goto("/login");
    await page.getByPlaceholder("nama_pengguna").fill(userName);
    await page.getByPlaceholder("Minimal 8 karakter").fill(password);
    await page.getByRole("button", { name: "Masuk", exact: true }).click();
    await page.waitForURL("**/dashboard", { timeout: 30_000 });
    // requireAdmin() redirects from inside a streamed boundary, so the browser moves a moment after the response: poll.
    await page.goto("/admin");
    await expect.poll(() => new URL(page.url()).pathname, { timeout: 20_000 }).toBe("/dashboard");
    await page.goto("/admin/users");
    await expect.poll(() => new URL(page.url()).pathname, { timeout: 20_000 }).toBe("/dashboard");
    expect(await page.locator("body").innerText()).not.toContain(adminName);
    await ctx.close();
  }, 120_000);

  it("admin: password alone is NOT enough, the TOTP code opens the panel, and the panel shows real data", async () => {
    const [ctx, page] = await fresh();
    await page.goto("/admin/login");
    await page.getByPlaceholder("nama_admin").fill(adminName);
    await page.getByPlaceholder("Password admin").fill(password);
    await page.locator("form button[type=submit]").click();
    await page.getByPlaceholder("000000").waitFor({ timeout: 30_000 });
    // password accepted, second step pending: the panel must still be closed
    await page.goto("/admin/users");
    await page.waitForLoadState("networkidle");
    expect(new URL(page.url()).pathname).toBe("/admin/login");
    await page.getByPlaceholder("000000").fill("000000");
    await page.locator("form button[type=submit]").click();
    await expect.poll(async () => page.locator("body").innerText(), { timeout: 20_000 }).toMatch(/salah|kedaluwarsa/i);
    await page.getByPlaceholder("000000").fill(code());
    await page.locator("form button[type=submit]").click();
    await page.waitForURL((u) => u.pathname === "/admin", { timeout: 30_000 });
    await page.goto("/admin/users");
    await page.waitForLoadState("networkidle");
    expect(await page.locator("body").innerText()).toContain(userName); // snapshot from Supabase
    await ctx.close();
  }, 150_000);

  it("another user's data is not readable by id, and no secret reaches a browser response", async () => {
    // RLS with the user's real session (anon key): own rows only.
    const c = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    await c.auth.signInWithPassword({ email: `${userName}@jagoansosmed-test.invalid`, password });
    expect((await c.from("profiles").select("id")).data).toHaveLength(1);
    expect((await c.from("audit_logs").select("id")).data ?? []).toHaveLength(0);
    expect((await c.from("balance_ledger").select("amount")).data).toHaveLength(1);
    const adminRow = await c.from("profiles").select("balance").eq("id", ids.admin);
    expect(adminRow.data ?? []).toHaveLength(0);
    const writeBalance = await c.from("profiles").update({ balance: 9_999_999 }).eq("id", ids.user);
    expect(writeBalance.error).not.toBeNull();
    expect((await c.rpc("apply_ledger_entry" as never, { p_user: ids.user, p_type: "deposit", p_amount: 1, p_ref_type: "x", p_ref_id: "y" } as never)).error).not.toBeNull();
    expect(leaks).toEqual([]);
  }, 60_000);

  it("logout ends the session", async () => {
    const [ctx, page] = await fresh();
    await page.goto("/login");
    await page.getByPlaceholder("nama_pengguna").fill(userName);
    await page.getByPlaceholder("Minimal 8 karakter").fill(password);
    await page.getByRole("button", { name: "Masuk", exact: true }).click();
    await page.waitForURL("**/dashboard", { timeout: 30_000 });
    await page.getByRole("button", { name: /keluar|logout/i }).first().click().catch(async () => {
      await page.getByText(/keluar/i).first().click();
    });
    await page.waitForTimeout(2500);
    await page.goto("/dashboard");
    expect(new URL(page.url()).pathname).toBe("/login");
    await ctx.close();
  }, 120_000);
});
