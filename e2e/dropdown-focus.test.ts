/**
 * Searchable dropdowns on the Order Baru form: on touch devices the search field must NOT take focus when the list opens (it would raise the on-screen
 * keyboard over the list); on desktop it keeps the auto-focus. Also: every category row has an icon (WhatsApp is seeded under the catch-all platform and
 * gets its own chip), and the list stays inside the screen. WebKit + Chromium. Refuses to run unless the Supabase URL is the DEV project.
 */
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { chromium, webkit, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupOrFail } from "../scripts/lib/test-cleanup.mjs";

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

const UA_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const UA_ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
const CONFIGS = [
  { engine: "webkit", name: "iPhone (touch 390x844)", w: 390, h: 844, touch: true, ua: UA_IPHONE },
  { engine: "chromium", name: "Android (touch 390x844)", w: 390, h: 844, touch: true, ua: UA_ANDROID },
  { engine: "webkit", name: "desktop (1440x900)", w: 1440, h: 900, touch: false, ua: undefined },
  { engine: "chromium", name: "desktop (1440x900)", w: 1440, h: 900, touch: false, ua: undefined },
] as const;

describe.skipIf(!enabled)("searchable dropdowns: focus on desktop only, icons on every category", () => {
  const MARKER = "dz";
  const run = MARKER + Math.random().toString(36).slice(2, 7);
  const password = `Dfo-${run}-Pass12`;
  const uName = `zt_df_${run}`;
  const sb = () => createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const browsers: Record<string, Browser> = {};

  beforeAll(async () => {
    const ref = env.SUPABASE_DEV_PROJECT_REF;
    if (!ref || new URL(url).hostname !== `${ref}.supabase.co`) throw new Error("Refusing to run: SUPABASE_DEV_PROJECT_REF does not match NEXT_PUBLIC_SUPABASE_URL.");
    await cleanupOrFail({ marker: MARKER });
    const db = sb();
    const made = await db.auth.admin.createUser({ email: `${uName}@jagoansosmed-test.invalid`, password, email_confirm: true, user_metadata: { username: uName } });
    if (made.error) throw new Error(made.error.message);
    const prov = await db.from("providers").insert({ name: `ZT ${run}`, slug: `zt-${run}`, mode: "mock", active: true }).select("id").single();
    expect(prov.error).toBeNull();
    // stored under the catch-all platform on purpose: the app must still give it the WhatsApp icon and its own chip
    expect((await db.from("service_categories").insert({ id: `zt-cat-${run}-wa`, label: "WhatsApp Channel Members", platform: "lainnya" })).error).toBeNull();
    expect((await db.from("services").insert({ id: `ZT-${run.toUpperCase()}W`, provider_id: prov.data!.id, provider_service_id: `${run}7001`, category_id: `zt-cat-${run}-wa`, name: "WhatsApp Channel Members | Real", platform: "lainnya", min: 100, max: 100000, active: true, imported: true, provider_price: 1000, price_per_1000: 2000 })).error).toBeNull();
    browsers.webkit = await webkit.launch();
    browsers.chromium = await chromium.launch();
  }, 120_000);

  afterAll(async () => {
    for (const b of Object.values(browsers)) await b.close();
    await cleanupOrFail({ marker: MARKER });
  }, 120_000);

  async function login(page: Page) {
    await page.goto("/login");
    await page.waitForLoadState("networkidle").catch(() => {});
    // WebKit can fill before React has hydrated (the value is then wiped): retry until the form really holds it
    for (let attempt = 0; attempt < 4; attempt++) {
      await page.waitForTimeout(800);
      await page.getByPlaceholder("nama_pengguna").fill(uName);
      await page.getByPlaceholder("Minimal 8 karakter").fill(password);
      await page.waitForTimeout(200);
      await page.getByRole("button", { name: "Masuk", exact: true }).click();
      if (await page.waitForURL("**/dashboard", { timeout: 12_000 }).then(() => true, () => false)) return;
      if (attempt === 3) throw new Error("login failed after 4 attempts");
      await page.reload();
      await page.waitForLoadState("networkidle").catch(() => {});
    }
  }

  const searchFocused = (page: Page, label: string) => page.evaluate((l) => {
    const el = document.querySelector(`input[aria-label="${l}"]`);
    return Boolean(el) && document.activeElement === el;
  }, label);

  for (const cfg of CONFIGS) {
    it(`${cfg.engine} ${cfg.name}: search is ${cfg.touch ? "NOT " : ""}focused after opening; categories have icons`, async () => {
      const ctx = await browsers[cfg.engine].newContext({
        viewport: { width: cfg.w, height: cfg.h }, deviceScaleFactor: cfg.touch ? 3 : 1, isMobile: cfg.touch, hasTouch: cfg.touch, baseURL: BASE,
        ...(cfg.ua ? { userAgent: cfg.ua } : {}),
      });
      try {
        const page = await ctx.newPage();
        await login(page);
        await page.waitForLoadState("networkidle").catch(() => {});
        // the device really reports a coarse pointer (otherwise this test would prove nothing)
        expect(await page.evaluate(() => window.matchMedia("(pointer: coarse)").matches || window.matchMedia("(hover: none)").matches)).toBe(cfg.touch);

        // the data-driven chip: WhatsApp has an active service, so it has its own chip (with an icon)
        const chip = page.getByRole("tab", { name: "WhatsApp" });
        await expect.poll(async () => chip.count(), { timeout: 20_000 }).toBeGreaterThan(0);
        expect(await chip.locator("svg").count()).toBeGreaterThan(0);
        await chip.click();

        const trigger = page.getByRole("button", { name: /Kategori/ }).first();
        await trigger.scrollIntoViewIfNeeded();
        await trigger.click();
        const search = page.getByLabel("Cari Kategori");
        await search.waitFor({ timeout: 15_000 });
        await page.waitForTimeout(500); // past the open animation and any focus effect
        expect(await searchFocused(page, "Cari Kategori")).toBe(!cfg.touch);

        // the list is on screen, scrollable without the keyboard, and the search row stays at its top
        const list = page.getByRole("listbox", { name: "Kategori" });
        const box = await list.boundingBox();
        expect(box).toBeTruthy();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(cfg.w + 1);
        expect(await list.evaluate((el) => getComputedStyle(el).overflowY)).toMatch(/auto|scroll/);
        expect(await search.evaluate((el) => getComputedStyle(el.closest("li")!).position)).toBe("sticky");

        // every row has an icon
        const options = list.getByRole("option");
        const n = await options.count();
        expect(n).toBeGreaterThan(0);
        for (let i = 0; i < Math.min(n, 12); i++) expect(await options.nth(i).locator("svg").count(), `row ${i} has an icon`).toBeGreaterThan(0);
        expect(await list.innerText()).toContain("WhatsApp Channel Members");

        // the Layanan list behaves the same way
        await options.filter({ hasText: "WhatsApp Channel Members" }).first().click();
        const svcTrigger = page.getByRole("button", { name: /Layanan|Pilih layanan/ }).first();
        await expect.poll(async () => svcTrigger.isEnabled(), { timeout: 15_000 }).toBe(true);
        await svcTrigger.scrollIntoViewIfNeeded();
        await svcTrigger.click();
        await page.getByLabel("Cari Layanan").waitFor({ timeout: 15_000 });
        await page.waitForTimeout(500);
        expect(await searchFocused(page, "Cari Layanan")).toBe(!cfg.touch);
      } finally {
        await ctx.close();
      }
    }, 180_000);
  }
});
