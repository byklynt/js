/**
 * Measured delivery-time estimates in a real browser against `next start` (PROVIDER_MODE=mock) and the linked DEV Supabase project.
 * Completed orders with KNOWN durations are created through the service role (the SQL trigger maintains the statistics), then the
 * UI is checked: "Belum ada estimasi" at 2 orders, the estimate at 3, the p25-p75 range at 5, the order form per quantity bucket, the admin
 * services page (sample count, manual text, "Reset statistik") and the min-samples site setting.
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
const LIKEO = "5c1e0a00-0000-4000-8000-00000000e001";

describe.skipIf(!enabled)("delivery-time estimates: services page, order form, admin", () => {
  const run = Math.random().toString(36).slice(2, 7);
  const password = `Esm-${run}-Pass12`;
  const uName = `zt_eu_${run}`;
  const aName = `zt_ea_${run}`;
  const SVC = `ZT-X${run.toUpperCase()}`; // gets completed orders
  const SVC2 = `ZT-Y${run.toUpperCase()}`; // gets a manual text
  const CAT = `ZT Kategori ${run}`;
  const email = (n: string) => `${n}@jagoansosmed-test.invalid`;
  let browser: Browser;
  let user: Page;
  let admin: Page;
  let totpSecret = "";
  const id: Record<string, string> = {};
  let seq = 0;
  const sb = () => createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const code = () => new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(totpSecret), digits: 6, period: 30 }).generate();
  let lastUsed = "";
  const freshCode = async () => {
    for (let i = 0; i < 70 && code() === lastUsed; i++) await new Promise((r) => setTimeout(r, 500));
    lastUsed = code();
    return lastUsed;
  };

  /** A completed, clean order of `d` seconds for the service (the trigger recomputes the statistics on the first transition to selesai). */
  async function complete(service: string, d: number, quantity = 500) {
    const T = new Date();
    seq++;
    const { data, error } = await sb().from("orders").insert({
      user_id: id.u, service_id: service, provider_id: LIKEO, provider_order_id: `MK-ZX${run}${seq}`, link: `https://zt.test/${run}/x${seq}`,
      quantity, charge: 0, remains: 0, status: "berjalan", provider_accepted_at: new Date(T.getTime() - d * 1000).toISOString(),
      created_at: new Date(T.getTime() - d * 1000 - 5000).toISOString(), last_synced_at: new Date(T.getTime() - 60_000).toISOString(),
    }).select("id").single();
    expect(error).toBeNull();
    const upd = await sb().from("orders").update({ status: "selesai", completed_at: T.toISOString(), completion_counts: true }).eq("id", data!.id);
    expect(upd.error).toBeNull();
    await new Promise((r) => setTimeout(r, 20)); // distinct completion order
  }

  /** The estimate chip of one service card on /dashboard/services (search by id, expand the category). */
  async function cardEstimate(service: string): Promise<string> {
    await user.goto("/dashboard/services");
    await user.locator("#services-search:visible").fill(service);
    const header = user.getByRole("button", { name: new RegExp(CAT) });
    await header.first().waitFor({ timeout: 30_000 });
    if ((await header.first().getAttribute("aria-expanded")) !== "true") await header.first().click();
    const card = user.locator("li.service-card").filter({ hasText: `ID: ${service}` });
    await card.first().waitFor({ timeout: 30_000 });
    return (await card.first().getByTestId("service-estimate").innerText()).replace(/\s+/g, " ").trim();
  }

  async function formEstimate(service: string, quantity?: string): Promise<string> {
    await user.goto(`/dashboard?service=${service}`);
    const el = user.getByTestId("order-estimate");
    await el.waitFor({ timeout: 40_000 });
    if (quantity !== undefined) {
      await user.getByPlaceholder("Masukkan jumlah").fill(quantity);
    }
    return (await el.innerText()).replace(/\s+/g, " ").trim();
  }

  beforeAll(async () => {
    const ref = env.SUPABASE_DEV_PROJECT_REF;
    if (!ref || new URL(url).hostname !== `${ref}.supabase.co`) throw new Error("Refusing to run: SUPABASE_DEV_PROJECT_REF does not match NEXT_PUBLIC_SUPABASE_URL.");
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
    await db.from("service_categories").insert({ id: `zt-cat-${run}`, label: CAT, platform: "instagram" });
    for (const [sid, pid] of [[SVC, `zt${run}x`], [SVC2, `zt${run}y`]]) {
      const r = await db.from("services").insert({ id: sid, provider_id: LIKEO, provider_service_id: pid, category_id: `zt-cat-${run}`, name: `ZT Estimasi ${sid}`, platform: "instagram", provider_price: 1000, price_per_1000: 1500, min: 1, max: 100000, active: true, imported: true });
      expect(r.error).toBeNull();
    }
    browser = await chromium.launch();
    const uctx = await browser.newContext({ baseURL: BASE });
    user = await uctx.newPage();
    await user.goto("/login");
    await user.getByPlaceholder("nama_pengguna").fill(uName);
    await user.getByPlaceholder("Minimal 8 karakter").fill(password);
    await user.getByRole("button", { name: "Masuk", exact: true }).click();
    await user.waitForURL("**/dashboard", { timeout: 30_000 });
    const actx = await browser.newContext({ baseURL: BASE });
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
    const r = spawnSync("node", ["scripts/db-cleanup.mjs"], { encoding: "utf8", shell: process.platform === "win32" });
    if (r.status !== 0) console.error("CLEANUP FAILED:", `${r.stdout}${r.stderr}`.slice(-1200));
  }, 120_000);

  it("no estimate before the 3rd completed order; the estimate at 3; the p25-p75 range at 5", async () => {
    expect(await cardEstimate(SVC)).toBe("Belum ada estimasi"); // 0 orders
    await complete(SVC, 300);
    await complete(SVC, 360);
    expect(await cardEstimate(SVC)).toBe("Belum ada estimasi"); // 2 orders
    await complete(SVC, 420);
    expect(await cardEstimate(SVC)).toBe("Estimasi: ± 6 menit"); // 3 orders: the median (360 s)
    expect(await user.locator("li.service-card").filter({ hasText: `ID: ${SVC}` }).getByTestId("service-estimate").getAttribute("title")).toBe("Berdasarkan 3 pesanan terakhir");
    await complete(SVC, 3600, 20_000);
    await complete(SVC, 4200, 20_000);
    expect(await cardEstimate(SVC)).toBe("Estimasi: 6 menit - 1 jam"); // 5 orders: p25 360 s - p75 3600 s
    expect(await user.locator("li.service-card").filter({ hasText: `ID: ${SVC}` }).getByTestId("service-estimate").getAttribute("title")).toBe("Berdasarkan 5 pesanan terakhir");
  }, 240_000);

  it("the order form shows the estimate for the chosen quantity bucket", async () => {
    expect(await formEstimate(SVC)).toBe("Estimasi: 6 menit - 1 jam"); // no quantity yet: service-wide
    await user.getByPlaceholder("Masukkan jumlah").fill("500"); // small: 3 samples -> the bucket's median
    await expect.poll(async () => (await user.getByTestId("order-estimate").innerText()).trim(), { timeout: 10_000 }).toBe("Estimasi: ± 6 menit");
    expect(await user.getByTestId("order-estimate").getAttribute("title")).toBe("Berdasarkan 3 pesanan terakhir dengan jumlah serupa");
    await user.getByPlaceholder("Masukkan jumlah").fill("20000"); // large: only 2 samples -> falls back to the service-wide range
    await expect.poll(async () => (await user.getByTestId("order-estimate").innerText()).trim(), { timeout: 10_000 }).toBe("Estimasi: 6 menit - 1 jam");
    // a service without data: nothing misleading
    expect(await formEstimate(SVC2)).toBe("Belum ada estimasi");
  }, 180_000);

  it("admin: sample count and estimate per service, a manual text that users see until measured data exists, 'Reset statistik' (audited)", async () => {
    const search = async (q: string) => {
      await admin.goto("/admin/services");
      await admin.getByLabel("Cari layanan berdasarkan ID atau nama").fill(q);
    };
    await search(SVC);
    const open = admin.getByRole("button", { name: `Atur estimasi layanan ${SVC}` });
    await open.waitFor({ timeout: 30_000 });
    expect((await open.innerText()).replace(/\s+/g, " ")).toContain("6 menit - 1 jam");
    expect((await open.innerText()).replace(/\s+/g, " ")).toContain("5 sampel");
    await open.click();
    expect((await admin.getByTestId("est-samples").innerText()).trim()).toBe("5");
    expect((await admin.getByTestId("est-measured").innerText()).trim()).toBe("6 menit - 1 jam");
    await admin.getByRole("button", { name: "Batal" }).click();

    // manual text on a service without data -> shown to users
    await search(SVC2);
    await admin.getByRole("button", { name: `Atur estimasi layanan ${SVC2}` }).click();
    await admin.getByLabel("Estimasi manual (opsional)").fill("5 - 15 menit");
    await admin.getByRole("button", { name: "Simpan", exact: true }).click();
    await expect.poll(async () => (await sb().from("services").select("estimate_override").eq("id", SVC2).single()).data!.estimate_override, { timeout: 20_000 }).toBe("5 - 15 menit");
    expect(await cardEstimate(SVC2)).toBe("Estimasi: 5 - 15 menit");
    expect(await formEstimate(SVC2)).toBe("Estimasi: 5 - 15 menit");
    expect(((await sb().from("audit_logs").select("id").eq("action", "service.estimate_override").eq("target_id", SVC2)).data ?? []).length).toBe(1);

    // reset the measured data of SVC: back to "Belum ada estimasi", audit row written
    await search(SVC);
    await admin.getByRole("button", { name: `Atur estimasi layanan ${SVC}` }).click();
    await admin.getByRole("button", { name: "Reset statistik" }).click();
    await admin.getByRole("button", { name: "Reset statistik" }).last().click();
    await expect.poll(async () => (await sb().from("service_completion_stats").select("service_id").eq("service_id", SVC)).data?.length ?? 0, { timeout: 30_000 }).toBe(0);
    const audit = (await sb().from("audit_logs").select("admin_id,before").eq("action", "service.stats_reset").eq("target_id", SVC)).data ?? [];
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ admin_id: id.a, before: { sampleCount: 5 } });
    expect(await cardEstimate(SVC)).toBe("Belum ada estimasi");
  }, 240_000);

  it("the minimum sample count is an admin setting", async () => {
    const db = sb();
    const { data: row } = await db.from("site_settings").select("data").maybeSingle();
    const original = (row?.data ?? {}) as Record<string, unknown>;
    try {
      await complete(SVC, 300);
      await complete(SVC, 360); // 2 samples after the reset
      expect(await cardEstimate(SVC)).toBe("Belum ada estimasi");
      await admin.goto("/admin/settings/operations");
      const field = admin.getByLabel("Tampilkan estimasi mulai dari (pesanan selesai)");
      await field.waitFor({ timeout: 30_000 });
      expect(await field.inputValue()).toBe("3");
      await field.fill("2");
      await admin.getByRole("button", { name: "Simpan", exact: true }).first().click();
      await expect.poll(async () => ((await db.from("site_settings").select("data").single()).data!.data as { estimates?: { minSamples?: number } }).estimates?.minSamples, { timeout: 30_000 }).toBe(2);
      expect(await cardEstimate(SVC)).toBe("Estimasi: ± 6 menit"); // median of 300 / 360 = 330 s -> 5 min 30 s -> 6 menit
    } finally {
      await db.from("site_settings").upsert({ id: true, data: original as never });
    }
  }, 240_000);
});
