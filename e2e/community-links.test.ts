/**
 * Community links in a real browser against `next start` and the linked DEV Supabase project: an admin sets the WhatsApp channel, the
 * Telegram channel and the Telegram bot in Pengaturan Situs; the user sidebar group "Tautan lainnya" and the footers show them with the
 * right href / target / rel; clearing a URL removes it (and the whole group when none is left); a malicious URL is rejected with an
 * Indonesian message and never saved. The site settings are restored afterwards.
 * Refuses to run unless the Supabase URL matches SUPABASE_DEV_PROJECT_REF.
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

describe.skipIf(!enabled)("community links: admin-controlled sidebar and footers", () => {
  const run = Math.random().toString(36).slice(2, 7);
  const password = `Com-${run}-Pass12`;
  const uName = `zt_cu_${run}`;
  const aName = `zt_ca_${run}`;
  const WA = `https://whatsapp.com/channel/zt${run}`;
  const TG = `https://t.me/zt${run}`;
  const BOT = `https://t.me/zt${run}_bot`;
  const email = (n: string) => `${n}@jagoansosmed-test.invalid`;
  let browser: Browser;
  let user: Page;
  let admin: Page;
  let totpSecret = "";
  let original: Record<string, unknown> = {};
  const id: Record<string, string> = {};
  const sb = () => createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const code = () => new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(totpSecret), digits: 6, period: 30 }).generate();
  let lastUsed = "";
  const freshCode = async () => {
    for (let i = 0; i < 70 && code() === lastUsed; i++) await new Promise((r) => setTimeout(r, 500));
    lastUsed = code();
    return lastUsed;
  };
  const stored = async () => ((await sb().from("site_settings").select("data").single()).data!.data as { community?: Record<string, string> }).community ?? {};

  /** Fill the three fields in Pengaturan Situs and press the save button. */
  async function setLinks(values: { wa?: string; tg?: string; bot?: string }) {
    await admin.goto("/admin/settings");
    const form = admin.getByTestId("community-links-form");
    await form.waitFor({ timeout: 40_000 });
    await form.getByLabel("URL Saluran WhatsApp").fill(values.wa ?? "");
    await form.getByLabel("URL Saluran Telegram").fill(values.tg ?? "");
    await form.getByLabel("URL Bot Telegram").fill(values.bot ?? "");
    await form.getByRole("button", { name: "Simpan tautan" }).click();
  }

  /** The sidebar group on the user side, polled until it matches (the read is cached for at most a minute and dropped on save). */
  async function sidebarLinks(): Promise<{ label: string; href: string | null; target: string | null; rel: string | null }[]> {
    await user.goto("/dashboard");
    await user.locator('nav[aria-label="Pengaturan"]').first().waitFor({ timeout: 40_000 });
    return user.locator('nav[aria-label="Tautan lainnya"] a').evaluateAll((els) =>
      els.map((e) => ({ label: (e.textContent ?? "").replace(/\(tab baru\)/, "").trim(), href: e.getAttribute("href"), target: e.getAttribute("target"), rel: e.getAttribute("rel") }))
    );
  }
  async function waitSidebar(expected: number) {
    await expect.poll(async () => (await sidebarLinks()).length, { timeout: 90_000, interval: 2000 }).toBe(expected);
  }
  const footerLinks = async (page: Page) =>
    page.locator('[data-testid="footer-community"]').evaluateAll((els) => els.map((e) => ({ label: (e.textContent ?? "").trim(), href: e.getAttribute("href"), target: e.getAttribute("target"), rel: e.getAttribute("rel") })));

  beforeAll(async () => {
    const ref = env.SUPABASE_DEV_PROJECT_REF;
    if (!ref || !url.includes(ref)) throw new Error("Refusing to run: SUPABASE_DEV_PROJECT_REF does not match NEXT_PUBLIC_SUPABASE_URL.");
    const db = sb();
    original = (((await db.from("site_settings").select("data").maybeSingle()).data?.data ?? {}) as Record<string, unknown>);
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
    browser = await chromium.launch();
    const uctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 } });
    user = await uctx.newPage();
    await user.goto("/login");
    await user.getByPlaceholder("nama_pengguna").fill(uName);
    await user.getByPlaceholder("Minimal 8 karakter").fill(password);
    await user.getByRole("button", { name: "Masuk", exact: true }).click();
    await user.waitForURL("**/dashboard", { timeout: 30_000 });
    const actx = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 } });
    admin = await actx.newPage();
    await admin.goto("/admin/login");
    await admin.getByPlaceholder("nama_admin").fill(aName);
    await admin.getByPlaceholder("Password admin").fill(password);
    await admin.locator("form button[type=submit]").click();
    await admin.getByPlaceholder("000000").waitFor({ timeout: 30_000 });
    await admin.getByPlaceholder("000000").fill(await freshCode());
    await admin.locator("form button[type=submit]").click();
    await admin.waitForURL((u) => u.pathname === "/admin", { timeout: 30_000 });
  }, 200_000);

  afterAll(async () => {
    await browser?.close();
    await sb().from("site_settings").upsert({ id: true, data: original as never }); // the site settings are put back exactly as they were
    const r = spawnSync("npx", ["supabase", "db", "query", "--remote", "--file", "scripts/db-cleanup-test-data.sql", "--yes"], { encoding: "utf8", shell: process.platform === "win32" });
    if (r.status !== 0) console.error("CLEANUP FAILED:", `${r.stdout}${r.stderr}`.slice(-1200));
  }, 120_000);

  it("nothing is shown while no link is set: no group, no '#' links, no 'Aplikasi Mobile'", async () => {
    await setLinks({}); // all empty
    // (when nothing was set before there is nothing to save; otherwise the save clears the links)
    await expect.poll(async () => Object.values(await stored()).filter(Boolean), { timeout: 30_000 }).toEqual([]);
    await waitSidebar(0);
    expect(await user.locator('nav[aria-label="Tautan lainnya"]').count()).toBe(0);
    expect(await user.locator('aside a[href="#"], nav a[href="#"]').count()).toBe(0);
    expect(await user.getByText("Aplikasi Mobile").count()).toBe(0);
    expect(await footerLinks(user)).toEqual([]);
  }, 240_000);

  it("setting the three URLs shows them in the sidebar and the dashboard footer with the right href, target and rel", async () => {
    await setLinks({ wa: WA, tg: TG, bot: BOT });
    await expect.poll(stored, { timeout: 30_000 }).toEqual({ whatsappChannel: WA, telegramChannel: TG, telegramBot: BOT });
    await waitSidebar(3);
    const links = await sidebarLinks();
    expect(links).toEqual([
      { label: "Saluran WhatsApp", href: WA, target: "_blank", rel: "noopener noreferrer" },
      { label: "Saluran Telegram", href: TG, target: "_blank", rel: "noopener noreferrer" },
      { label: "Bot Telegram", href: BOT, target: "_blank", rel: "noopener noreferrer" },
    ]);
    // the group sits between the main menu and Pengaturan, like the old design
    const order = await user.locator("nav[aria-label]").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
    const group = order.indexOf("Tautan lainnya");
    expect(group).toBeGreaterThan(0);
    expect(order[group + 1]).toBe("Pengaturan");
    expect(await user.locator('aside a[href="#"], nav a[href="#"]').count()).toBe(0);
    expect(await user.getByText("Aplikasi Mobile").count()).toBe(0);
    // dashboard footer
    expect(await footerLinks(user)).toEqual(links.map((l) => ({ ...l })));
    // the audit log keeps the old and the new value
    const audit = (await sb().from("audit_logs").select("admin_id,before,after").eq("action", "settings.community").eq("admin_id", id.a).order("created_at", { ascending: false }).limit(1)).data ?? [];
    expect(audit[0]).toMatchObject({ before: { whatsappChannel: "", telegramChannel: "", telegramBot: "" }, after: { whatsappChannel: WA, telegramChannel: TG, telegramBot: BOT } });
  }, 240_000);

  it("the landing footer and a legal page show them too (public, no login)", async () => {
    const anon = await browser.newContext({ baseURL: BASE });
    const page = await anon.newPage();
    await expect
      .poll(async () => { await page.goto("/"); return (await footerLinks(page)).length; }, { timeout: 120_000, interval: 4000 })
      .toBe(3);
    expect(await footerLinks(page)).toEqual([
      { label: "Saluran WhatsApp", href: WA, target: "_blank", rel: "noopener noreferrer" },
      { label: "Saluran Telegram", href: TG, target: "_blank", rel: "noopener noreferrer" },
      { label: "Bot Telegram", href: BOT, target: "_blank", rel: "noopener noreferrer" },
    ]);
    expect(await page.locator('footer a[href="#"]').count()).toBe(0);
    await page.goto("/syarat-ketentuan");
    expect((await footerLinks(page)).map((l) => l.href)).toEqual([WA, TG, BOT]);
    await anon.close();
  }, 300_000);

  it("clearing one URL removes just that link; clearing all removes the group", async () => {
    await setLinks({ wa: "", tg: TG, bot: BOT });
    await expect.poll(async () => (await stored()).whatsappChannel, { timeout: 30_000 }).toBe("");
    await waitSidebar(2);
    expect((await sidebarLinks()).map((l) => l.label)).toEqual(["Saluran Telegram", "Bot Telegram"]);
    expect((await footerLinks(user)).map((l) => l.label)).toEqual(["Saluran Telegram", "Bot Telegram"]);
    await setLinks({});
    await waitSidebar(0);
    expect(await user.locator('nav[aria-label="Tautan lainnya"]').count()).toBe(0);
    expect(await footerLinks(user)).toEqual([]);
  }, 300_000);

  it("a malicious URL is rejected with an Indonesian message and is not saved", async () => {
    await setLinks({ wa: WA, tg: TG, bot: BOT });
    await expect.poll(async () => (await stored()).telegramBot, { timeout: 30_000 }).toBe(BOT);
    const attempts: [string, string, string][] = [
      ["bot", "javascript:alert(1)", "URL Bot Telegram: Tautan harus memakai https://."],
      ["bot", "https://t.me@evil.com/x", "URL Bot Telegram: Tautan tidak boleh berisi nama pengguna atau password."],
      ["tg", "https://t.me.evil.com/x", "URL Saluran Telegram: Alamat harus berasal dari t.me atau telegram.me."],
      ["wa", "http://wa.me/c", "URL Saluran WhatsApp: Tautan harus memakai https://."],
      ["wa", "https://t.me/abc", "URL Saluran WhatsApp: Alamat harus berasal dari wa.me, whatsapp.com atau chat.whatsapp.com."],
    ];
    for (const [field, value, message] of attempts) {
      await admin.goto("/admin/settings");
      const form = admin.getByTestId("community-links-form");
      await form.waitFor({ timeout: 40_000 });
      const label = field === "wa" ? "URL Saluran WhatsApp" : field === "tg" ? "URL Saluran Telegram" : "URL Bot Telegram";
      await form.getByLabel(label).fill(value);
      await form.getByRole("button", { name: "Simpan tautan" }).click();
      await admin.getByTestId("community-links-error").waitFor({ timeout: 20_000 });
      expect((await admin.getByTestId("community-links-error").innerText()).trim()).toBe(message);
      expect(await stored()).toEqual({ whatsappChannel: WA, telegramChannel: TG, telegramBot: BOT }); // unchanged
    }
    // a rejected attempt is not in the audit log as a change
    const changes = (await sb().from("audit_logs").select("after").eq("action", "settings.community").eq("admin_id", id.a)).data ?? [];
    for (const c of changes) {
      const after = c.after as Record<string, string>;
      for (const v of Object.values(after)) expect(v).not.toMatch(/evil|javascript|http:/);
    }
    // the user side still only shows the valid, stored links
    await waitSidebar(3);
    expect((await sidebarLinks()).map((l) => l.href)).toEqual([WA, TG, BOT]);
  }, 400_000);
});
