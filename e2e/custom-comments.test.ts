/**
 * "Custom Comments" in a real browser against `next start` (PROVIDER_MODE=mock, never the real Likeo) and the linked DEV Supabase project:
 * select the service, type comments (blank lines ignored), see the live quantity and price, place the order, see the comments in the user's
 * order list and in the admin's, and see that an unsupported service type cannot be ordered. Refuses to run unless the Supabase URL is the DEV project.
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

describe.skipIf(!enabled)("custom comments: order form, user order list, admin", () => {
  const MARKER = "cm";
  const run = MARKER + Math.random().toString(36).slice(2, 7);
  const password = `Cmt-${run}-Pass12`;
  const uName = `zt_cu_${run}`;
  const aName = `zt_ca_${run}`;
  const CC = `ZT-${run.toUpperCase()}C`; // Custom Comments, 2..10, Rp 2.500 per 1000
  const PKG = `ZT-${run.toUpperCase()}P`; // Custom Comments Package: not orderable
  const email = (n: string) => `${n}@jagoansosmed-test.invalid`;
  let browser: Browser;
  let user: Page;
  let admin: Page;
  let totpSecret = "";
  let PROV = "";
  const id: Record<string, string> = {};
  const sb = () => createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const code = () => new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(totpSecret), digits: 6, period: 30 }).generate();
  let lastUsed = "";
  const freshCode = async () => {
    for (let i = 0; i < 70 && code() === lastUsed; i++) await new Promise((r) => setTimeout(r, 500));
    lastUsed = code();
    return lastUsed;
  };
  const COMMENTS = ["Mantap sekali", "<b>tebal</b> & <i>miring</i>", "Top banget"];

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
    expect((await db.rpc("apply_ledger_entry", { p_user: id.u, p_type: "deposit", p_amount: 20_000, p_ref_type: "e2e", p_ref_id: `${run}:u`, p_note: "e2e", p_by: "e2e" })).error).toBeNull();
    const c = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    await c.auth.signInWithPassword({ email: email(aName), password });
    const enrol = await c.auth.mfa.enroll({ factorType: "totp", issuer: "JagoanSosmed" });
    totpSecret = enrol.data!.totp.secret;
    expect((await c.auth.mfa.challengeAndVerify({ factorId: enrol.data!.id, code: await freshCode() })).error).toBeNull();
    const prov = await db.from("providers").insert({ name: `ZT ${run}`, slug: `zt-${run}`, mode: "mock", active: true }).select("id").single();
    expect(prov.error).toBeNull();
    PROV = prov.data!.id;
    await db.from("service_categories").insert({ id: `zt-cat-${run}`, label: `ZT Kategori ${run}`, platform: "instagram" });
    // the mock catalogue knows provider service 1005 ("Instagram Custom Comments"); the provider of this run keeps it from colliding with other suites
    for (const [sid, type, min, max, pid] of [[CC, "Custom Comments", 2, 10, "1005"], [PKG, "Custom Comments Package", 1, 1, "1006"]] as const) {
      const r = await db.from("services").insert({ id: sid, provider_id: PROV, provider_service_id: pid, category_id: `zt-cat-${run}`, name: `ZT ${type} ${run}`, platform: "instagram", provider_type: type, provider_price: 1000, price_per_1000: 2500, min, max, active: true, imported: true });
      expect(r.error).toBeNull();
    }
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

  let orderId = 0;

  it("the form swaps the quantity input for a comments box, counts the lines live and prices the computed quantity", async () => {
    await user.goto(`/dashboard?service=${CC}`);
    const box = user.getByLabel("Komentar (satu komentar per baris)");
    await box.waitFor({ timeout: 40_000 });
    expect(await user.getByPlaceholder("Masukkan jumlah").count()).toBe(0);
    await box.fill("satu saja");
    await user.getByPlaceholder("Tempel link postingan atau profil").fill("https://zt.test/cm-order");
    await user.getByRole("button", { name: "Pesan Sekarang" }).click();
    await expect.poll(async () => user.locator("body").innerText(), { timeout: 10_000 }).toContain("Kurang 1 komentar: minimal 2 komentar.");
    expect((await sbOrders()).length).toBe(0); // nothing was sent
    await box.fill(`${COMMENTS[0]}\n\n   \n${COMMENTS[1]}\n${COMMENTS[2]}\n`);
    await expect.poll(async () => user.getByTestId("comments-count").innerText()).toContain("Jumlah: 3 komentar");
    expect(await user.locator("body").innerText()).toMatch(/Rp\s?8(?!\d)/); // ceil(2500 x 3 / 1000) = ceil(7.5)
  }, 120_000);

  const sbOrders = async () => (await sb().from("orders").select("id,quantity,charge,provider_order_id,status").eq("user_id", id.u)).data ?? [];

  it("places the order (mock provider): quantity 3, charge 8, comments stored", async () => {
    await user.getByRole("button", { name: "Pesan Sekarang" }).click();
    await expect.poll(async () => (await sbOrders())[0]?.provider_order_id ?? "", { timeout: 40_000 }).toMatch(/^MK-/);
    const o = (await sbOrders())[0];
    orderId = o.id;
    expect(o).toMatchObject({ quantity: 3, charge: 8 });
    const stored = (await sb().from("order_comments").select("comments,line_count").eq("order_id", orderId).single()).data!;
    expect(stored).toEqual({ comments: COMMENTS.join("\n"), line_count: 3 });
    const bal = Number((await sb().from("profiles").select("balance").eq("id", id.u).single()).data!.balance);
    expect(bal).toBe(20_000 - 8);
  }, 120_000);

  it("the user sees the comments in the order list, escaped (never as HTML), and can copy them", async () => {
    await user.goto("/dashboard/orders");
    await user.waitForLoadState("networkidle").catch(() => {});
    const toggle = user.getByTestId(`order-comments-toggle-${orderId}`);
    await toggle.waitFor({ timeout: 30_000 });
    await toggle.click();
    const list = user.getByTestId(`order-comments-list-${orderId}`);
    await list.waitFor({ timeout: 20_000 });
    expect((await list.innerText()).split("\n").filter(Boolean)).toEqual(COMMENTS);
    expect(await list.locator("b, i").count()).toBe(0); // the markup is text, not elements
    expect(await user.getByRole("button", { name: "Salin" }).isVisible()).toBe(true);
  }, 120_000);

  it("the admin sees the same comments", async () => {
    await admin.goto("/admin/orders");
    await admin.waitForLoadState("networkidle").catch(() => {});
    const toggle = admin.getByTestId(`order-comments-toggle-${orderId}`);
    await toggle.waitFor({ timeout: 40_000 });
    await toggle.click();
    const list = admin.getByTestId(`order-comments-list-${orderId}`);
    await list.waitFor({ timeout: 20_000 });
    expect((await list.innerText()).split("\n").filter(Boolean)).toEqual(COMMENTS);
    expect(await list.locator("b, i").count()).toBe(0);
  }, 120_000);

  it("a service type the form cannot collect data for shows 'Belum tersedia untuk dipesan' and cannot be submitted", async () => {
    await user.goto(`/dashboard?service=${PKG}`);
    await user.getByTestId("not-orderable").waitFor({ timeout: 40_000 });
    expect((await user.getByTestId("not-orderable").innerText()).trim()).toBe("Belum tersedia untuk dipesan");
    expect(await user.getByRole("button", { name: "Pesan Sekarang" }).isDisabled()).toBe(true);
  }, 120_000);
});
