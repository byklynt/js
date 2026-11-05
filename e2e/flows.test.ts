/**
 * User journeys in a real browser (Chromium) against `next start` (PROVIDER_MODE=mock) and the linked DEV Supabase project:
 * signup through the UI, username login (+ "Ingat saya"), order form, ticket with attachment + reply, notification badge, language switcher,
 * admin balance adjustment, admin refund approval, and the access rules (another user's data, non-admin blocked from /admin).
 * It refuses to run unless the Supabase URL matches SUPABASE_DEV_PROJECT_REF. Temporary users are created and removed through the service role.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import * as OTPAuth from "otpauth";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { LEGAL_VERSION } from "@/lib/legal-content";
import { hashPassword } from "@/lib/server/password";
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
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const LIKEO = "5c1e0a00-0000-4000-8000-00000000e001";

describe.skipIf(!enabled)("browser flows: signup, order, ticket, language, admin actions, access rules", () => {
  const run = Math.random().toString(36).slice(2, 7);
  const password = `Flw-${run}-Pass12`;
  const uName = `zt_f_${run}`; // signs up through the UI
  const vName = `zt_v_${run}`; // "someone else"
  const aName = `zt_a_${run}`; // admin
  const SVC = `ZT-F${run.toUpperCase()}`;
  const email = (n: string) => `${n}@jagoansosmed-test.invalid`;
  let browser: Browser;
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
  const balance = async (uid: string) => Number((await sb().from("profiles").select("balance").eq("id", uid).single()).data!.balance);

  async function loginUser(name: string, remember = false): Promise<{ ctx: BrowserContext; page: Page }> {
    const ctx = await browser.newContext({ baseURL: BASE });
    const page = await ctx.newPage();
    await page.goto("/login");
    await page.getByPlaceholder("nama_pengguna").fill(name);
    await page.getByPlaceholder("Minimal 8 karakter").fill(password);
    if (remember) await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Masuk", exact: true }).click();
    await page.waitForURL("**/dashboard", { timeout: 30_000 });
    return { ctx, page };
  }
  async function loginAdmin(): Promise<{ ctx: BrowserContext; page: Page }> {
    const ctx = await browser.newContext({ baseURL: BASE });
    const page = await ctx.newPage();
    await page.goto("/admin/login");
    await page.getByPlaceholder("nama_admin").fill(aName);
    await page.getByPlaceholder("Password admin").fill(password);
    await page.locator("form button[type=submit]").click();
    await page.getByPlaceholder("000000").waitFor({ timeout: 30_000 });
    await page.getByPlaceholder("000000").fill(await freshCode());
    await page.locator("form button[type=submit]").click();
    await page.waitForURL((u) => u.pathname === "/admin", { timeout: 30_000 });
    return { ctx, page };
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
    id.v = await mk(vName);
    id.a = await mk(aName);
    await db.from("profiles").update({ role: "admin" }).eq("id", id.a);
    const c = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    await c.auth.signInWithPassword({ email: email(aName), password });
    const enrol = await c.auth.mfa.enroll({ factorType: "totp", issuer: "JagoanSosmed" });
    totpSecret = enrol.data!.totp.secret;
    expect((await c.auth.mfa.challengeAndVerify({ factorId: enrol.data!.id, code: await freshCode() })).error).toBeNull();
    await db.from("service_categories").insert({ id: `zt-cat-${run}`, label: `ZT Kategori ${run}`, platform: "instagram" });
    expect((await db.from("services").insert({ id: SVC, provider_id: LIKEO, provider_service_id: "1001", category_id: `zt-cat-${run}`, name: `ZT Followers ${run}`, platform: "instagram", provider_price: 1000, price_per_1000: 1500, min: 100, max: 100000, cancel: true, refill: true, active: true, imported: true })).error).toBeNull();
    browser = await chromium.launch();
  }, 90_000);

  afterAll(async () => {
    await browser?.close();
    // Ticket attachments live in Storage (SQL cleanup cannot reach it): remove only the folders of the users this run created.
    const bucket = sb().storage.from("ticket-attachments");
    for (const uid of Object.values(id)) {
      const { data: folders } = await bucket.list(uid, { limit: 100 });
      const paths: string[] = [];
      for (const f of folders ?? []) {
        const { data: files } = await bucket.list(`${uid}/${f.name}`, { limit: 100 });
        for (const file of files ?? []) paths.push(`${uid}/${f.name}/${file.name}`);
      }
      if (paths.length) await bucket.remove(paths);
    }
    const r = spawnSync("npx", ["supabase", "db", "query", "--remote", "--file", "scripts/db-cleanup-test-data.sql", "--yes"], { encoding: "utf8", shell: process.platform === "win32" });
    if (r.status !== 0) console.error("CLEANUP FAILED:", `${r.stdout}${r.stderr}`.slice(-1200));
  }, 120_000);

  it("signup through the UI gives a definite outcome and creates the account with the chosen username", async () => {
    const ctx = await browser.newContext({ baseURL: BASE });
    const page = await ctx.newPage();
    await page.goto("/signup");
    await page.getByPlaceholder("nama_pengguna").fill(uName);
    await page.getByPlaceholder("kamu@email.com").fill(email(uName));
    await page.getByPlaceholder("Minimal 8 karakter").fill(password);
    await page.getByPlaceholder("Ulangi password").fill(password);
    await page.getByRole("button", { name: "Daftar", exact: true }).click();
    // Either straight to the dashboard (Confirm e-mail OFF) or the "check your e-mail" notice (ON): never a silent failure.
    await expect.poll(async () => `${new URL(page.url()).pathname}|${await page.locator("body").innerText()}`, { timeout: 40_000 }).toMatch(/\/dashboard\||cek email|konfirmasi|Terlalu banyak email|rate/i);
    const { data: profile } = await sb().from("profiles").select("id,username,role,balance,terms_version,terms_accepted_at").eq("username", uName).maybeSingle();
    if (profile) {
      expect(profile).toMatchObject({ username: uName, role: "user", balance: 0 });
      expect(profile.terms_version).toBe(LEGAL_VERSION); // implied acceptance at signup is recorded
      expect(Date.now() - new Date(profile.terms_accepted_at!).getTime()).toBeLessThan(10 * 60_000);
      id.u = profile.id;
      await sb().auth.admin.updateUserById(profile.id, { email_confirm: true }); // so the rest of the journey can sign in whatever the project's e-mail setting is
    } else {
      // The project's e-mail sender refused (rate limit / unauthorised address): the UI said so. Create the account directly for the rest of the journey.
      const { data } = await sb().auth.admin.createUser({ email: email(uName), password, email_confirm: true, user_metadata: { username: uName } });
      id.u = data.user!.id;
      console.warn("[e2e] UI sign-up did not create the account (e-mail sender refused); continued with a service-role account.");
    }
    await ctx.close();
    // duplicate username is refused through the UI too
    const ctx2 = await browser.newContext({ baseURL: BASE });
    const p2 = await ctx2.newPage();
    await p2.goto("/signup");
    await p2.getByPlaceholder("nama_pengguna").fill(uName.toUpperCase());
    await p2.getByPlaceholder("kamu@email.com").fill(email(`${uName}_2`));
    await p2.getByPlaceholder("Minimal 8 karakter").fill(password);
    await p2.getByPlaceholder("Ulangi password").fill(password);
    await p2.getByRole("button", { name: "Daftar", exact: true }).click();
    await expect.poll(async () => p2.locator("body").innerText(), { timeout: 30_000 }).toMatch(/sudah dipakai|Terlalu banyak/i);
    await ctx2.close();
  }, 150_000);

  it("username login; 'Ingat saya' controls the cookie lifetime (session cookie vs 30 days)", async () => {
    const lifetimes = async (remember: boolean) => {
      const { ctx } = await loginUser(uName, remember);
      const cookies = (await ctx.cookies()).filter((c) => /^sb-.*-auth-token/.test(c.name));
      await ctx.close();
      return cookies;
    };
    const session = await lifetimes(false);
    expect(session.length).toBeGreaterThan(0);
    for (const c of session) expect(c.expires).toBe(-1); // browser-session cookie
    const remembered = await lifetimes(true);
    expect(remembered.length).toBeGreaterThan(0);
    for (const c of remembered) expect(c.expires).toBeGreaterThan(Date.now() / 1000 + 25 * 86400);
  }, 150_000);

  let orderId = 0;
  it("order form: submits through the UI (mock provider) and debits the balance once", async () => {
    await sb().rpc("apply_ledger_entry", { p_user: id.u, p_type: "deposit", p_amount: 20_000, p_ref_type: "e2e", p_ref_id: `${run}:u`, p_note: "e2e", p_by: "e2e" });
    const { ctx, page } = await loginUser(uName);
    await page.goto(`/dashboard?service=${SVC}`);
    await page.getByPlaceholder("Tempel link postingan atau profil").fill("https://zt.test/e2e-order");
    await page.getByPlaceholder("Masukkan jumlah").fill("1000");
    await page.getByRole("button", { name: "Pesan Sekarang" }).click();
    // the order row appears first; the provider id follows once the (mock) submit has finished
    await expect.poll(async () => (await sb().from("orders").select("provider_order_id").eq("user_id", id.u)).data?.[0]?.provider_order_id ?? "", { timeout: 40_000 }).toMatch(/^MK-/);
    const o = (await sb().from("orders").select("id,status,provider_order_id,charge,service_id").eq("user_id", id.u).single()).data!;
    orderId = o.id;
    expect(o).toMatchObject({ charge: 1500, service_id: SVC });
    expect(o.provider_order_id).toMatch(/^MK-/);
    expect(await balance(id.u)).toBe(18_500);
    await page.goto("/dashboard/orders");
    await page.waitForLoadState("networkidle");
    await expect.poll(async () => page.locator("body").innerText(), { timeout: 20_000 }).toContain("zt.test/e2e-order");
    await ctx.close();
  }, 150_000);

  let ticketNumber = 0;
  it("ticket: create with an attachment, reply with another, the admin's answer shows in the notification badge", async () => {
    const { ctx, page } = await loginUser(uName);
    await page.goto("/dashboard/tickets");
    // the first subcategory ("Refill") needs an order id: pick one that does not
    await page.getByRole("radiogroup", { name: "Subkategori tiket" }).getByRole("radio", { name: "Lainnya" }).click();
    await page.getByPlaceholder("Jelaskan kendalamu sedetail mungkin").fill("Halo, ini tiket uji end to end dengan lampiran.");
    await page.locator('input[type="file"]').first().setInputFiles({ name: "bukti-e2e.png", mimeType: "image/png", buffer: PNG });
    await page.locator("form button[type=submit]").click();
    await page.waitForURL(/\/dashboard\/tickets\/\d+/, { timeout: 40_000 });
    ticketNumber = Number(new URL(page.url()).pathname.split("/").pop());
    const t = (await sb().from("tickets").select("id,status,user_id").eq("number", ticketNumber).single()).data!;
    expect(t).toMatchObject({ status: "menunggu", user_id: id.u });
    await expect.poll(async () => page.locator("body").innerText(), { timeout: 20_000 }).toContain("tiket uji end to end");
    // reply with a second attachment
    await page.locator('input[type="file"]').first().setInputFiles({ name: "balasan-e2e.png", mimeType: "image/png", buffer: PNG });
    await page.getByPlaceholder("Pesan").fill("Ini balasan dari pengguna.");
    await page.getByRole("button", { name: "Kirim" }).click();
    await expect.poll(async () => (await sb().from("ticket_messages").select("id").eq("ticket_id", t.id)).data?.length ?? 0, { timeout: 30_000 }).toBe(2);
    const msgs = (await sb().from("ticket_messages").select("attachments").eq("ticket_id", t.id)).data!;
    expect(msgs.flatMap((m) => m.attachments as { name: string }[]).map((a) => a.name).sort()).toEqual(["balasan-e2e.png", "bukti-e2e.png"]);
    // the support answer (what replyAsAdmin writes) lights up the bell
    await sb().from("ticket_messages").insert({ ticket_id: t.id, sender: "support", sender_id: id.a, body: "Balasan dari tim support." });
    await sb().from("tickets").update({ status: "dibalas", user_unread: true }).eq("id", t.id);
    await sb().from("notifications").insert({ user_id: id.u, type: "tiket", title: `Tiket #${ticketNumber} dibalas`, body: "Balasan dari tim support.", href: `/dashboard/tickets/${ticketNumber}`, dedupe_key: `e2e:${run}` });
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /Notifikasi, \d+ belum dibaca/ }).first().waitFor({ state: "visible", timeout: 40_000 });
    await ctx.close();
  }, 200_000);

  it("language switcher changes the UI and is saved on the profile", async () => {
    const { ctx, page } = await loginUser(uName);
    await page.getByRole("button", { name: "Bahasa" }).first().click();
    await page.getByRole("menuitemradio", { name: "English" }).click();
    await expect.poll(async () => (await sb().from("profiles").select("language").eq("id", id.u).single()).data!.language, { timeout: 20_000 }).toBe("en");
    await page.goto(`/dashboard?service=${SVC}`);
    await expect.poll(async () => page.locator("body").innerText(), { timeout: 20_000 }).toContain("Order Now");
    await page.getByRole("button", { name: "Language" }).first().click();
    await page.getByRole("menuitemradio", { name: "Indonesia" }).click();
    await expect.poll(async () => (await sb().from("profiles").select("language").eq("id", id.u).single()).data!.language, { timeout: 20_000 }).toBe("id");
    await ctx.close();
  }, 150_000);

  it("admin adjusts a balance and approves a refund through the UI (re-entering the password)", async () => {
    const { ctx, page } = await loginAdmin();
    // --- balance +5.000
    const before = await balance(id.u);
    await page.goto("/admin/users");
    await page.getByPlaceholder("Cari di seluruh data...").fill(uName);
    await page.getByPlaceholder("Cari di seluruh data...").press("Enter");
    await page.getByRole("button", { name: `Aksi untuk ${uName}` }).click();
    await page.getByRole("menuitem", { name: "Tambah saldo" }).click();
    await page.getByLabel("Jumlah (Rp)").fill("5000");
    await page.getByLabel("Alasan").fill("Kompensasi uji e2e");
    await page.getByRole("button", { name: "Lanjutkan" }).click();
    await page.locator('[role="dialog"] input[type="password"], dialog input[type="password"]').last().fill(password);
    await page.getByRole("button", { name: "Tambah saldo", exact: true }).click();
    await expect.poll(() => balance(id.u), { timeout: 30_000 }).toBe(before + 5000);
    expect((await sb().from("balance_ledger").select("note,type").eq("user_id", id.u).eq("type", "adjustment")).data).toEqual([{ note: "Kompensasi uji e2e", type: "adjustment" }]);
    expect((await sb().from("audit_logs").select("id").eq("action", "user.balance.adjust").eq("target_id", id.u)).data).toHaveLength(1);

    // --- refund approval (a waiting manual refund of Rp 500)
    const mid = await balance(id.u);
    const created = await sb().rpc("create_refund_for_order", { p_order: orderId, p_reason: "manual", p_amount: 500, p_source: "admin", p_by: id.a, p_note: "Refund uji e2e", p_settle: false });
    expect(created.error).toBeNull();
    await page.goto("/admin/refunds");
    await page.waitForLoadState("networkidle");
    const menu = page.getByRole("button", { name: `Aksi untuk refund pesanan ${orderId}` });
    await menu.waitFor({ timeout: 15_000 }).catch(async () => { throw new Error(`refund row not found. Page text: ${(await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 700)}`); });
    await menu.click();
    await page.getByRole("menuitem", { name: "Setujui dan kembalikan saldo" }).click();
    await page.locator('[role="dialog"] input[type="password"], dialog input[type="password"]').last().fill(password);
    await page.getByRole("button", { name: "Kembalikan saldo", exact: true }).click();
    await expect.poll(() => balance(id.u), { timeout: 30_000 }).toBe(mid + 500);
    expect((await sb().from("refunds").select("status").eq("order_id", orderId).eq("reason", "manual").single()).data!.status).toBe("selesai");
    await ctx.close();
  }, 250_000);

  it("admin blocks a user: a reason is required, it goes to the audit log, the session ends and login says the generic message", async () => {
    const bName = `zt_k_${run}`;
    const { data: made, error: me } = await sb().auth.admin.createUser({ email: email(bName), password, email_confirm: true, user_metadata: { username: bName } });
    expect(me).toBeNull();
    id.k = made.user!.id;
    const status = async () => (await sb().from("profiles").select("status").eq("id", id.k).single()).data!.status;
    const user = await loginUser(bName); // signed in BEFORE the block
    const { ctx, page } = await loginAdmin();
    await page.goto("/admin/users");
    await page.getByPlaceholder("Cari di seluruh data...").fill(bName);
    await page.getByPlaceholder("Cari di seluruh data...").press("Enter");
    await page.getByRole("button", { name: `Aksi untuk ${bName}` }).click();
    await page.getByRole("menuitem", { name: "Blokir" }).click();
    const fillConfirm = async () => {
      await page.getByLabel("Ketik BLOKIR untuk konfirmasi").fill("BLOKIR");
      await page.locator('[role="dialog"] input[type="password"], dialog input[type="password"]').last().fill(password);
    };
    // 1. without a reason nothing happens
    await fillConfirm();
    await page.getByRole("button", { name: "Blokir", exact: true }).click();
    await page.getByText("Pilih alasan pemblokiran.").first().waitFor({ timeout: 20_000 });
    expect(await status()).toBe("aktif");
    // the dialog keeps what was typed when the server rejects the form
    expect(await page.getByLabel("Ketik BLOKIR untuk konfirmasi").inputValue()).toBe("BLOKIR");
    expect(await page.locator('[role="dialog"] input[type="password"], dialog input[type="password"]').last().inputValue()).toBe(password);
    // 2. with the content-policy reason it is blocked
    const options = await page.locator("select option").allInnerTexts();
    expect(options).toContain("Pelanggaran kebijakan konten");
    await page.locator("select").selectOption("Pelanggaran kebijakan konten");
    await page.getByRole("button", { name: "Blokir", exact: true }).click();
    await expect.poll(status, { timeout: 30_000 }).toBe("diblokir");
    const logRows = async () => (await sb().from("audit_logs").select("action,admin_id,before,after").eq("action", "user.ban").eq("target_id", id.k)).data ?? [];
    await expect.poll(async () => (await logRows()).length, { timeout: 20_000 }).toBe(1); // the audit row is written right after the status flips
    const log = await logRows();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ admin_id: id.a, before: { status: "aktif" }, after: { status: "diblokir", reason: "Pelanggaran kebijakan konten" } });
    await ctx.close();
    // 3. the session that was open is gone: the dashboard sends the user to the login page
    await user.page.goto("/dashboard");
    await expect.poll(() => new URL(user.page.url()).pathname, { timeout: 30_000 }).toBe("/login");
    await user.ctx.close();
    // 4. login is refused with the generic message
    const fresh = await browser.newContext({ baseURL: BASE });
    const lp = await fresh.newPage();
    await lp.goto("/login");
    await lp.getByPlaceholder("nama_pengguna").fill(bName);
    await lp.getByPlaceholder("Minimal 8 karakter").fill(password);
    await lp.getByRole("button", { name: "Masuk", exact: true }).click();
    await expect.poll(async () => lp.locator("body").innerText(), { timeout: 30_000 }).toContain("Akun kamu dibekukan. Hubungi bantuan.");
    expect(new URL(lp.url()).pathname).toBe("/login");
    await fresh.close();
  }, 250_000);

  it("another user cannot open this user's order or ticket by id, and a non-admin is blocked from /admin and the admin APIs", async () => {
    const { ctx, page } = await loginUser(vName);
    // the ticket page of someone else's ticket behaves like a ticket that does not exist
    await page.goto(`/dashboard/tickets/${ticketNumber}`);
    await page.waitForLoadState("networkidle");
    const text = await page.locator("body").innerText();
    expect(text).not.toContain("tiket uji end to end");
    expect(text).not.toContain("bukti-e2e.png");
    // the orders page lists only the viewer's orders, even when the id is searched for
    await page.goto(`/dashboard/orders?search=${orderId}`);
    await page.waitForLoadState("networkidle");
    expect(await page.locator("body").innerText()).not.toContain("zt.test/e2e-order");
    // the database itself refuses it with this user's real session
    const c = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    await c.auth.signInWithPassword({ email: email(vName), password });
    expect((await c.from("orders").select("id").eq("id", orderId)).data ?? []).toHaveLength(0);
    expect((await c.from("tickets").select("id").eq("number", ticketNumber)).data ?? []).toHaveLength(0);
    expect((await c.from("ticket_messages").select("id")).data ?? []).toHaveLength(0);
    expect((await c.from("notifications").select("id").eq("user_id", id.u)).data ?? []).toHaveLength(0);
    // non-admin: /admin and the admin endpoints
    await page.goto("/admin/users");
    await expect.poll(() => new URL(page.url()).pathname, { timeout: 20_000 }).toBe("/dashboard");
    expect((await ctx.request.get("/api/admin/services")).status()).toBe(401);
    expect((await ctx.request.get("/api/admin/ledger/export")).status()).toBe(401);
    expect((await ctx.request.get("/api/admin/services/export")).status()).toBe(401);
    await ctx.close();
  }, 200_000);

  it("a backup code explains in Indonesian that it removes the authenticator, and changes nothing until the admin confirms", async () => {
    const db = sb();
    const bName = `zt_b_${run}`;
    const { data: made } = await db.auth.admin.createUser({ email: email(bName), password, email_confirm: true, user_metadata: { username: bName } });
    id.b = made.user!.id;
    await db.from("profiles").update({ role: "admin" }).eq("id", id.b);
    const c = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    await c.auth.signInWithPassword({ email: email(bName), password });
    const enrol = await c.auth.mfa.enroll({ factorType: "totp", issuer: "JagoanSosmed" });
    const secret = enrol.data!.totp.secret;
    const bCode = () => new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30 }).generate();
    expect((await c.auth.mfa.challengeAndVerify({ factorId: enrol.data!.id, code: bCode() })).error).toBeNull();
    expect((await db.from("admin_backup_codes").insert({ admin_id: id.b, code_hash: hashPassword("abcd-efgh") })).error).toBeNull();
    const factors = async () => (await db.auth.admin.mfa.listFactors({ userId: id.b })).data?.factors?.length ?? 0;

    const ctx = await browser.newContext({ baseURL: BASE });
    const page = await ctx.newPage();
    await page.goto("/admin/login");
    await page.getByPlaceholder("nama_admin").fill(bName);
    await page.getByPlaceholder("Password admin").fill(password);
    await page.locator("form button[type=submit]").click();
    await page.getByPlaceholder("000000").waitFor({ timeout: 30_000 });
    await page.getByPlaceholder("000000").fill("abcd-efgh");
    await page.locator("form button[type=submit]").click();
    const dialog = page.getByRole("alertdialog");
    await dialog.waitFor({ timeout: 20_000 });
    const warning = await dialog.innerText();
    expect(warning).toContain("MENONAKTIFKAN verifikasi dua langkah");
    expect(warning).toContain("mengatur ulang");
    expect(await factors()).toBe(1); // nothing removed yet
    expect((await db.from("admin_backup_codes").select("used_at").eq("admin_id", id.b)).data![0].used_at).toBeNull(); // and the code is not consumed yet
    await dialog.getByRole("button", { name: "Batal" }).click();
    expect(await factors()).toBe(1);
    // now confirm
    await page.getByPlaceholder("000000").fill("abcd-efgh");
    await page.locator("form button[type=submit]").click();
    await page.getByRole("alertdialog").getByRole("button", { name: /Ya, nonaktifkan/ }).click();
    await expect.poll(factors, { timeout: 30_000 }).toBe(0);
    await expect.poll(async () => page.locator("body").innerText(), { timeout: 30_000 }).toContain("Masuk lagi dengan password");
    await page.getByPlaceholder("nama_admin").fill(bName);
    await page.getByPlaceholder("Password admin").fill(password);
    await page.locator("form button[type=submit]").click();
    await expect.poll(() => new URL(page.url()).pathname, { timeout: 30_000 }).toBe("/admin/setup-2fa"); // must enrol again before the panel opens
    expect((await db.from("admin_backup_codes").select("id").eq("admin_id", id.b)).data ?? []).toHaveLength(0);
    await ctx.close();
  }, 200_000);

  it("the cron endpoints answer 401 without the Bearer secret and never leak it", async () => {
    const ctx = await browser.newContext({ baseURL: BASE });
    for (const path of ["/api/cron/sync-orders", "/api/cron/sanity", "/api/cron/stats-refresh"]) {
      const none = await ctx.request.post(path);
      expect(none.status()).toBe(401);
      const wrong = await ctx.request.post(path, { headers: { Authorization: "Bearer nope" } });
      expect(wrong.status()).toBe(401);
      const secret = env.CRON_SECRET;
      if (secret) expect(await wrong.text()).not.toContain(secret);
    }
    if (env.CRON_SECRET) {
      const ok = await ctx.request.post("/api/cron/sanity", { headers: { Authorization: `Bearer ${env.CRON_SECRET}` } });
      expect([200, 202]).toContain(ok.status());
    }
    await ctx.close();
  }, 60_000);
});
