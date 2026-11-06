/**
 * Bulk activate / deactivate of services in a real browser against `next start` (PROVIDER_MODE=mock) and the linked DEV Supabase project:
 * row selection, "Pilih semua N hasil", the confirmation above 20 services, the idempotent second run, "Perlu dicek" skipped on activation,
 * the typed word for a scoped deactivation (cancelled: it would touch the real DEV catalogue), one audit row per action.
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

describe.skipIf(!enabled)("bulk activate / deactivate services", () => {
  const MARKER = "bs";
  const run = MARKER + Math.random().toString(36).slice(2, 7);
  const password = `Bulk-${run}-Pass12`;
  const aName = `zt_ba_${run}`;
  const TAG = `ZT Massal ${run}`; // in every fixture name: the search finds exactly the 26
  const sid = (n: number) => `ZT-${run.toUpperCase()}-${String(n).padStart(3, "0")}`;
  const FLAGGED = sid(26);
  const email = `${aName}@jagoansosmed-test.invalid`;
  let browser: Browser;
  let admin: Page;
  let adminId = "";
  let totpSecret = "";
  const sb = () => createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const code = () => new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(totpSecret), digits: 6, period: 30 }).generate();
  let lastUsed = "";
  const freshCode = async () => {
    for (let i = 0; i < 70 && code() === lastUsed; i++) await new Promise((r) => setTimeout(r, 500));
    lastUsed = code();
    return lastUsed;
  };
  const states = async () => Object.fromEntries(((await sb().from("services").select("id,active").like("id", `ZT-${run.toUpperCase()}-%`)).data ?? []).map((r) => [r.id, r.active as boolean]));
  const activeCount = async () => Object.values(await states()).filter(Boolean).length;
  const bulkLogs = async () => (await sb().from("audit_logs").select("id,after").eq("action", "service.bulk_active").eq("admin_id", adminId)).data ?? [];
  const bodyText = () => admin.locator("body").innerText();

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
    const prov = await db.from("providers").insert({ name: `ZT ${run}`, slug: `zt-${run}`, mode: "mock", active: true }).select("id").single();
    await db.from("service_categories").insert({ id: `zt-cat-${run}`, label: `ZT Kategori ${run}`, platform: "instagram" });
    const rows = Array.from({ length: 26 }, (_, i) => ({
      id: sid(i + 1), provider_id: prov.data!.id, provider_service_id: `p${run}${i}`, category_id: `zt-cat-${run}`, name: i === 25 ? "mm" : `${TAG} nomor ${i + 1}`, platform: "instagram",
      provider_price: 1000, price_per_1000: i === 25 ? 25_900_000 : 2000, min: 1, max: 1000, active: true, imported: true,
    }));
    // the flagged one must still be found by the search: its provider name carries the tag
    expect((await db.from("services").insert(rows.map((r) => ({ ...r, provider_name: `${TAG} provider` })))).error).toBeNull();
    browser = await chromium.launch();
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
    await admin.goto("/admin/services");
    await admin.waitForLoadState("networkidle").catch(() => {});
    await admin.getByLabel("Cari layanan berdasarkan ID atau nama").first().fill(TAG);
    await admin.locator(`table input[aria-label="Pilih layanan ${sid(1)}"]`).first().waitFor({ timeout: 30_000 });
    // let the debounced search (300 ms) and its request settle: a changed search clears the selection by design
    await admin.waitForTimeout(1500);
    await admin.waitForLoadState("networkidle").catch(() => {});
  }, 240_000);

  afterAll(async () => {
    await browser?.close();
    await cleanupOrFail({ marker: MARKER });
  }, 300_000);

  const dialog = () => admin.getByRole("dialog");
  const tick = (n: number) => admin.locator(`table input[aria-label="Pilih layanan ${sid(n)}"]`).first();

  it("selecting a row shows the bar; 'Pilih semua N hasil' shows the exact count of the whole search", async () => {
    await tick(1).check();
    await expect.poll(async () => admin.getByTestId("bulk-count").innerText()).toBe("1 layanan terpilih");
    await admin.getByRole("button", { name: /^Pilih semua 26 hasil$/ }).click({ timeout: 8000 }).catch(async (e) => {
      throw new Error(String(e).slice(0, 300) + " | bar: " + (await admin.getByTestId("bulk-bar").innerText().catch(() => "(none)")));
    });
    await expect.poll(async () => admin.getByTestId("bulk-count").innerText()).toBe("26 layanan terpilih");
  }, 90_000);

  it("deactivating 26 asks for confirmation (count + action), then ONE statement and ONE audit row; the toast reports the result", async () => {
    expect(await activeCount()).toBe(26);
    await admin.getByTestId("bulk-bar").getByRole("button", { name: "Nonaktifkan", exact: true }).click();
    await dialog().waitFor({ timeout: 20_000 });
    expect(await dialog().innerText()).toContain("Nonaktifkan 26 layanan?");
    expect(await states().then((s) => Object.values(s).filter(Boolean).length)).toBe(26); // nothing before the confirmation
    await dialog().getByRole("button", { name: "Nonaktifkan", exact: true }).click();
    await expect.poll(async () => activeCount(), { timeout: 30_000 }).toBe(0);
    await expect.poll(async () => bodyText(), { timeout: 15_000 }).toContain("26 layanan dinonaktifkan");
    const logs = await bulkLogs();
    expect(logs.length).toBe(1);
    expect(logs[0].after).toMatchObject({ active: false, changed: 26 });
  }, 120_000);

  it("running it again changes nothing and logs nothing (idempotent)", async () => {
    await tick(1).check();
    await admin.getByRole("button", { name: /^Pilih semua 26 hasil$/ }).click();
    await admin.getByTestId("bulk-bar").getByRole("button", { name: "Nonaktifkan", exact: true }).click();
    await expect.poll(async () => bodyText(), { timeout: 20_000 }).toContain("Tidak ada yang berubah: 26 layanan sudah nonaktif.");
    expect((await bulkLogs()).length).toBe(1);
  }, 90_000);

  it("activating all results skips the 'Perlu dicek' service unless it is explicitly included", async () => {
    await admin.getByTestId("bulk-bar").getByRole("button", { name: "Aktifkan", exact: true }).click();
    await dialog().waitFor({ timeout: 20_000 });
    expect(await dialog().innerText()).toContain("Aktifkan 25 layanan?");
    expect(await dialog().innerText()).toContain("1 layanan Perlu dicek akan dilewati");
    await dialog().getByRole("button", { name: "Aktifkan", exact: true }).click();
    await expect.poll(async () => activeCount(), { timeout: 30_000 }).toBe(25);
    expect((await states())[FLAGGED]).toBe(false);
    await expect.poll(async () => bodyText(), { timeout: 15_000 }).toContain("25 layanan diaktifkan, 1 dilewati (Perlu dicek)");
    expect((await bulkLogs()).length).toBe(2);
  }, 120_000);

  it("20 or fewer picked rows apply at once, without a dialog", async () => {
    expect(await admin.getByTestId("bulk-bar").count()).toBe(0); // the selection was cleared after the action
    await tick(3).check();
    await tick(4).check();
    await expect.poll(async () => admin.getByTestId("bulk-count").innerText()).toBe("2 layanan terpilih");
    await admin.getByTestId("bulk-bar").getByRole("button", { name: "Nonaktifkan", exact: true }).click();
    await expect.poll(async () => (await states())[sid(3)] === false && (await states())[sid(4)] === false, { timeout: 30_000 }).toBe(true);
    expect(await dialog().count()).toBe(0);
    await expect.poll(async () => bodyText(), { timeout: 15_000 }).toContain("2 layanan dinonaktifkan");
    expect((await bulkLogs()).length).toBe(3);
  }, 120_000);

  it("'Nonaktifkan semua' (whole catalogue) needs the typed word NONAKTIFKAN; cancelled here so the DEV catalogue stays as it is", async () => {
    await admin.getByRole("button", { name: "Aksi massal", exact: true }).click();
    const scope = dialog();
    await scope.waitFor({ timeout: 20_000 });
    await scope.getByRole("button", { name: "Nonaktifkan", exact: true }).first().click();
    const confirm = admin.getByRole("dialog").filter({ hasText: "Ketik NONAKTIFKAN" });
    await confirm.waitFor({ timeout: 30_000 });
    const before = await bulkLogs();
    const submit = confirm.getByRole("button", { name: "Nonaktifkan", exact: true });
    await confirm.getByLabel(/Ketik NONAKTIFKAN/).fill("salah");
    await submit.click().catch(() => {});
    await admin.waitForTimeout(800);
    expect((await bulkLogs()).length).toBe(before.length); // the wrong word never reaches the server
    await confirm.getByRole("button", { name: "Batal" }).click();
    expect((await bulkLogs()).length).toBe(before.length);
  }, 120_000);
});
