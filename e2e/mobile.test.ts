/**
 * Mobile regression guard (WebKit = closest to iOS Safari, and Chromium; 390x844 and 360x640): the main user pages and key admin pages must not scroll
 * sideways and must not contain a text field under 16px (iOS Safari zooms into those on focus). The full audit is scripts/mobile-audit.mjs; this is
 * the fast version that runs per file like the other e2e tests. Refuses to run unless the Supabase URL is the DEV project.
 */
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import * as OTPAuth from "otpauth";
import { chromium, webkit, type Browser, type BrowserContext } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupOrFail } from "../scripts/lib/test-cleanup.mjs";
import { auditInPage } from "../scripts/lib/mobile-checks.mjs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3110";
const env: Record<string, string> = {};
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0 && !line.trim().startsWith("#")) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
}
const enabled = process.env.RUN_E2E === "1" && Boolean(env.NEXT_PUBLIC_SUPABASE_URL);
const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "";
const anonKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const UA_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const UA_ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
const CONFIGS = [
  { engine: "webkit", name: "iPhone 14 (390x844)", w: 390, h: 844, dpr: 3, ua: UA_IPHONE },
  { engine: "webkit", name: "iPhone SE small (360x640)", w: 360, h: 640, dpr: 2, ua: UA_IPHONE },
  { engine: "chromium", name: "Android (390x844)", w: 390, h: 844, dpr: 3, ua: UA_ANDROID },
  { engine: "chromium", name: "Android small (360x640)", w: 360, h: 640, dpr: 3, ua: UA_ANDROID },
] as const;

type Where = "public" | "user" | "admin";

