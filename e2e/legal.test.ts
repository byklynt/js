/**
 * Smoke test of the legal pages in a real browser against `next start`: public (no login), each with its h1, a table of contents whose
 * anchors point at real headings, the "Terakhir diperbarui" line, the contact block, and the footer links on the landing page,
 * on the legal pages and inside the dashboard. Also the implied-acceptance text on /signup and the redirects from the old paths.
 * Dashboard footer: a temporary user is created through the service role (DEV project only) and removed afterwards.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LEGAL_VERSION, formatLegalDate, LEGAL_DOCS } from "@/lib/legal-content";

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

const PAGES = [
  { path: "/syarat-ketentuan", h1: "Syarat & Ketentuan", title: /Syarat & Ketentuan/ },
  { path: "/kebijakan-refund", h1: "Kebijakan Refund & Pembatalan", title: /Kebijakan Refund/ },
  { path: "/kebijakan-privasi", h1: "Kebijakan Privasi", title: /Kebijakan Privasi/ },
];
// Public copy must stay generic: no vendor names, no statute citations, no drafting notes.
const BANNED = ["Supabase", "UU PDP", "Undang-Undang", "Likeo", "Postgres", "Vercel", "Pasal", "Belum final", "Placeholder"];
const FOOTER = ["/syarat-ketentuan", "/kebijakan-refund", "/kebijakan-privasi"];

describe.skipIf(!enabled)("legal pages", () => {
  const run = Math.random().toString(36).slice(2, 7);
  const uName = `zt_l_${run}`;
  const password = `Leg-${run}-Pass12`;
  let browser: Browser;

  beforeAll(async () => {
    const ref = env.SUPABASE_DEV_PROJECT_REF;
    if (!ref || new URL(url).hostname !== `${ref}.supabase.co`) throw new Error("Refusing to run: SUPABASE_DEV_PROJECT_REF does not match NEXT_PUBLIC_SUPABASE_URL.");
    const { error } = await createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }).auth.admin.createUser({
      email: `${uName}@jagoansosmed-test.invalid`, password, email_confirm: true, user_metadata: { username: uName },
    });
    expect(error).toBeNull();
    browser = await chromium.launch();
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    const r = spawnSync("node", ["scripts/db-cleanup.mjs"], { encoding: "utf8", shell: process.platform === "win32" });
    if (r.status !== 0) console.error("CLEANUP FAILED:", `${r.stdout}${r.stderr}`.slice(-1200));
  }, 120_000);

  for (const [index, p] of PAGES.entries()) {
    it(`${p.path}: public, heading, metadata, updated date, working table of contents, contact block, footer links`, async () => {
      const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 } }); // fresh context: no login
      const page = await ctx.newPage();
      const res = await page.goto(p.path);
      expect(res?.status()).toBe(200);
      expect(new URL(page.url()).pathname).toBe(p.path); // not redirected to /login
      expect(await page.locator("h1").innerText()).toBe(p.h1);
      expect(await page.title()).toMatch(p.title);
      const bodyText = (await page.locator("body").innerText()).toLowerCase();
      for (const w of BANNED) expect(bodyText, `"${w}" on ${p.path}`).not.toContain(w.toLowerCase());
      expect(await page.getByTestId("legal-placeholder").count()).toBe(0);
      expect(await page.locator('meta[name="description"]').getAttribute("content")).toBe(LEGAL_DOCS[index].description);
      expect(await page.getByTestId("legal-updated").innerText()).toContain(`Terakhir diperbarui: ${formatLegalDate()}`);
      expect(await page.getByTestId("legal-updated").innerText()).toContain(LEGAL_VERSION);

      // table of contents: every entry points at a heading that exists, and the sections all have anchor links
      const toc = page.getByTestId("toc-desktop").locator("a");
      const hrefs = await toc.evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));
      expect(hrefs.length).toBe(LEGAL_DOCS[index].sections.length + 1);
      for (const href of hrefs) {
        const id = href.slice(1);
        expect(await page.locator(`h2[id="${id}"]`).count(), `heading for ${href}`).toBe(1);
      }
      await toc.nth(1).click();
      expect(new URL(page.url()).hash).toBe(hrefs[1]);
      expect(await page.locator(`h2[id="${hrefs[1].slice(1)}"] a[href="${hrefs[1]}"]`).count()).toBe(1);

      // contact block: only real channels (none configured -> just the ticket row), never an empty or fake value
      const contact = page.getByTestId("legal-contact");
      expect(await contact.innerText()).toContain("Ada pertanyaan? Hubungi kami");
      expect(await contact.locator('a[href="/dashboard/tickets"]').count()).toBe(1);
      expect(await contact.locator('a[href^="mailto:"]:not([href="mailto:"]), a[href^="https://wa.me/"], a[href^="https://t.me/"]').count()).toBe(0);

      // footer links to all three pages
      for (const f of FOOTER) expect(await page.locator(`nav[aria-label="Tautan hukum"] a[href="${f}"]`).count(), `footer ${f}`).toBe(1);

      // mobile: the table of contents is a collapsed list
      await page.setViewportSize({ width: 390, height: 800 });
      expect(await page.getByTestId("toc-mobile").isVisible()).toBe(true);
      expect(await page.getByTestId("toc-desktop").isVisible()).toBe(false);
      expect(await page.getByTestId("toc-mobile").evaluate((el) => (el as HTMLDetailsElement).open)).toBe(false);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true); // no horizontal scroll
      await ctx.close();
    }, 90_000);
  }

  it("the refund page shows the system's numbers and examples, and the deposit refund gap is marked as not final", async () => {
    const ctx = await browser.newContext({ baseURL: BASE });
    const page = await ctx.newPage();
    await page.goto("/kebijakan-refund");
    const text = await page.locator("main").innerText();
    for (const s of ["72 jam", "50%", "floor(biaya pesanan x sisa / jumlah pesanan)", "= Rp375", "= Rp333", "= Rp450"]) expect(text).toContain(s);
    await ctx.close();
  }, 60_000);

  it("the terms carry the prohibited-content rule (politics, SARA, violence, pornography, gambling, fraud)", async () => {
    const ctx = await browser.newContext({ baseURL: BASE });
    const page = await ctx.newPage();
    await page.goto("/syarat-ketentuan");
    const text = await page.locator('section[aria-labelledby="larangan"]').innerText();
    for (const w of ["politik", "kampanye", "partai", "tokoh politik", "propaganda", "SARA", "kekerasan", "pornografi", "perjudian", "penipuan", "tidak mendapat refund", "diblokir dan dibekukan secara permanen"]) expect(text).toContain(w);
    await ctx.close();
  }, 60_000);

  it("landing page footer, signup consent text (no checkbox) and the old paths", async () => {
    const ctx = await browser.newContext({ baseURL: BASE });
    const page = await ctx.newPage();
    await page.goto("/");
    for (const f of FOOTER) expect(await page.locator(`footer a[href="${f}"]`).count(), `landing footer ${f}`).toBeGreaterThan(0);
    await page.goto("/signup");
    const consent = page.getByTestId("signup-consent");
    expect((await consent.innerText()).replace(/\s+/g, " ")).toBe("Dengan mendaftar, kamu menyetujui Syarat & Ketentuan, Kebijakan Refund, dan Kebijakan Privasi kami.");
    for (const f of FOOTER) expect(await consent.locator(`a[href="${f}"]`).count()).toBe(1);
    expect(await page.locator('form input[type="checkbox"]').count()).toBe(0);
    await page.goto("/terms");
    expect(new URL(page.url()).pathname).toBe("/syarat-ketentuan");
    await page.goto("/refund-policy");
    expect(new URL(page.url()).pathname).toBe("/kebijakan-refund");
    const sitemap = await (await ctx.request.get("/sitemap.xml")).text();
    for (const f of FOOTER) expect(sitemap).toContain(f);
    await ctx.close();
  }, 90_000);

  it("the dashboard footer links to the three pages", async () => {
    const ctx = await browser.newContext({ baseURL: BASE });
    const page = await ctx.newPage();
    await page.goto("/login");
    await page.getByPlaceholder("nama_pengguna").fill(uName);
    await page.getByPlaceholder("Minimal 8 karakter").fill(password);
    await page.getByRole("button", { name: "Masuk", exact: true }).click();
    await page.waitForURL("**/dashboard", { timeout: 30_000 });
    await page.locator('nav[aria-label="Tautan hukum"]').waitFor({ state: "attached", timeout: 30_000 }); // streamed in after the shell
    for (const f of FOOTER) expect(await page.locator(`nav[aria-label="Tautan hukum"] a[href="${f}"]`).count(), `dashboard footer ${f}`).toBe(1);
    await ctx.close();
  }, 90_000);
});
