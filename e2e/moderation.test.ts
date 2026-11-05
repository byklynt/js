/**
 * Moderation in a real browser against `next start` (PROVIDER_MODE=mock) and the linked DEV Supabase project:
 * 1. an admin cancels an order WITHOUT refund (type BATAL, password, required reason): no ledger entry, order marked, user notified generically, audit row;
 * 2. a blocked user with a balance shows "Saldo ditahan", and "Selesaikan saldo" works for tahan / hanguskan (in chunks of at most Rp 100.000.000) / kembalikan,
 *    each with reason, password and audit; a rejected form keeps what was typed.
 * Refuses to run unless the Supabase URL matches SUPABASE_DEV_PROJECT_REF. Temporary users are removed afterwards.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import * as OTPAuth from "otpauth";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
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

describe.skipIf(!enabled)("moderation: cancel without refund, blocked users' balance", () => {
  const run = Math.random().toString(36).slice(2, 7);
  const password = `Mod-${run}-Pass12`;
  const aName = `zt_ma_${run}`;
  const vName = `zt_mv_${run}`; // owner of the order that is cancelled for a violation
  const bName = `zt_mb_${run}`; // blocked user with a balance
  const SVC = `ZT-M${run.toUpperCase()}`;
  const email = (n: string) => `${n}@jagoansosmed-test.invalid`;
  let browser: Browser;
  let totpSecret = "";
  let actx: BrowserContext;
  let admin: Page;
  const id: Record<string, string> = {};
  const sb = () => createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const code = () => new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(totpSecret), digits: 6, period: 30 }).generate();
  let lastUsed = "";
  const freshCode = async () => {
    for (let i = 0; i < 70 && code() === lastUsed; i++) await new Promise((r) => setTimeout(r, 500));
    lastUsed = code();
    return lastUsed;
  };
  const balance = async (uid: string) => Number((await sb().from("profiles").select("balance").eq("id", uid).single()).data!.balance);
  const credit = (uid: string, amount: number, ref: string) =>
    sb().rpc("apply_ledger_entry", { p_user: uid, p_type: "deposit", p_amount: amount, p_ref_type: "e2e", p_ref_id: `${run}:${ref}`, p_note: "e2e", p_by: "e2e" });
  const dialogPassword = (page: Page) => page.locator('[role="dialog"] input[type="password"], dialog input[type="password"]').last();

  async function searchUsers(q: string) {
    await admin.goto("/admin/users");
    await admin.getByPlaceholder("Cari di seluruh data...").fill(q);
    await admin.getByPlaceholder("Cari di seluruh data...").press("Enter");
  }

  beforeAll(async () => {
    const ref = env.SUPABASE_DEV_PROJECT_REF;
    if (!ref || !url.includes(ref)) throw new Error("Refusing to run: SUPABASE_DEV_PROJECT_REF does not match NEXT_PUBLIC_SUPABASE_URL.");
    const db = sb();
    const mk = async (n: string) => {
      const { data, error } = await db.auth.admin.createUser({ email: email(n), password, email_confirm: true, user_metadata: { username: n } });
      if (error || !data.user) throw new Error(error?.message);
      return data.user.id;
    };
    id.a = await mk(aName);
    id.v = await mk(vName);
    id.b = await mk(bName);
    await db.from("profiles").update({ role: "admin" }).eq("id", id.a);
    const c = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    await c.auth.signInWithPassword({ email: email(aName), password });
    const enrol = await c.auth.mfa.enroll({ factorType: "totp", issuer: "JagoanSosmed" });
    totpSecret = enrol.data!.totp.secret;
    expect((await c.auth.mfa.challengeAndVerify({ factorId: enrol.data!.id, code: await freshCode() })).error).toBeNull();
    await db.from("service_categories").insert({ id: `zt-cat-${run}`, label: `ZT Kategori ${run}`, platform: "instagram" });
    expect((await db.from("services").insert({ id: SVC, provider_id: LIKEO, provider_service_id: "1001", category_id: `zt-cat-${run}`, name: `ZT Followers ${run}`, platform: "instagram", provider_price: 1000, price_per_1000: 1500, min: 100, max: 100000, cancel: true, refill: true, active: true, imported: true })).error).toBeNull();
    browser = await chromium.launch();
    actx = await browser.newContext({ baseURL: BASE });
    admin = await actx.newPage();
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
    const r = spawnSync("npx", ["supabase", "db", "query", "--remote", "--file", "scripts/db-cleanup-test-data.sql", "--yes"], { encoding: "utf8", shell: process.platform === "win32" });
    if (r.status !== 0) console.error("CLEANUP FAILED:", `${r.stdout}${r.stderr}`.slice(-1200));
  }, 120_000);

  it("Batalkan tanpa refund (pelanggaran): reason required, typed text kept on rejection, no ledger entry, generic notification, audit", async () => {
    await credit(id.v, 10_000, "v");
    const { data: ord } = await sb().from("orders").insert({ user_id: id.v, service_id: SVC, provider_id: LIKEO, provider_order_id: `MK-ZT${run}`, link: `https://zt.test/mod-${run}`, quantity: 1000, charge: 1500, remains: 1000, status: "diproses" }).select("id").single();
    const orderId = Number(ord!.id);
    await sb().rpc("apply_ledger_entry", { p_user: id.v, p_type: "order", p_amount: -1500, p_ref_type: "order", p_ref_id: String(orderId), p_note: "order", p_by: id.v });
    const ledgerCount = async () => ((await sb().from("balance_ledger").select("id").eq("user_id", id.v)).data ?? []).length;
    const before = await ledgerCount();

    await admin.goto("/admin/orders");
    await admin.getByPlaceholder("Cari di seluruh data...").fill(String(orderId));
    await admin.getByPlaceholder("Cari di seluruh data...").press("Enter");
    await admin.getByRole("button", { name: `Aksi untuk pesanan ${orderId}` }).click();
    await admin.getByRole("menuitem", { name: "Batalkan tanpa refund (pelanggaran)" }).click();
    await admin.getByLabel("Ketik BATAL untuk konfirmasi").fill("BATAL");
    await dialogPassword(admin).fill(password);
    // 1. no reason: rejected, nothing changed, and the dialog keeps the typed confirmation
    await admin.getByRole("button", { name: "Batalkan tanpa refund", exact: true }).click();
    await admin.getByText("Pilih alasan pembatalan.").first().waitFor({ timeout: 20_000 });
    expect((await sb().from("orders").select("status").eq("id", orderId).single()).data!.status).toBe("diproses");
    expect(await admin.getByLabel("Ketik BATAL untuk konfirmasi").inputValue()).toBe("BATAL");
    expect(await dialogPassword(admin).inputValue()).toBe(password);
    // 2. with a reason it is cancelled
    expect(await admin.locator("select option").allInnerTexts()).toEqual(["Pilih alasan", "Pelanggaran kebijakan konten", "SARA/kekerasan", "Penipuan", "Lainnya"]);
    await admin.locator("select").selectOption("SARA/kekerasan");
    await admin.getByRole("button", { name: "Batalkan tanpa refund", exact: true }).click();
    await expect.poll(async () => (await sb().from("orders").select("status").eq("id", orderId).single()).data!.status, { timeout: 30_000 }).toBe("dibatalkan");

    const row = (await sb().from("orders").select("status,cancelled_by,refunded_amount,violation_reason").eq("id", orderId).single()).data!;
    expect(row).toMatchObject({ status: "dibatalkan", cancelled_by: "admin", refunded_amount: 0, violation_reason: "SARA/kekerasan" });
    expect(await ledgerCount()).toBe(before); // NO refund ledger entry
    expect(await balance(id.v)).toBe(10_000 - 1500);
    expect(((await sb().from("refunds").select("id").eq("order_id", orderId)).data ?? []).length).toBe(0);
    const notes = (await sb().from("notifications").select("body").eq("user_id", id.v)).data ?? [];
    expect(notes.map((n) => n.body)).toContain("Pesananmu dibatalkan karena melanggar ketentuan layanan.");
    const audit = (await sb().from("audit_logs").select("admin_id,after").eq("action", "order.cancel_violation").eq("target_id", String(orderId))).data ?? [];
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ admin_id: id.a, after: { reason: "SARA/kekerasan", refund: 0 } });
    // the order list says why
    await admin.reload();
    await admin.getByPlaceholder("Cari di seluruh data...").fill(String(orderId));
    await admin.getByPlaceholder("Cari di seluruh data...").press("Enter");
    await admin.getByText("Dibatalkan karena pelanggaran: SARA/kekerasan").first().waitFor({ timeout: 20_000 });
    // a finished order cannot be cancelled this way again: the menu item is disabled
    await admin.getByRole("button", { name: `Aksi untuk pesanan ${orderId}` }).click();
    expect(await admin.getByRole("menuitem", { name: "Batalkan tanpa refund (pelanggaran)" }).isDisabled()).toBe(true);
    await admin.keyboard.press("Escape");
  }, 200_000);

  it("blocked user with a balance: 'Saldo ditahan' badge, then Selesaikan saldo (tahan, hanguskan in chunks, kembalikan)", async () => {
    await credit(id.b, 250_000_000, "b1");
    await sb().from("profiles").update({ status: "diblokir" }).eq("id", id.b);
    const entries = async () => ((await sb().from("balance_ledger").select("type,amount,note").eq("user_id", id.b).order("created_at")).data ?? []).map((l) => ({ ...l, amount: Number(l.amount) }));

    await searchUsers(bName);
    await admin.getByRole("button", { name: `Aksi untuk ${bName}` }).waitFor({ timeout: 20_000 });
    expect(await admin.getByTestId("held-balance-badge").count()).toBeGreaterThan(0);

    const open = async () => {
      await admin.getByRole("button", { name: `Aksi untuk ${bName}` }).click();
      await admin.getByRole("menuitem", { name: "Selesaikan saldo" }).click();
    };
    const confirm = () => admin.getByRole("button", { name: "Simpan keputusan", exact: true }).click();

    // 1. a rejected form (no choice) keeps the reason and the password
    await open();
    await admin.locator("textarea").fill("Keputusan awal: tahan dulu");
    await dialogPassword(admin).fill(password);
    await confirm();
    await admin.getByText("Pilih salah satu keputusan.").first().waitFor({ timeout: 20_000 });
    expect(await admin.locator("textarea").inputValue()).toBe("Keputusan awal: tahan dulu");
    expect(await dialogPassword(admin).inputValue()).toBe(password);

    // 2. "Biarkan ditahan": audit only, no ledger change
    const ledgerBefore = (await entries()).length;
    await admin.getByLabel("Biarkan ditahan", { exact: false }).check();
    await confirm();
    await expect.poll(async () => ((await sb().from("audit_logs").select("id").eq("action", "user.balance.settle").eq("target_id", id.b)).data ?? []).length, { timeout: 30_000 }).toBe(1);
    expect((await entries()).length).toBe(ledgerBefore);
    expect(await balance(id.b)).toBe(250_000_000);

    // 3. "Hanguskan": 250.000.000 in chunks of at most 100.000.000 (100 + 100 + 50), each its own ledger entry
    await admin.reload();
    await searchUsers(bName);
    await open();
    await admin.getByLabel("Hanguskan", { exact: false }).check();
    await admin.locator("textarea").fill("Pelanggaran kebijakan konten");
    await dialogPassword(admin).fill(password);
    await confirm();
    await expect.poll(() => balance(id.b), { timeout: 40_000 }).toBe(0);
    const adj = (await entries()).filter((l) => l.type === "adjustment");
    expect(adj.map((l) => l.amount)).toEqual([-100_000_000, -100_000_000, -50_000_000]);
    for (const l of adj) expect(l.note).toBe("Saldo dihanguskan (pelanggaran): Pelanggaran kebijakan konten");
    const settle = (await sb().from("audit_logs").select("after").eq("action", "user.balance.settle").eq("target_id", id.b)).data ?? [];
    expect(settle.map((a) => (a.after as { choice: string }).choice).sort()).toEqual(["hanguskan", "tahan"]);
    expect(((await sb().from("audit_logs").select("id").eq("action", "user.balance.adjust").eq("target_id", id.b)).data ?? []).length).toBe(3);

    // 4. a new balance, "Kembalikan ke pengguna"
    await credit(id.b, 5_000, "b2");
    await searchUsers(bName);
    await open();
    await admin.getByLabel("Kembalikan ke pengguna", { exact: false }).check();
    await admin.locator("textarea").fill("Dibayar manual ke pengguna");
    await dialogPassword(admin).fill(password);
    await confirm();
    await expect.poll(() => balance(id.b), { timeout: 30_000 }).toBe(0);
    const last = (await entries()).filter((l) => l.type === "adjustment").at(-1)!;
    expect(last).toMatchObject({ amount: -5_000, note: "Saldo dikembalikan ke pengguna: Dibayar manual ke pengguna" });
    const sum = (await entries()).reduce((n, l) => n + l.amount, 0);
    expect(sum).toBe(0); // ledger == balance

    // 5. nothing left to settle: no badge, no menu item
    await searchUsers(bName);
    await admin.getByRole("button", { name: `Aksi untuk ${bName}` }).waitFor({ timeout: 20_000 });
    expect(await admin.getByTestId("held-balance-badge").count()).toBe(0);
    await admin.getByRole("button", { name: `Aksi untuk ${bName}` }).click();
    expect(await admin.getByRole("menuitem", { name: "Selesaikan saldo" }).count()).toBe(0);
    await admin.keyboard.press("Escape");
    // a blocked user still cannot place an order (the database refuses it)
    const placed = await sb().rpc("place_order", { p_user: id.b, p_service: SVC, p_link: `https://zt.test/blocked-${run}`, p_quantity: 1000 });
    expect(placed.error).not.toBeNull();
  }, 250_000);
});
