/**
 * The admin dashboard (/admin) in a real browser against `next start` and the linked DEV Supabase project: every section is there and
 * driven by real data (the 4 stat cards, all 7 "Perlu Tindakan" cards even at 0, "Kesehatan Sinkronisasi" with the providers of the
 * providers table, "Pesanan Gagal Kirim" with "Kirim ulang semua", "Rekonsiliasi"). A failed order created through the service role
 * moves the counter and shows up in the list. Refuses to run unless the Supabase URL matches SUPABASE_DEV_PROJECT_REF.
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
const LABELS = ["Tiket Menunggu", "Order Gagal Kirim", "Order Macet", "Refund Tidak Sesuai", "Deposit Menunggu", "Margin Tipis", "Perlu Ditinjau"];

describe.skipIf(!enabled)("admin dashboard: every section, real data", () => {
  const run = Math.random().toString(36).slice(2, 7);
  const password = `Dsh-${run}-Pass12`;
  const aName = `zt_da_${run}`;
  const uName = `zt_du_${run}`;
  const SVC = `ZT-D${run.toUpperCase()}`;
  const email = (n: string) => `${n}@jagoansosmed-test.invalid`;
  let browser: Browser;
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

  /** Number shown on one of the attention cards. */
  async function cardValue(label: string) {
    const card = admin.getByTestId("attention-card").filter({ hasText: label });
    await card.first().waitFor({ timeout: 30_000 });
    const text = (await card.first().innerText()).replace(/\s+/g, " ");
    const m = new RegExp(`${label}\\s+([\\d.]+)`).exec(text);
    expect(m, `value of "${label}" in "${text}"`).not.toBeNull();
    return Number(m![1].replace(/\./g, ""));
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
    id.a = await mk(aName);
    id.u = await mk(uName);
    await db.from("profiles").update({ role: "admin" }).eq("id", id.a);
    const c = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    await c.auth.signInWithPassword({ email: email(aName), password });
    const enrol = await c.auth.mfa.enroll({ factorType: "totp", issuer: "JagoanSosmed" });
    totpSecret = enrol.data!.totp.secret;
    expect((await c.auth.mfa.challengeAndVerify({ factorId: enrol.data!.id, code: await freshCode() })).error).toBeNull();
    await db.from("service_categories").insert({ id: `zt-cat-${run}`, label: `ZT Kategori ${run}`, platform: "instagram" });
    expect((await db.from("services").insert({ id: SVC, provider_id: LIKEO, provider_service_id: "1001", category_id: `zt-cat-${run}`, name: `ZT Followers ${run}`, platform: "instagram", provider_price: 1000, price_per_1000: 1500, min: 100, max: 100000, active: true, imported: true })).error).toBeNull();
    browser = await chromium.launch();
    const ctx = await browser.newContext({ baseURL: BASE });
    admin = await ctx.newPage();
    await admin.goto("/admin/login");
    await admin.getByPlaceholder("nama_admin").fill(aName);
    await admin.getByPlaceholder("Password admin").fill(password);
    await admin.locator("form button[type=submit]").click();
    await admin.getByPlaceholder("000000").waitFor({ timeout: 30_000 });
    await admin.getByPlaceholder("000000").fill(await freshCode());
    await admin.locator("form button[type=submit]").click();
    await admin.waitForURL((u) => u.pathname === "/admin", { timeout: 30_000 });
  }, 150_000);

  afterAll(async () => {
    await browser?.close();
    const r = spawnSync("node", ["scripts/db-cleanup.mjs"], { encoding: "utf8", shell: process.platform === "win32" });
    if (r.status !== 0) console.error("CLEANUP FAILED:", `${r.stdout}${r.stderr}`.slice(-1200));
  }, 120_000);

  it("all sections render: 4 stat cards, 7 attention cards (even at 0), sync health, failed orders with 'Kirim ulang semua', reconciliation", async () => {
    await admin.goto("/admin");
    await admin.getByTestId("attention-card").first().waitFor({ timeout: 40_000 });
    const body = (await admin.locator("body").innerText()).replace(/\s+/g, " ");
    for (const t of ["Pendapatan Hari Ini", "Profit Hari Ini", "Pesanan Hari Ini", "Pengguna Baru"]) expect(body).toContain(t);
    expect(await admin.getByTestId("attention-card").count()).toBe(7);
    const labels = await admin.getByTestId("attention-card").evaluateAll((els) => els.map((e) => (e.textContent ?? "")));
    for (const l of LABELS) expect(labels.some((t) => t.includes(l)), l).toBe(true);
    for (const t of ["Perlu Tindakan", "Kesehatan Sinkronisasi", "Pesanan Gagal Kirim", "Rekonsiliasi"]) expect(body).toContain(t);
    expect(await admin.getByRole("button", { name: "Kirim ulang semua" }).count()).toBe(1);
    expect(await admin.getByRole("button", { name: "Sinkronkan ulang" }).count()).toBe(1);
    for (const t of ["Status beda dengan provider", "Saldo tidak cocok dengan buku besar", "Refund tidak sesuai perhitungan"]) expect(body).toContain(t);
  }, 120_000);

  it("'Kesehatan Sinkronisasi' lists exactly the providers of the providers table", async () => {
    const { data } = await sb().from("providers").select("name").order("created_at");
    const names = (data ?? []).map((p) => p.name);
    expect(names.length).toBeGreaterThan(0);
    await admin.goto("/admin");
    await admin.getByTestId("sync-provider").first().waitFor({ timeout: 40_000 });
    const shown = await admin.getByTestId("sync-provider").evaluateAll((els) => els.map((e) => e.querySelector("p")?.textContent ?? ""));
    expect(shown).toEqual(names);
  }, 120_000);

  it("a failed order moves the counter and appears in 'Pesanan Gagal Kirim'", async () => {
    await admin.goto("/admin");
    const before = await cardValue("Order Gagal Kirim");
    const { data: ord, error } = await sb().from("orders").insert({ user_id: id.u, service_id: SVC, provider_id: LIKEO, link: `https://zt.test/dash-${run}`, quantity: 100, charge: 0, remains: 100, status: "gagal_kirim", needs_manual_check: true }).select("id").single();
    expect(error).toBeNull();
    await admin.goto("/admin");
    await expect.poll(() => cardValue("Order Gagal Kirim"), { timeout: 30_000 }).toBe(before + 1);
    await admin.getByText(`#${ord!.id}`).first().waitFor({ timeout: 20_000 });
    expect(await admin.getByTestId("failed-empty").count()).toBe(0);
    expect(await admin.getByRole("button", { name: "Kirim ulang semua" }).isEnabled()).toBe(true);
  }, 120_000);
});
