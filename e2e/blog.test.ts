/**
 * Blog in a real browser against `next start` (PROVIDER_MODE=mock) and the linked DEV Supabase project: the admin writes a post (slug from the title,
 * Markdown preview, cover upload), saves a draft (public 404), publishes (public page, SEO tags, RSS, sitemap), schedules, unpublishes (404 again)
 * and deletes; XSS payloads in the article stay text. Refuses to run unless the Supabase URL is the DEV project.
 */
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import * as OTPAuth from "otpauth";
import { chromium, type Browser, type Page } from "playwright";
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
const anonKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");

describe.skipIf(!enabled)("blog: admin writes, public reads", () => {
  const MARKER = "bl";
  const run = MARKER + Math.random().toString(36).slice(2, 7);
  const password = `Blog-${run}-Pass12`;
  const aName = `zt_bl_${run}`;
  const email = `${aName}@jagoansosmed-test.invalid`;
  const TITLE = `ZT Panduan Order ${run}`;
  const SLUG = `zt-${run}-panduan`;
  const XSS = '<script>window.__pwned=1</script> <img src=x onerror="window.__pwned=2"> [klik](javascript:window.__pwned=3)';
  let browser: Browser;
  let admin: Page;
  let anon: Page;
  let adminId = "";
  let totpSecret = "";
  let coverName = "";
  const sb = () => createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const code = () => new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(totpSecret), digits: 6, period: 30 }).generate();
  let lastUsed = "";
  const freshCode = async () => {
    for (let i = 0; i < 70 && code() === lastUsed; i++) await new Promise((r) => setTimeout(r, 500));
    lastUsed = code();
    return lastUsed;
  };
  const row = async () => (await sb().from("blog_posts").select("id,status,published_at,slug,title").eq("slug", SLUG).maybeSingle()).data;
  const logs = async () => ((await sb().from("audit_logs").select("action").eq("admin_id", adminId).like("action", "blog.%").order("created_at")).data ?? []).map((l) => l.action);
  const status = async (path: string) => (await fetch(`${BASE}${path}`, { redirect: "manual" })).status;
  const toast = async (text: string) => expect.poll(async () => admin.locator("body").innerText(), { timeout: 20_000 }).toContain(text);

  beforeAll(async () => {
    const ref = env.SUPABASE_DEV_PROJECT_REF;
    if (!ref || new URL(url).hostname !== `${ref}.supabase.co`) throw new Error("Refusing to run: SUPABASE_DEV_PROJECT_REF does not match NEXT_PUBLIC_SUPABASE_URL.");
    await cleanupOrFail({ marker: MARKER });
    const db = sb();
    const created = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username: aName } });
    adminId = created.data.user!.id;
    await db.from("profiles").update({ role: "admin" }).eq("id", adminId);
    const c = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    await c.auth.signInWithPassword({ email, password });
    const enrol = await c.auth.mfa.enroll({ factorType: "totp", issuer: "JagoanSosmed" });
    totpSecret = enrol.data!.totp.secret;
    expect((await c.auth.mfa.challengeAndVerify({ factorId: enrol.data!.id, code: await freshCode() })).error).toBeNull();
    browser = await chromium.launch();
    anon = await (await browser.newContext({ baseURL: BASE })).newPage();
    admin = await (await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 } })).newPage();
    await admin.goto("/admin/login");
    await admin.waitForLoadState("networkidle").catch(() => {});
    await admin.getByPlaceholder("nama_admin").fill(aName);
    await admin.getByPlaceholder("Password admin").fill(password);
    await admin.locator("form button[type=submit]").click();
    await admin.getByPlaceholder("000000").waitFor({ timeout: 30_000 });
    await admin.getByPlaceholder("000000").fill(await freshCode());
    await admin.locator("form button[type=submit]").click();
    await admin.waitForURL((u) => u.pathname === "/admin", { timeout: 30_000 });
  }, 240_000);

  afterAll(async () => {
    await browser?.close();
    if (coverName) await sb().storage.from("blog-images").remove([coverName]); // uploaded through the editor: random name, removed by name
    await cleanupOrFail({ marker: MARKER });
  }, 300_000);

  it("the sidebar has Blog and the page is admin-only (anonymous visitors are sent away)", async () => {
    await admin.goto("/admin/blog");
    await admin.getByRole("link", { name: "Blog", exact: true }).first().waitFor({ timeout: 30_000 });
    await expect.poll(async () => admin.locator("body").innerText(), { timeout: 30_000 }).toContain("Tulis artikel");
    const res = await anon.goto("/admin/blog");
    expect(anon.url()).not.toContain("/admin/blog");
    expect([200, 404]).toContain(res?.status() ?? 0);
    expect(await anon.locator("body").innerText()).not.toContain("Tulis artikel");
  }, 120_000);

  it("editor: the slug follows the title, the preview renders Markdown safely, a cover uploads", async () => {
    await admin.goto("/admin/blog/new");
    await admin.waitForLoadState("networkidle").catch(() => {});
    await admin.getByLabel("Judul", { exact: true }).fill(TITLE);
    const slugBox = admin.getByLabel("Slug (alamat artikel)");
    expect(await slugBox.inputValue()).toBe(`zt-panduan-order-${run}`);
    await slugBox.fill(SLUG);
    await admin.getByRole("textbox", { name: "Ringkasan", exact: true }).fill("Ringkasan artikel uji.");
    await admin.getByLabel("Isi artikel", { exact: true }).fill(`## Bagian satu\n\nIsi **tebal** dan [tautan luar](https://example.com).\n\n${XSS}\n`);
    await admin.getByRole("radio", { name: "Pratinjau" }).click();
    const preview = admin.getByTestId("blog-preview");
    await preview.waitFor();
    expect(await preview.locator("h2").innerText()).toBe("Bagian satu");
    expect(await preview.locator("strong").innerText()).toBe("tebal");
    expect(await preview.innerText()).toContain("<script>window.__pwned=1</script>"); // text, not a script
    expect(await preview.locator("script, img[src='x'], a[href^='javascript']").count()).toBe(0);
    expect(await admin.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
    await admin.getByRole("radio", { name: "Tulis" }).click();
    await admin.getByLabel("Unggah gambar sampul").setInputFiles({ name: "sampul.png", mimeType: "image/png", buffer: PNG });
    await admin.locator("img[alt='Sampul']").waitFor({ timeout: 30_000 });
    const src = await admin.locator("img[alt='Sampul']").getAttribute("src");
    expect(src).toContain("/storage/v1/object/public/blog-images/");
    coverName = decodeURIComponent(src!.split("/blog-images/")[1]);
    expect(coverName).toMatch(/^[0-9a-f-]{36}\.png$/); // random name
    await admin.getByLabel("Teks alternatif sampul").fill("Gambar sampul uji");
    await admin.getByLabel("Judul SEO", { exact: true }).fill("Judul SEO uji");
    await admin.getByLabel("Deskripsi meta", { exact: true }).fill("Deskripsi meta uji untuk artikel.");
    await admin.getByLabel("Atau buat kategori baru").fill(`zt-${run} kategori`);
    await admin.getByLabel("Tag", { exact: true }).fill(`zt-${run} uji, zt-${run} panduan`);
  }, 180_000);

  it("draft: saved, hidden from the public (404 for the page, absent from the list and the RSS)", async () => {
    await admin.getByRole("button", { name: "Simpan draf" }).click();
    await admin.waitForURL(/\/admin\/blog\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    expect(await row()).toMatchObject({ status: "draf", slug: SLUG });
    expect(await status(`/blog/${SLUG}`)).toBe(404);
    expect(await (await fetch(`${BASE}/blog/rss.xml`)).text()).not.toContain(SLUG);
    expect(await logs()).toEqual(["blog.create"]);
  }, 120_000);

  it("a duplicate slug is refused with a clear message", async () => {
    await admin.goto("/admin/blog/new");
    await admin.waitForLoadState("networkidle").catch(() => {});
    await admin.getByLabel("Judul", { exact: true }).fill(`ZT Kembar ${run}`);
    await admin.getByLabel("Slug (alamat artikel)").fill(SLUG);
    await admin.getByLabel("Isi artikel", { exact: true }).fill("isi");
    await admin.getByRole("button", { name: "Simpan draf" }).click();
    await expect.poll(async () => admin.getByTestId("blog-error").innerText(), { timeout: 20_000 }).toContain("sudah dipakai");
  }, 90_000);

  it("publish: the public page, its SEO tags, the list, the RSS feed and the sitemap", async () => {
    await admin.goto("/admin/blog");
    const tr = admin.locator("table").getByRole("row", { name: new RegExp(TITLE) });
    await tr.getByRole("button", { name: /Terbitkan/ }).click();
    await expect.poll(async () => (await row())?.status, { timeout: 30_000 }).toBe("terbit");
    await expect.poll(async () => status(`/blog/${SLUG}`), { timeout: 30_000 }).toBe(200);

    let dialogs = 0;
    anon.on("dialog", async (d) => {
      dialogs++;
      await d.dismiss();
    });
    await anon.goto(`/blog/${SLUG}`);
    await anon.waitForLoadState("networkidle").catch(() => {});
    expect(await anon.locator("h1").innerText()).toBe(TITLE);
    expect(await anon.locator("article").innerText()).toContain("<script>window.__pwned=1</script>"); // shown as text
    expect(await anon.locator("article script, article iframe, article a[href^='javascript']").count()).toBe(0);
    expect(await anon.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
    expect(dialogs).toBe(0);
    const ext = anon.locator("article a", { hasText: "tautan luar" });
    expect(await ext.getAttribute("rel")).toBe("nofollow noopener noreferrer");
    expect(await anon.locator('link[rel="canonical"]').getAttribute("href")).toBe(`${env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/blog/${SLUG}`);
    expect(await anon.title()).toContain("Judul SEO uji");
    expect(await anon.locator('meta[name="description"]').getAttribute("content")).toBe("Deskripsi meta uji untuk artikel.");
    expect(await anon.locator('meta[property="og:image"]').getAttribute("content")).toContain("/blog-images/");
    expect(await anon.locator('meta[property="og:type"]').getAttribute("content")).toBe("article");
    expect(await anon.locator('meta[name="twitter:card"]').getAttribute("content")).toBe("summary_large_image");
    const ld = JSON.parse((await anon.locator('script[type="application/ld+json"]').first().textContent()) ?? "{}");
    expect(ld).toMatchObject({ "@type": "Article", headline: TITLE });
    expect(await anon.getByRole("link", { name: "Daftar dan mulai order" }).getAttribute("href")).toBe("/signup");
    expect(await anon.locator("body").innerText()).toMatch(/menit baca/);

    await anon.goto("/blog");
    await expect.poll(async () => anon.locator("body").innerText(), { timeout: 20_000 }).toContain(TITLE);
    expect(await (await fetch(`${BASE}/blog/rss.xml`)).text()).toContain(`/blog/${SLUG}`);
    expect(await (await fetch(`${BASE}/sitemap.xml`)).text()).toContain(`/blog/${SLUG}`);
    expect(await logs()).toEqual(["blog.create", "blog.publish"]);
  }, 180_000);

  it("unpublish: the page answers 404 again and leaves the list, the RSS and the sitemap", async () => {
    await admin.goto("/admin/blog");
    const tr = admin.locator("table").getByRole("row", { name: new RegExp(TITLE) });
    await tr.getByRole("button", { name: /Tarik/ }).click();
    await expect.poll(async () => (await row())?.status, { timeout: 30_000 }).toBe("draf");
    await expect.poll(async () => status(`/blog/${SLUG}`), { timeout: 30_000 }).toBe(404);
    expect(await (await fetch(`${BASE}/blog/rss.xml`)).text()).not.toContain(SLUG);
    expect(await (await fetch(`${BASE}/sitemap.xml`)).text()).not.toContain(SLUG);
    expect(await logs()).toEqual(["blog.create", "blog.publish", "blog.unpublish"]);
  }, 120_000);

  it("scheduling: a future date makes it 'Terjadwal' and still hidden; delete removes it for good", async () => {
    const id = (await row())!.id;
    await admin.goto(`/admin/blog/${id}`);
    await admin.waitForLoadState("networkidle").catch(() => {});
    await admin.getByLabel("Tanggal terbit").fill("2031-05-01T10:00");
    await admin.getByRole("button", { name: "Jadwalkan" }).click();
    await expect.poll(async () => (await row())?.status, { timeout: 30_000 }).toBe("terbit");
    expect(new Date((await row())!.published_at!).getUTCFullYear()).toBe(2031);
    expect(await status(`/blog/${SLUG}`)).toBe(404); // not yet
    await admin.goto("/admin/blog");
    await expect.poll(async () => admin.locator("table").getByRole("row", { name: new RegExp(TITLE) }).innerText(), { timeout: 20_000 }).toContain("Terjadwal");

    await admin.locator("table").getByRole("row", { name: new RegExp(TITLE) }).getByRole("button", { name: /Hapus artikel/ }).click();
    const dialog = admin.getByRole("dialog");
    await dialog.waitFor();
    expect(await dialog.innerText()).toContain("dihapus permanen");
    await dialog.getByRole("button", { name: "Hapus", exact: true }).click();
    await expect.poll(async () => row(), { timeout: 30_000 }).toBeNull();
    expect(await status(`/blog/${SLUG}`)).toBe(404);
    expect((await logs()).at(-1)).toBe("blog.delete");
  }, 180_000);

  it("/status is gone: a permanent redirect to the home page", async () => {
    const res = await fetch(`${BASE}/status`, { redirect: "manual" });
    expect(res.status).toBe(308);
    expect(new URL(res.headers.get("location") ?? "", BASE).pathname).toBe("/");
  });
});