describe.skipIf(!enabled)("mobile: no sideways scroll, no field under 16px", () => {
  const MARKER = "mq";
  const run = MARKER + Math.random().toString(36).slice(2, 7);
  const password = `Mob-${run}-Pass12`;
  const uName = `zt_mu_${run}`;
  const aName = `zt_ma_${run}`;
  const sb = () => createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let totpSecret = "";
  let lastUsed = "";
  const code = () => new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(totpSecret), digits: 6, period: 30 }).generate();
  const freshCode = async () => {
    for (let i = 0; i < 70 && code() === lastUsed; i++) await new Promise((r) => setTimeout(r, 500));
    lastUsed = code();
    return lastUsed;
  };
  const browsers: Record<string, Browser> = {};
  const states: Record<string, { user: Awaited<ReturnType<BrowserContext["storageState"]>>; admin: Awaited<ReturnType<BrowserContext["storageState"]>> }> = {};
  let depositId = "";
  let ticketId = "";

  beforeAll(async () => {
    const ref = env.SUPABASE_DEV_PROJECT_REF;
    if (!ref || new URL(url).hostname !== `${ref}.supabase.co`) throw new Error("Refusing to run: SUPABASE_DEV_PROJECT_REF does not match NEXT_PUBLIC_SUPABASE_URL.");
    await cleanupOrFail({ marker: MARKER });
    const db = sb();
    const mk = async (n: string) => {
      const { data, error } = await db.auth.admin.createUser({ email: `${n}@jagoansosmed-test.invalid`, password, email_confirm: true, user_metadata: { username: n } });
      if (error || !data.user) throw new Error(error?.message);
      return data.user.id;
    };
    const uid = await mk(uName);
    const aid = await mk(aName);
    await db.from("profiles").update({ role: "admin" }).eq("id", aid);
    const c = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    await c.auth.signInWithPassword({ email: `${aName}@jagoansosmed-test.invalid`, password });
    const enrol = await c.auth.mfa.enroll({ factorType: "totp", issuer: "JagoanSosmed" });
    totpSecret = enrol.data!.totp.secret;
    expect((await c.auth.mfa.challengeAndVerify({ factorId: enrol.data!.id, code: await freshCode() })).error).toBeNull();
    const dep = await db.from("deposits").insert({
      user_id: uid, gateway: "paymenku", method: "BCA Virtual Account", channel_code: "bca_va", amount: 100_000, pay_amount: 100_000, status: "menunggu", gateway_status: "pending", is_sandbox: true,
      expires_at: new Date(Date.now() + 3_600_000).toISOString(), external_id: `zt-${run}-1`, payment_info: { bank: "BCA", va_number: "8277012345678901" },
    }).select("id").single();
    depositId = dep.data!.id;
    const t = await db.from("tickets").insert({ user_id: uid, title: `Tiket uji tampilan seluler ${run}`, category: "pesanan", status: "menunggu" }).select("id").single();
    ticketId = t.data!.id;
    await db.from("ticket_messages").insert({ ticket_id: ticketId, sender: "user", sender_id: uid, body: "Halo, ini pesan uji." });

    // log in once per engine; every device reuses the cookies
    for (const engine of ["webkit", "chromium"] as const) {
      const browser = await (engine === "webkit" ? webkit : chromium).launch();
      browsers[engine] = browser;
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, baseURL: BASE });
      const page = await ctx.newPage();
      await page.goto("/login");
      await page.waitForLoadState("networkidle").catch(() => {});
      // WebKit can fill before React has hydrated (the value is then wiped): retry until the form really holds it
      for (let attempt = 0; attempt < 4; attempt++) {
        await page.waitForTimeout(800);
        await page.getByPlaceholder("nama_pengguna").fill(uName);
        await page.getByPlaceholder("Minimal 8 karakter").fill(password);
        await page.waitForTimeout(200);
        await page.getByRole("button", { name: "Masuk", exact: true }).click();
        if (await page.waitForURL("**/dashboard", { timeout: 12_000 }).then(() => true, () => false)) break;
        if (attempt === 3) throw new Error("login failed after 4 attempts");
        await page.reload();
        await page.waitForLoadState("networkidle").catch(() => {});
      }
      const user = await ctx.storageState();
      await ctx.clearCookies();
      await page.goto("/admin/login");
      await page.waitForLoadState("networkidle").catch(() => {});
      for (let attempt = 0; attempt < 4; attempt++) {
        await page.waitForTimeout(800);
        await page.getByPlaceholder("nama_admin").fill(aName);
        await page.getByPlaceholder("Password admin").fill(password);
        await page.waitForTimeout(200);
        await page.locator("form button[type=submit]").click();
        if (await page.getByPlaceholder("000000").waitFor({ timeout: 12_000 }).then(() => true, () => false)) break;
        if (attempt === 3) throw new Error("admin login failed after 4 attempts");
        await page.reload();
        await page.waitForLoadState("networkidle").catch(() => {});
      }
      await page.getByPlaceholder("000000").fill(await freshCode());
      await page.locator("form button[type=submit]").click();
      await page.waitForURL((u) => u.pathname === "/admin", { timeout: 40_000 });
      states[engine] = { user, admin: await ctx.storageState() };
      await ctx.close();
    }
  }, 300_000);

  afterAll(async () => {
    for (const b of Object.values(browsers)) await b.close();
    await cleanupOrFail({ marker: MARKER });
  }, 300_000);

  const pages: { name: string; where: Where; path: () => string }[] = [
    { name: "login", where: "public", path: () => "/login" },
    { name: "signup", where: "public", path: () => "/signup" },
    { name: "Order Baru", where: "user", path: () => "/dashboard" },
    { name: "Tambah Saldo", where: "user", path: () => "/dashboard/add-funds" },
    { name: "halaman pembayaran", where: "user", path: () => `/deposit/${depositId}` },
    { name: "Tiket (daftar)", where: "user", path: () => "/dashboard/tickets" },
    { name: "Tiket (percakapan)", where: "user", path: () => `/dashboard/tickets/${ticketId}` },
    { name: "admin Pesanan", where: "admin", path: () => "/admin/orders" },
    { name: "admin Layanan", where: "admin", path: () => "/admin/services" },
    { name: "admin Pengaturan Pembayaran", where: "admin", path: () => "/admin/settings/payments" },
  ];

  for (const cfg of CONFIGS) {
    it(`${cfg.engine} ${cfg.name}: ${pages.length} pages`, async () => {
      const ctx = await browsers[cfg.engine].newContext({ viewport: { width: cfg.w, height: cfg.h }, deviceScaleFactor: cfg.dpr, isMobile: true, hasTouch: true, userAgent: cfg.ua, baseURL: BASE });
      const problems: string[] = [];
      try {
        for (const where of ["public", "user", "admin"] as const) {
          const scoped = await browsers[cfg.engine].newContext({
            viewport: { width: cfg.w, height: cfg.h }, deviceScaleFactor: cfg.dpr, isMobile: true, hasTouch: true, userAgent: cfg.ua, baseURL: BASE,
            ...(where === "user" ? { storageState: states[cfg.engine].user } : where === "admin" ? { storageState: states[cfg.engine].admin } : {}),
          });
          for (const p of pages.filter((x) => x.where === where)) {
            const page = await scoped.newPage();
            await page.goto(p.path(), { waitUntil: "load", timeout: 40_000 });
            await page.waitForLoadState("networkidle", { timeout: 2000 }).catch(() => {});
            await page.waitForTimeout(300);
            const f = await page.evaluate(auditInPage, {});
            if (f.doc.overflow) problems.push(`${p.name}: scrolls sideways (${f.doc.scrollWidth} > ${f.doc.clientWidth}) ${f.doc.offenders.slice(0, 3).join(" | ")}`);
            if (f.inputs.length) problems.push(`${p.name}: field under 16px: ${f.inputs.slice(0, 3).join(" | ")}`);
            if (!/width=device-width/.test(f.viewport) || /maximum-scale|user-scalable/.test(f.viewport)) problems.push(`${p.name}: bad viewport meta "${f.viewport}"`);
            await page.close();
          }
          await scoped.close();
        }
      } finally {
        await ctx.close();
      }
      expect(problems, problems.join("\n")).toEqual([]);
    }, 240_000);
  }
});
