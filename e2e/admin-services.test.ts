/**
 * Admin services page and the user's "Cari" tab in a real browser against `next start` (PROVIDER_MODE=mock) and the linked DEV Supabase project:
 * search by our ID / provider ID / "#ID" / name, "Tidak ada hasil", the "Perlu dicek" badge, and the Aktif switch (ONE click flips it at once, one request,
 * one audit row, disabled while in flight). Refuses to run unless the Supabase URL is the DEV project.
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

describe.skipIf(!enabled)("admin services: search, Perlu dicek, Aktif switch; user Cari tab", () => {
  const MARKER = "sa";
  const run = MARKER + Math.random().toString(36).slice(2, 7);
  const password = `Srv-${run}-Pass12`;
  const uName = `zt_su_${run}`;
  const aName = `zt_sa_${run}`;
  const SVC = `ZT-${run.toUpperCase()}A`; // normal, telegram platform (the user's selected chip is Instagram)
  const ODD = `ZT-${run.toUpperCase()}M`; // name "mm", category "0m", Rp 25.900.000: needs checking
  const PID = `${run}7001`;
  const NAME = `ZT Pencarian Unik ${run}`;
  const email = (n: string) => `${n}@jagoansosmed-test.invalid`;
  let browser: Browser;
  let user: Page;
  let admin: Page;
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
  const activeInDb = async () => (await sb().from("services").select("active").eq("id", SVC).single()).data!.active as boolean;
  const auditCount = async () => (await sb().from("audit_logs").select("id").eq("target_id", SVC).eq("action", "service.update")).data?.length ?? 0;

  beforeAll(async () => {
    const ref = env.SUPABASE_DEV_PROJECT_REF;
    if (!ref || new URL(url).hostname !== `${ref}.supabase.co`) throw new Error("Refusing to run: SUPABASE_DEV_PROJECT_REF does not match NEXT_PUBLIC_SUPABASE_URL.");
    await cleanupOrFail({ marker: MARKER });
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
    const prov = await db.from("providers").insert({ name: `ZT ${run}`, slug: `zt-${run}`, mode: "mock", active: true }).select("id").single();
    expect(prov.error).toBeNull();
    await db.from("service_categories").insert([{ id: `zt-cat-${run}`, label: `ZT Kategori ${run}`, platform: "telegram" }, { id: `zt-cat-${run}-odd`, label: "0m", platform: "lainnya" }]);
    const base = { provider_id: prov.data!.id, platform: "telegram", min: 100, max: 500000, active: true, imported: true };
    expect((await db.from("services").insert({ ...base, id: SVC, provider_service_id: PID, category_id: `zt-cat-${run}`, name: NAME, provider_price: 1000, price_per_1000: 2000 })).error).toBeNull();
    expect((await db.from("services").insert({ ...base, id: ODD, provider_service_id: `${run}7002`, category_id: `zt-cat-${run}-odd`, name: "mm", platform: "lainnya", provider_price: 18_500_000, price_per_1000: 25_900_000 })).error).toBeNull();
    browser = await chromium.launch();
    user = await (await browser.newContext({ baseURL: BASE })).newPage();
    await user.goto("/login");
    await user.waitForLoadState("networkidle").catch(() => {});
    await user.getByPlaceholder("nama_pengguna").fill(uName);
    await user.getByPlaceholder("Minimal 8 karakter").fill(password);
    await user.getByRole("button", { name: "Masuk", exact: true }).click();
    await user.waitForURL("**/dashboard", { timeout: 30_000 });
    admin = await (await browser.newContext({ baseURL: BASE })).newPage();
    await admin.goto("/admin/login");
    await admin.waitForLoadState("networkidle").catch(() => {});
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
    await cleanupOrFail({ marker: MARKER });
  }, 300_000);

  const adminSearch = async (text: string) => {
    const box = admin.getByLabel("Cari layanan berdasarkan ID atau nama").first();
    await box.fill(text);
    await admin.waitForLoadState("networkidle").catch(() => {});
  };
  const visible = async (needle: string) => admin.locator("main").first().innerText().then((t) => t.includes(needle));

  it("admin search: our ID, provider ID, #provider ID and part of the name (case-insensitive) all find it; nonsense shows Tidak ada hasil", async () => {
    await admin.goto("/admin/services");
    await admin.waitForLoadState("networkidle").catch(() => {});
    for (const q of [SVC, SVC.toLowerCase(), PID, `#${PID}`, "  #" + PID + "  ", NAME.toUpperCase().slice(0, 18), `pencarian unik ${run}`]) {
      await adminSearch(q);
      await expect.poll(async () => visible(NAME), { timeout: 15_000, message: `search "${q}"` }).toBe(true);
    }
    await adminSearch(`tidak-ada-${run}-zzzz`);
    await expect.poll(async () => visible("Tidak ada hasil"), { timeout: 15_000 }).toBe(true);
    // typing text searches across categories, even with a category filter chosen
    await adminSearch("");
  }, 150_000);

  it("admin list: the suspicious service shows the Perlu dicek badge, a normal one does not", async () => {
    await adminSearch(ODD);
    await expect.poll(async () => admin.getByTestId("review-badge").count(), { timeout: 15_000 }).toBeGreaterThan(0);
    await adminSearch(SVC);
    await expect.poll(async () => visible(NAME), { timeout: 15_000 }).toBe(true);
    expect(await admin.getByTestId("review-badge").count()).toBe(0);
  }, 120_000);

  it("Aktif switch: ONE click flips it at once, runs ONE request, writes ONE audit row, is disabled while in flight, and flips back with one more click", async () => {
    await adminSearch(SVC);
    const sw = admin.getByRole("switch", { name: `Aktifkan layanan ${SVC}` }).first();
    await sw.waitFor({ timeout: 20_000 });
    expect(await sw.getAttribute("aria-checked")).toBe("true");
    const actions: string[] = [];
    admin.on("request", (r) => {
      if (r.method() === "POST" && r.headers()["next-action"]) actions.push(r.url());
    });
    await sw.click();
    // optimistic: the switch is already off and locked, long before the server answers
    await expect.poll(async () => sw.getAttribute("aria-checked"), { timeout: 1500 }).toBe("false");
    expect(await sw.isDisabled()).toBe(true);
    // a second click while the request is in flight does nothing (disabled)
    await sw.click({ force: true, timeout: 2000 }).catch(() => {});
    await expect.poll(async () => (await activeInDb()) === false, { timeout: 30_000 }).toBe(true);
    await expect.poll(async () => sw.isDisabled(), { timeout: 30_000 }).toBe(false);
    expect(await sw.getAttribute("aria-checked")).toBe("false");
    expect(actions.length).toBe(1);
    expect(await auditCount()).toBe(1);

    await sw.click();
    await expect.poll(async () => sw.getAttribute("aria-checked"), { timeout: 1500 }).toBe("true");
    await expect.poll(async () => (await activeInDb()) === true, { timeout: 30_000 }).toBe(true);
    await expect.poll(async () => sw.isDisabled(), { timeout: 30_000 }).toBe(false);
    expect(actions.length).toBe(2);
    expect(await auditCount()).toBe(2);
  }, 180_000);

  /** Opens the Cari tab (retrying the click: the page may not be hydrated yet) and returns its search box. */
  async function openCari() {
    await user.goto("/dashboard");
    await user.waitForLoadState("networkidle").catch(() => {});
    const box = user.getByPlaceholder("Cari ID atau nama layanan...");
    for (let i = 0; i < 10 && !(await box.isVisible()); i++) {
      await user.getByRole("tab", { name: "Cari" }).click();
      await user.waitForTimeout(500);
    }
    await box.waitFor({ timeout: 10_000 });
    return box;
  }
  const userHas = async (needle: string) => (await user.locator("main").first().innerText()).includes(needle);

  it("user Cari tab: finds the service by our ID and by name even though another platform chip is selected; Tidak ada hasil; not the provider ID", async () => {
    const box = await openCari();
    for (const q of [SVC, `#${SVC}`, `pencarian unik ${run}`]) {
      await box.fill(q);
      await expect.poll(async () => userHas(NAME), { timeout: 20_000, message: `user search "${q}"` }).toBe(true);
    }
    await box.fill(PID); // the provider's ID is not searchable by users: the earlier result goes away and the empty state appears
    await expect.poll(async () => user.getByTestId("search-empty").innerText(), { timeout: 20_000 }).toBe("Tidak ada hasil");
    expect(await userHas(NAME)).toBe(false);
    await box.fill(`tidak-ada-${run}-zzzz`);
    await expect.poll(async () => user.getByTestId("search-empty").innerText(), { timeout: 20_000 }).toBe("Tidak ada hasil");
  }, 150_000);

  it("user Cari tab: a switched-off service is not found", async () => {
    await sb().from("services").update({ active: false }).eq("id", SVC);
    const box = await openCari();
    await box.fill(SVC);
    await expect.poll(async () => user.getByTestId("search-empty").innerText(), { timeout: 20_000 }).toBe("Tidak ada hasil");
  }, 150_000);
});
