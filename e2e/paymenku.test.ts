/**
 * Paymenku top-up in a real browser against `next start` and the linked DEV Supabase project, with a FAKE Paymenku (a tiny HTTP server this test starts on
 * port 3199; scripts/run-e2e.mjs points PAYMENKU_API_BASE at it for this file only). Covers: admin settings (mode banner, channels, enable), choosing QRIS,
 * the payment page (QR, amounts, countdown), a signed webhook crediting exactly once, a replay, a wrong signature, another user's page (404),
 * the admin deposit detail / "Cek status ke Paymenku", and cancelling a pending deposit. Refuses to run unless the Supabase URL is the DEV project.
 */
import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
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
const WH_SECRET = "e2e-whsec-fake";
const FAKE_PORT = 3199;
// a 1x1 PNG served as the "QR"
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");

type Tx = { trx_id: string; reference_id: string; amount: number; status: string; channel: string; base: number; idem: string };

describe.skipIf(!enabled || process.env.E2E_PAYMENKU !== "1")("paymenku top-up with a fake gateway", () => {
  const MARKER = "pk";
  const run = MARKER + Math.random().toString(36).slice(2, 7);
  const password = `Pmk-${run}-Pass12`;
  const uName = `zt_pu_${run}`;
  const u2Name = `zt_pv_${run}`;
  const aName = `zt_pa_${run}`;
  const email = (n: string) => `${n}@jagoansosmed-test.invalid`;
  let browser: Browser;
  let user: Page;
  let user2: Page;
  let admin: Page;
  let totpSecret = "";
  let fake: Server;
  let originalSettings: unknown = null;
  const id: Record<string, string> = {};
  const txs = new Map<string, Tx>();
  const sb = () => createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const code = () => new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(totpSecret), digits: 6, period: 30 }).generate();
  let lastUsed = "";
  const freshCode = async () => {
    for (let i = 0; i < 70 && code() === lastUsed; i++) await new Promise((r) => setTimeout(r, 500));
    lastUsed = code();
    return lastUsed;
  };
  const balance = async (uid: string) => Number((await sb().from("profiles").select("balance").eq("id", uid).single()).data!.balance);
  const ledger = async (depId: string) => ((await sb().from("balance_ledger").select("amount,type").eq("ref_type", "deposit").eq("ref_id", depId)).data ?? []).filter((l) => l.type === "deposit");
  const body = (t: Tx) => JSON.stringify({ event: "payment.status_updated", trx_id: t.trx_id, reference_id: t.reference_id, status: t.status, amount: `${t.amount}.00`, total_fee: `${t.amount - t.base}.00`, amount_received: `${t.base}.00`, payment_channel: t.channel, customer_name: "x", customer_email: "x@x.id", is_sandbox: true });
  const sendWebhook = async (t: Tx, over: { secret?: string; ts?: string } = {}) => {
    const raw = body(t);
    const ts = over.ts ?? String(Math.floor(Date.now() / 1000));
    const sig = createHmac("sha256", over.secret ?? WH_SECRET).update(`${ts}.${raw}`).digest("hex");
    return fetch(`${BASE}/api/webhooks/paymenku`, { method: "POST", headers: { "Content-Type": "application/json", "X-PaymenKu-Signature": sig, "X-PaymenKu-Timestamp": ts }, body: raw });
  };
  const loginUser = async (page: Page, name: string) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.getByPlaceholder("nama_pengguna").fill(name);
    await page.getByPlaceholder("Minimal 8 karakter").fill(password);
    await page.getByRole("button", { name: "Masuk", exact: true }).click();
    await page.waitForURL("**/dashboard", { timeout: 30_000 });
  };

  beforeAll(async () => {
    const ref = env.SUPABASE_DEV_PROJECT_REF;
    if (!ref || new URL(url).hostname !== `${ref}.supabase.co`) throw new Error("Refusing to run: SUPABASE_DEV_PROJECT_REF does not match NEXT_PUBLIC_SUPABASE_URL.");
    await cleanupOrFail({ marker: MARKER });
    // the fake Paymenku: the documented endpoints, the documented envelope, a decimal-string amount and a customer-borne QRIS fee (Rp 200 + 0,7%)
    fake = createServer((req, res) => {
      const send = (status: number, json: unknown) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(json));
      };
      if (req.headers.authorization !== "Bearer sk_test_e2e_fake") return send(401, { status: "error", message: "Unauthorized. Invalid API Token." });
      const path = new URL(req.url ?? "/", "http://x").pathname.replace(/^\/+/, "");
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        if (req.method === "GET" && path === "payment-channels") {
          return send(200, { status: "success", data: [{ code: "qris", name: "QRIS", type: "qris", group: "QRIS", flow_type: "direct", fee_mode: "customer", fee_flat: 200, fee_percent: 0.7, min_amount: 1000, max_amount: 10_000_000 }] });
        }
        if (req.method === "GET" && path === "wallet/balance") return send(200, { success: true, data: { balance: "36793.00", currency: "IDR" } });
        if (req.method === "POST" && path === "transaction/create") {
          const b = JSON.parse(raw) as { channel_code: string; amount: number; reference_id: string };
          const fee = Math.ceil(200 + (b.amount * 0.7) / 100);
          const t: Tx = { trx_id: `zt-${run}-${txs.size + 1}`, reference_id: b.reference_id, amount: b.amount + fee, status: "pending", channel: b.channel_code, base: b.amount, idem: String(req.headers["idempotency-key"]) };
          txs.set(t.trx_id, t);
          return send(200, { status: "success", data: { trx_id: t.trx_id, reference_id: t.reference_id, amount: `${t.amount}.00`, status: "pending", pay_url: `http://localhost:${FAKE_PORT}/pay/${t.trx_id}`, payment_info: { transaction_id: `SANDBOX-${t.trx_id}`, transaction_status: "pending", qr_url: `http://localhost:${FAKE_PORT}/qr/${t.trx_id}.png`, qr_string: "x", expiration_date: new Date(Date.now() + 15 * 60_000).toISOString(), sandbox: true, simulator_url: `http://localhost:${FAKE_PORT}/sim/${t.trx_id}` } } });
        }
        if (req.method === "GET" && path.startsWith("check-status/")) {
          const key = decodeURIComponent(path.split("/")[1]);
          const t = [...txs.values()].find((x) => x.trx_id === key || x.reference_id === key);
          if (!t) return send(404, { status: "error", message: "Transaction not found" });
          return send(200, { status: "success", data: { trx_id: t.trx_id, reference_id: t.reference_id, amount: `${t.amount}.00`, total_fee: `${t.amount - t.base}.00`, amount_received: `${t.base}.00`, status: t.status, is_sandbox: true, payment_channel: { code: t.channel, name: "QRIS", type: "qris" }, paid_at: t.status === "paid" ? new Date().toISOString() : null } });
        }
        if (req.method === "POST" && path === "transaction/cancel") {
          const t = txs.get((JSON.parse(raw) as { trx_id: string }).trx_id);
          if (!t) return send(404, { status: "error", message: "Transaction not found" });
          if (t.status !== "pending") return send(422, { status: "error", message: `Cannot cancel transaction with status '${t.status}'.` });
          t.status = "cancelled";
          return send(200, { status: "success", message: "Transaction cancelled (sandbox)", data: { trx_id: t.trx_id, status: "cancelled" } });
        }
        if (req.method === "GET" && path.startsWith("qr/")) {
          res.writeHead(200, { "Content-Type": "image/png" });
          return res.end(PNG);
        }
        return send(404, { status: "error", message: "Not found" });
      });
    });
    await new Promise<void>((r) => fake.listen(FAKE_PORT, r));

    const db = sb();
    const mk = async (n: string) => {
      const { data, error } = await db.auth.admin.createUser({ email: email(n), password, email_confirm: true, user_metadata: { username: n } });
      if (error || !data.user) throw new Error(error?.message);
      return data.user.id;
    };
    id.u = await mk(uName);
    id.v = await mk(u2Name);
    id.a = await mk(aName);
    await db.from("profiles").update({ role: "admin" }).eq("id", id.a);
    originalSettings = ((await db.from("site_settings").select("data").maybeSingle()).data?.data ?? {}) as unknown;
    const c = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    await c.auth.signInWithPassword({ email: email(aName), password });
    const enrol = await c.auth.mfa.enroll({ factorType: "totp", issuer: "JagoanSosmed" });
    totpSecret = enrol.data!.totp.secret;
    expect((await c.auth.mfa.challengeAndVerify({ factorId: enrol.data!.id, code: await freshCode() })).error).toBeNull();
    browser = await chromium.launch();
    user = await (await browser.newContext({ baseURL: BASE })).newPage();
    user2 = await (await browser.newContext({ baseURL: BASE })).newPage();
    admin = await (await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 } })).newPage();
    await loginUser(user, uName);
    await loginUser(user2, u2Name);
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
    await new Promise<void>((r) => (fake ? fake.close(() => r()) : r()));
    // put the site settings back exactly as they were (the gateway is off again)
    if (originalSettings !== null) await sb().from("site_settings").upsert({ id: true, data: originalSettings as never });
    await cleanupOrFail({ marker: MARKER });
  }, 300_000);

  const bodyText = (p: Page) => p.locator("body").innerText();

  it("admin settings: the MODE SANDBOX banner, a connection test, channels from Paymenku, enable and save", async () => {
    await admin.goto("/admin/settings/payments");
    await admin.waitForLoadState("networkidle").catch(() => {});
    const panel = admin.getByTestId("paymenku-settings");
    await panel.waitFor({ timeout: 30_000 });
    expect(await admin.getByTestId("paymenku-mode").innerText()).toContain("MODE SANDBOX");
    expect(await panel.getByLabel("Alamat webhook (daftarkan di dashboard Paymenku)").inputValue()).toMatch(/\/api\/webhooks\/paymenku$/);
    await panel.getByRole("button", { name: "Uji koneksi" }).click();
    await expect.poll(async () => bodyText(admin), { timeout: 20_000 }).toContain("Terhubung ke Paymenku (SANDBOX)");
    await panel.getByRole("button", { name: "Segarkan kanal" }).click();
    const sw = panel.getByRole("switch", { name: "Aktifkan kanal QRIS" });
    await sw.waitFor({ timeout: 20_000 });
    if ((await sw.getAttribute("aria-checked")) !== "true") await sw.click();
    const enable = panel.getByRole("switch", { name: "Aktifkan Paymenku" });
    if ((await enable.getAttribute("aria-checked")) !== "true") await enable.click();
    await panel.getByRole("button", { name: "Simpan pengaturan Paymenku" }).click();
    await expect.poll(async () => bodyText(admin), { timeout: 20_000 }).toContain("Pengaturan Paymenku disimpan.");
    const saved = ((await sb().from("site_settings").select("data").single()).data!.data as { payments: { gateway: { enabled: boolean; channels: string[]; maxDeposit: number } } }).payments.gateway;
    expect(saved).toMatchObject({ enabled: true, channels: ["qris"], maxDeposit: 5_000_000 });
  }, 150_000);

  let depId = "";
  let trx: Tx;

  it("Tambah Saldo: QRIS is offered with the fee stated; paying creates the deposit and opens its payment page", async () => {
    await user.goto("/dashboard/add-funds");
    await user.waitForLoadState("networkidle").catch(() => {});
    await user.getByLabel("Jumlah").fill("50000");
    const fee = user.getByTestId("fee-info");
    await expect.poll(async () => fee.innerText(), { timeout: 15_000 }).toContain("Biaya layanan");
    expect(await fee.innerText()).toMatch(/ditanggung kamu/);
    expect(await fee.innerText()).toMatch(/saldo yang masuk tetap Rp\s?50\.000/);
    await user.getByRole("button", { name: "Bayar sekarang" }).click();
    await user.waitForURL(/\/deposit\/[0-9a-f-]{36}$/, { timeout: 40_000 });
    depId = new URL(user.url()).pathname.split("/").pop()!;
    trx = [...txs.values()].find((t) => t.reference_id === depId)!;
    expect(trx).toBeTruthy();
    expect(trx.idem).toBe(depId); // Idempotency-Key = our deposit id
    expect(trx.base).toBe(50_000);
    const row = (await sb().from("deposits").select("status,gateway,amount,pay_amount,fee_amount,external_id,is_sandbox,payment_info").eq("id", depId).single()).data!;
    expect(row).toMatchObject({ status: "menunggu", gateway: "paymenku", amount: 50_000, pay_amount: 50_550, fee_amount: 550, external_id: trx.trx_id, is_sandbox: true });
  }, 150_000);

  it("the payment page shows the QR, both amounts, the countdown and the waiting status; another user sees only the 404 view", async () => {
    await user.getByTestId("deposit-pay").waitFor({ timeout: 30_000 });
    expect(await user.getByTestId("deposit-status").innerText()).toContain("Menunggu pembayaran");
    expect(await user.getByTestId("deposit-amount").innerText()).toMatch(/50\.000/);
    expect(await user.getByTestId("deposit-pay-amount").innerText()).toMatch(/50\.550/);
    expect(await user.getByTestId("deposit-countdown").innerText()).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    const qr = user.locator("img[alt='Kode QRIS']");
    expect(await qr.getAttribute("src")).toContain(`/qr/${trx.trx_id}.png`);
    // not found for anybody else: the page renders the 404 view (the route streams, so the status line may already be 200) and none of the payment data
    await user2.goto(`/deposit/${depId}`);
    await expect.poll(async () => bodyText(user2), { timeout: 20_000 }).toMatch(/404|could not be found|tidak ditemukan/i);
    expect(await user2.getByTestId("deposit-pay").count()).toBe(0);
    expect(await bodyText(user2)).not.toContain(trx.trx_id);
    expect(await user2.locator("img[alt='Kode QRIS']").count()).toBe(0);
  }, 90_000);

  it("a webhook with a wrong signature or a stale timestamp changes nothing", async () => {
    trx.status = "paid";
    const before = await balance(id.u);
    expect((await sendWebhook(trx, { secret: "wrong-secret" })).status).toBe(401);
    expect((await sendWebhook(trx, { ts: String(Math.floor(Date.now() / 1000) - 3600) })).status).toBe(401);
    expect(await balance(id.u)).toBe(before);
    expect((await sb().from("deposits").select("status").eq("id", depId).single()).data!.status).toBe("menunggu");
    trx.status = "pending";
  }, 60_000);

  it("the signed webhook credits exactly Rp 50.000 once (the fee is not credited); the page flips to 'Pembayaran diterima'; a replay credits nothing", async () => {
    const before = await balance(id.u);
    trx.status = "paid";
    expect((await sendWebhook(trx)).status).toBe(200);
    await expect.poll(async () => (await sb().from("deposits").select("status").eq("id", depId).single()).data!.status, { timeout: 20_000 }).toBe("berhasil");
    expect(await balance(id.u)).toBe(before + 50_000);
    expect((await ledger(depId)).map((l) => Number(l.amount))).toEqual([50_000]);
    await expect.poll(async () => user.getByTestId("deposit-status").innerText(), { timeout: 30_000 }).toContain("Pembayaran diterima");
    expect((await sendWebhook(trx)).status).toBe(200);
    expect((await sendWebhook(trx)).status).toBe(200);
    expect(await ledger(depId)).toHaveLength(1);
    expect(await balance(id.u)).toBe(before + 50_000);
  }, 120_000);

  it("admin deposits: the Paymenku deposit has a detail view and 'Cek status ke Paymenku', and no manual confirmation", async () => {
    await admin.goto("/admin/deposits");
    await admin.waitForLoadState("networkidle").catch(() => {});
    const row = admin.locator("table").getByRole("row", { name: new RegExp(depId.slice(0, 8)) });
    await row.waitFor({ timeout: 30_000 });
    await row.getByRole("button", { name: /Aksi untuk deposit/ }).click();
    const items = await admin.getByRole("menuitem").allInnerTexts();
    expect(items.join("|")).toContain("Cek status ke Paymenku");
    expect(items.join("|")).not.toContain("Konfirmasi manual");
    await admin.getByRole("menuitem", { name: "Detail" }).click();
    const detail = admin.getByTestId("deposit-detail");
    await detail.waitFor({ timeout: 15_000 });
    const text = await detail.innerText();
    expect(text).toContain(trx.trx_id);
    expect(text).toContain("SANDBOX");
    expect(text).not.toContain("sk_test");
    await admin.keyboard.press("Escape");
    await row.getByRole("button", { name: /Aksi untuk deposit/ }).click();
    await admin.getByRole("menuitem", { name: "Cek status ke Paymenku" }).click();
    await expect.poll(async () => bodyText(admin), { timeout: 20_000 }).toMatch(/sudah dikreditkan|Status diperbarui/);
    expect(await ledger(depId)).toHaveLength(1);
  }, 150_000);

  it("a pending deposit can be cancelled by its owner", async () => {
    await user.goto("/dashboard/add-funds");
    await user.waitForLoadState("networkidle").catch(() => {});
    await user.getByLabel("Jumlah").fill("20000");
    await user.getByRole("button", { name: "Bayar sekarang" }).click();
    await user.waitForURL(/\/deposit\/[0-9a-f-]{36}$/, { timeout: 40_000 });
    const second = new URL(user.url()).pathname.split("/").pop()!;
    await user.getByRole("button", { name: "Batalkan deposit" }).click();
    const dialog = user.getByRole("dialog");
    await dialog.waitFor();
    await dialog.getByRole("button", { name: "Batalkan deposit" }).click();
    await expect.poll(async () => (await sb().from("deposits").select("status").eq("id", second).single()).data!.status, { timeout: 30_000 }).toBe("dibatalkan");
    await expect.poll(async () => user.getByTestId("deposit-status").innerText(), { timeout: 30_000 }).toContain("Dibatalkan");
    expect(await balance(id.u)).toBe(50_000);
  }, 150_000);
});
