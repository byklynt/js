/**
 * Paymenku top-ups against the linked DEV Supabase project with a FAKE Paymenku (no network): webhook verification and idempotency, amount / sandbox /
 * transaction checks, late payment and refund policies, reconciliation of a lost webhook, RLS, creation limits. Run with: npm run test:db
 * (node scripts/run-db-tests.mjs paymenku)
 */
import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanupOrFail } from "../../../scripts/lib/test-cleanup.mjs";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {}, updateTag: () => {} }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }), cookies: async () => ({ get: () => undefined, getAll: () => [], set: () => {} }) }));

const fileEnv: Record<string, string> = {};
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0 && !line.trim().startsWith("#")) fileEnv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
}
for (const [k, v] of Object.entries(fileEnv)) if (process.env[k] === undefined) process.env[k] = v;
const enabled = process.env.RUN_DB_TESTS === "1" && Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY));

type FakeTx = { trxId: string; referenceId: string; amount: number; totalFee: number; amountReceived: number; status: "pending" | "paid" | "expired" | "failed" | "cancelled" | "refunded"; isSandbox: boolean; payUrl: string | null; channelCode: string | null; paidAt: string | null; paymentInfo: Record<string, unknown> };

describe.skipIf(!enabled)("paymenku top-ups (fake gateway)", () => {
  const MARKER = "pm";
  const run = MARKER + Math.random().toString(36).slice(2, 7);
  const SECRET = `zt-whsec-${run}`;
  const AMOUNT = 20_000;
  const FEE = 305; // a customer-borne fee: the customer pays 20.305, the balance gets 20.000
  let seq = 0;
  let m: {
    db: ReturnType<typeof import("@/lib/server/supabase-admin").supabaseAdmin>;
    gw: typeof import("@/lib/server/payments/deposits-gateway");
  };
  let userA = "";
  let userB = "";
  let emailA = "";
  const password = `Pmk-${run}-pass1`;
  /** What the fake Paymenku knows, by trx id. */
  const world = new Map<string, FakeTx>();
  const calls: string[] = [];
  const fake = () => ({
    checkStatus: async (id: string) => {
      calls.push(`check:${id}`);
      const tx = [...world.values()].find((t) => t.trxId === id || t.referenceId === id);
      if (!tx) throw Object.assign(new Error("Transaction not found"), { name: "PaymenkuError", kind: "rejected", status: 404 });
      return { ...tx };
    },
    cancelTransaction: async (id: string) => {
      calls.push(`cancel:${id}`);
      return { status: "cancelled" };
    },
    createTransaction: async (i: { channelCode: string; amount: number; referenceId: string; idempotencyKey: string }) => {
      calls.push(`create:${i.idempotencyKey}`);
      const tx: FakeTx = { trxId: `zt-${run}-c${++seq}`, referenceId: i.referenceId, amount: i.amount + FEE, totalFee: FEE, amountReceived: i.amount, status: "pending", isSandbox: true, payUrl: "https://paymenku.com/pay/x", channelCode: i.channelCode, paidAt: null, paymentInfo: { qr_url: "https://paymenku.com/api/qris/x", expiration_date: new Date(Date.now() + 900_000).toISOString(), secret_internal: "never stored" } };
      world.set(tx.trxId, tx);
      return tx;
    },
    listChannels: async () => [{ code: "qris", name: "QRIS", type: "qris", group: "QRIS", flowType: "direct", feeMode: "customer" as const, feeFlat: 200, feePercent: 0.7, minAmount: 1000, maxAmount: 10_000_000 }],
  });
  const client = () => fake() as never;

  const newUser = async (label: string) => {
    const username = `zt_${label}_${run}`.slice(0, 24);
    const email = `${username}@jagoansosmed-test.invalid`;
    const { data, error } = await m.db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username } });
    if (error || !data.user) throw new Error(error?.message);
    return { id: data.user.id, email };
  };
  const balance = async (id: string) => Number((await m.db.from("profiles").select("balance").eq("id", id).single()).data!.balance);
  const ledger = async (depositId: string) => ((await m.db.from("balance_ledger").select("amount,type").eq("ref_type", "deposit").eq("ref_id", depositId)).data ?? []).filter((l) => l.type === "deposit");
  const dep = async (id: string) => (await m.db.from("deposits").select("*").eq("id", id).single()).data!;

  /** A pending Paymenku deposit with its transaction in the fake world. */
  async function makeDeposit(o: { user?: string; status?: string; sandbox?: boolean; ageMinutes?: number; txStatus?: FakeTx["status"]; amount?: number } = {}) {
    const trx = `zt-${run}-${++seq}`;
    const amount = o.amount ?? AMOUNT;
    const { data, error } = await m.db.from("deposits").insert({
      user_id: o.user ?? userA, method: "QRIS", amount, status: o.status ?? "menunggu", gateway: "paymenku", channel_code: "qris", external_id: trx, pay_amount: amount + FEE, fee_amount: FEE,
      is_sandbox: o.sandbox ?? true, gateway_status: "pending", expires_at: new Date(Date.now() + 900_000).toISOString(), ...(o.ageMinutes ? { created_at: new Date(Date.now() - o.ageMinutes * 60_000).toISOString() } : {}),
    }).select("id").single();
    expect(error).toBeNull();
    const id = data!.id as string;
    world.set(trx, { trxId: trx, referenceId: id, amount: amount + FEE, totalFee: FEE, amountReceived: amount, status: o.txStatus ?? "pending", isSandbox: true, payUrl: null, channelCode: "qris", paidAt: o.txStatus === "paid" ? new Date().toISOString() : null, paymentInfo: {} });
    return { id, trx };
  }
  const hook = (id: string, trx: string, status: string, over: Record<string, unknown> = {}) => {
    const body = JSON.stringify({ event: "payment.status_updated", trx_id: trx, reference_id: id, status, amount: `${AMOUNT + FEE}.00`, total_fee: `${FEE}.00`, amount_received: `${AMOUNT}.00`, payment_channel: "qris", customer_name: "Budi PRIVAT", customer_email: "budi@privat.example", paid_at: new Date().toISOString(), is_sandbox: true, ...over });
    const ts = String(Math.floor(Date.now() / 1000));
    return { rawBody: body, timestamp: ts, signature: createHmac("sha256", SECRET).update(`${ts}.${body}`).digest("hex") };
  };
  const send = (h: ReturnType<typeof hook>, deps: Record<string, unknown> = {}) => m.gw.handlePaymenkuWebhook(h, { secret: SECRET, client: client(), sandbox: true, ...deps });
  const pay = (trx: string) => {
    const t = world.get(trx)!;
    world.set(trx, { ...t, status: "paid", paidAt: new Date().toISOString() });
  };

  beforeAll(async () => {
    const ref = process.env.SUPABASE_DEV_PROJECT_REF;
    if (!ref || new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname !== `${ref}.supabase.co`) throw new Error("Refusing to run: SUPABASE_DEV_PROJECT_REF does not match NEXT_PUBLIC_SUPABASE_URL.");
    m = { db: (await import("@/lib/server/supabase-admin")).supabaseAdmin(), gw: await import("@/lib/server/payments/deposits-gateway") };
    await cleanupOrFail({ marker: MARKER });
    const a = await newUser("a");
    const b = await newUser("b");
    userA = a.id;
    userB = b.id;
    emailA = a.email;
  }, 240_000);

  afterAll(async () => {
    await cleanupOrFail({ marker: MARKER });
  }, 300_000);

  it("a wrong signature is rejected (401) and a rejection is logged without the body; nothing is credited", async () => {
    const d = await makeDeposit();
    pay(d.trx);
    const h = hook(d.id, d.trx, "paid");
    const before = await balance(userA);
    expect((await send({ ...h, signature: "0".repeat(64) })).status).toBe(401);
    expect((await send({ ...h, rawBody: h.rawBody.replace("paid", "paid ") })).status).toBe(401); // tampered
    expect((await send({ ...h, timestamp: String(Number(h.timestamp) - 3600) })).status).toBe(401); // stale
    expect((await send({ ...h, signature: null } as never)).status).toBe(401);
    expect((await m.gw.handlePaymenkuWebhook(h, { secret: undefined, client: client() })).status).toBe(401); // no secret configured
    expect(await balance(userA)).toBe(before);
    expect((await dep(d.id)).status).toBe("menunggu");
    const logs = (await m.db.from("audit_logs").select("after").eq("action", "webhook.rejected").order("created_at", { ascending: false }).limit(5)).data ?? [];
    expect(logs.length).toBeGreaterThan(0);
    expect(JSON.stringify(logs)).not.toContain("PRIVAT");
  }, 60_000);

  it("a valid paid webhook credits exactly the agreed amount once (the fee is not credited), notifies the user and logs it", async () => {
    const d = await makeDeposit();
    pay(d.trx);
    const before = await balance(userA);
    const r = await send(hook(d.id, d.trx, "paid"));
    expect(r).toMatchObject({ status: 200, body: { ok: true } });
    const row = await dep(d.id);
    expect(row).toMatchObject({ status: "berhasil", gateway_status: "paid", fee_amount: FEE, needs_review: false });
    expect(row.paid_at).not.toBeNull();
    expect(await balance(userA)).toBe(before + AMOUNT + Number(row.bonus));
    expect((await ledger(d.id)).map((l) => Number(l.amount))).toEqual([AMOUNT]);
    const notif = (await m.db.from("notifications").select("title").eq("user_id", userA).like("title", "Deposit%")).data ?? [];
    expect(notif.length).toBeGreaterThan(0);
    const audit = (await m.db.from("audit_logs").select("action").eq("target_id", d.id).eq("action", "deposit.paymenku_credit")).data ?? [];
    expect(audit).toHaveLength(1);
    // the stored event has no customer data
    const ev = (await m.db.from("webhook_events").select("payload").eq("external_id", `${d.trx}:paid`).single()).data!;
    expect(JSON.stringify(ev.payload)).not.toContain("PRIVAT");
  }, 60_000);

  it("a replay and many concurrent duplicates credit exactly once (one ledger row)", async () => {
    const d = await makeDeposit();
    pay(d.trx);
    const before = await balance(userA);
    const h = hook(d.id, d.trx, "paid");
    const results = await Promise.all(Array.from({ length: 6 }, () => send(h)));
    expect(results.every((r) => r.status === 200)).toBe(true);
    const again = await send(hook(d.id, d.trx, "paid"));
    expect(again.status).toBe(200);
    expect(await ledger(d.id)).toHaveLength(1);
    expect(await balance(userA)).toBe(before + AMOUNT + Number((await dep(d.id)).bonus));
  }, 90_000);

  it("the webhook only says where to look: when Paymenku itself says pending, nothing is credited", async () => {
    const d = await makeDeposit(); // the fake world says "pending"
    const before = await balance(userA);
    const r = await send(hook(d.id, d.trx, "paid"));
    expect(r.status).toBe(200);
    expect(await balance(userA)).toBe(before);
    expect((await dep(d.id)).status).toBe("menunggu");
  }, 60_000);

  it("an amount that does not match is rejected; so is a sandbox / live mismatch and a foreign transaction", async () => {
    const before = await balance(userA);
    // 1) Paymenku reports a different customer amount than the one quoted
    const a = await makeDeposit();
    pay(a.trx);
    world.set(a.trx, { ...world.get(a.trx)!, amount: AMOUNT + FEE + 1, amountReceived: AMOUNT });
    await send(hook(a.id, a.trx, "paid"));
    // 2) paid, but less than was agreed
    const b = await makeDeposit();
    pay(b.trx);
    world.set(b.trx, { ...world.get(b.trx)!, amount: AMOUNT - 1000, totalFee: 0, amountReceived: AMOUNT - 1000 });
    await send(hook(b.id, b.trx, "paid"));
    // 3) a SANDBOX transaction for a deposit that is live (and the other way round)
    const c = await makeDeposit({ sandbox: false });
    pay(c.trx);
    await send(hook(c.id, c.trx, "paid"));
    const d = await makeDeposit();
    pay(d.trx);
    world.set(d.trx, { ...world.get(d.trx)!, isSandbox: false });
    await send(hook(d.id, d.trx, "paid"));
    // 4) the transaction belongs to another reference
    const e = await makeDeposit();
    pay(e.trx);
    world.set(e.trx, { ...world.get(e.trx)!, referenceId: "22222222-2222-4222-8222-222222222222" });
    await send(hook(e.id, e.trx, "paid"));
    for (const x of [a, b, c, d, e]) {
      expect((await dep(x.id)).status, x.id).toBe("menunggu");
      expect(await ledger(x.id)).toHaveLength(0);
    }
    expect(await balance(userA)).toBe(before);
    const rejected = (await m.db.from("audit_logs").select("id").in("target_id", [a.id, b.id, c.id, d.id]).eq("action", "deposit.paymenku_rejected")).data ?? [];
    expect(rejected.length).toBeGreaterThanOrEqual(4);
  }, 120_000);

  it("unknown events, unknown references and malformed bodies answer without effect", async () => {
    const before = await balance(userA);
    const unknown = hook("11111111-1111-4111-8111-111111111111", "SBOX-NONE", "paid", { event: "something.else" });
    expect(await send(unknown)).toMatchObject({ status: 200, body: { ok: true } });
    const noRef = hook("11111111-1111-4111-8111-111111111111", "SBOX-NONE", "paid");
    expect((await send(noRef)).status).toBe(200);
    const badUuid = hook("not-a-uuid", "SBOX-X", "paid");
    expect((await send(badUuid)).status).toBe(200);
    const garbage = { rawBody: "{not json", timestamp: String(Math.floor(Date.now() / 1000)), signature: "" };
    garbage.signature = createHmac("sha256", SECRET).update(`${garbage.timestamp}.${garbage.rawBody}`).digest("hex");
    expect((await send(garbage)).status).toBe(400);
    expect((await send({ ...hook("x", "y", "paid"), rawBody: "x".repeat(70_000) })).status).toBe(413);
    expect(await balance(userA)).toBe(before);
  }, 60_000);

  it("failed / expired / cancelled update the deposit without crediting; a credited deposit is never undone", async () => {
    for (const [status, expected] of [["failed", "gagal"], ["expired", "kedaluwarsa"], ["cancelled", "dibatalkan"]] as const) {
      const d = await makeDeposit({ txStatus: status });
      const before = await balance(userA);
      expect((await send(hook(d.id, d.trx, status))).status).toBe(200);
      expect((await dep(d.id)).status).toBe(expected);
      expect(await balance(userA)).toBe(before);
    }
    const paid = await makeDeposit();
    pay(paid.trx);
    await send(hook(paid.id, paid.trx, "paid"));
    world.set(paid.trx, { ...world.get(paid.trx)!, status: "expired" });
    await send(hook(paid.id, paid.trx, "expired"));
    expect((await dep(paid.id)).status).toBe("berhasil");
  }, 90_000);

  it("policy: a payment confirmed AFTER the deposit expired is credited ONCE (after verification), flagged and logged", async () => {
    const d = await makeDeposit({ txStatus: "expired" });
    await send(hook(d.id, d.trx, "expired"));
    expect((await dep(d.id)).status).toBe("kedaluwarsa");
    const before = await balance(userA);
    pay(d.trx);
    const r = await send(hook(d.id, d.trx, "paid"));
    expect(r.status).toBe(200);
    const row = await dep(d.id);
    expect(row).toMatchObject({ status: "berhasil", needs_review: true });
    expect(row.review_reason).toMatch(/kedaluwarsa/);
    expect(await balance(userA)).toBe(before + AMOUNT + Number(row.bonus));
    await send(hook(d.id, d.trx, "paid")); // delivered again
    expect(await ledger(d.id)).toHaveLength(1);
    expect(((await m.db.from("audit_logs").select("id").eq("target_id", d.id).eq("action", "deposit.paymenku_late_credit")).data ?? [])).toHaveLength(1);
    expect(((await m.db.from("admin_alerts").select("id").eq("kind", "deposit_review").like("message", `%${d.id.slice(0, 8)}%`)).data ?? []).length).toBeGreaterThan(0);
  }, 90_000);

  it("a refund AFTER the credit does not touch the balance: the deposit is flagged for an admin", async () => {
    const d = await makeDeposit();
    pay(d.trx);
    await send(hook(d.id, d.trx, "paid"));
    const before = await balance(userA);
    world.set(d.trx, { ...world.get(d.trx)!, status: "refunded" });
    expect((await send(hook(d.id, d.trx, "refunded"))).status).toBe(200);
    const row = await dep(d.id);
    expect(row).toMatchObject({ status: "berhasil", needs_review: true, gateway_status: "refunded" });
    expect(await balance(userA)).toBe(before);
    expect(await ledger(d.id)).toHaveLength(1);
    expect(((await m.db.from("admin_alerts").select("id").eq("kind", "deposit_review").like("message", `%${d.id.slice(0, 8)}%`)).data ?? []).length).toBeGreaterThan(0);
  }, 60_000);

  it("reconciliation: a lost webhook is found by the cron and credited once; expired ones are closed", async () => {
    const lost = await makeDeposit({ ageMinutes: 10 });
    pay(lost.trx); // paid at Paymenku, no webhook ever arrived
    const expired = await makeDeposit({ ageMinutes: 10, txStatus: "expired" });
    const fresh = await makeDeposit(); // younger than 5 minutes: left alone
    pay(fresh.trx);
    const before = await balance(userA);
    const s1 = await m.gw.reconcilePendingDeposits({ client: client(), sandbox: true, limit: 200 });
    expect(s1.credited).toBeGreaterThanOrEqual(1);
    expect((await dep(lost.id)).status).toBe("berhasil");
    expect((await dep(expired.id)).status).toBe("kedaluwarsa");
    expect((await dep(fresh.id)).status).toBe("menunggu");
    expect(await balance(userA)).toBe(before + AMOUNT + Number((await dep(lost.id)).bonus));
    const s2 = await m.gw.reconcilePendingDeposits({ client: client(), sandbox: true, limit: 200 });
    expect(s2.credited).toBe(0);
    expect(await ledger(lost.id)).toHaveLength(1);
  }, 120_000);

  it("admin 'Cek status ke Paymenku' (verifyDeposit) credits only when Paymenku reports paid", async () => {
    const d = await makeDeposit();
    expect((await m.gw.verifyDeposit(d.id, "admin:test", { client: client() })).outcome).toBe("unchanged");
    expect((await dep(d.id)).status).toBe("menunggu");
    pay(d.trx);
    expect((await m.gw.verifyDeposit(d.id, "admin:test", { client: client() })).outcome).toBe("credited");
    expect((await m.gw.verifyDeposit(d.id, "admin:test", { client: client() })).outcome).toBe("duplicate");
    expect(await ledger(d.id)).toHaveLength(1);
  }, 60_000);

  it("RLS: the owner reads their deposit and its payment data; another user and anon read nothing", async () => {
    const d = await makeDeposit();
    await m.db.from("deposits").update({ payment_info: { qr_url: "https://paymenku.com/api/qris/x" }, pay_url: "https://paymenku.com/pay/x" }).eq("id", d.id);
    const as = async (email: string) => {
      const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!, { auth: { persistSession: false, autoRefreshToken: false } });
      expect((await c.auth.signInWithPassword({ email, password })).error).toBeNull();
      return c;
    };
    const own = await (await as(emailA)).from("deposits").select("id,pay_url,payment_info").eq("id", d.id);
    expect(own.data).toHaveLength(1);
    expect(own.data![0].payment_info).toMatchObject({ qr_url: expect.any(String) });
    const b = await newUser("b2");
    expect((await (await as(b.email)).from("deposits").select("id").eq("id", d.id)).data).toEqual([]);
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!, { auth: { persistSession: false } });
    expect((await anon.from("deposits").select("id").eq("id", d.id)).data ?? []).toEqual([]);
    // nobody but the server can change a deposit
    const upd = await (await as(emailA)).from("deposits").update({ status: "berhasil" }).eq("id", d.id).select();
    expect(upd.data ?? []).toEqual([]);
    expect((await dep(d.id)).status).toBe("menunggu");
  }, 90_000);

  it("creating a top-up: the row exists first (reference_id = deposit id = Idempotency-Key), channel / amount limits, pending cap, only safe payment data is stored", async () => {
    const original = ((await m.db.from("site_settings").select("data").maybeSingle()).data?.data ?? {}) as { payments?: Record<string, unknown> };
    const patched = { ...original, payments: { ...(original.payments ?? {}), minDeposit: 10_000, gateway: { enabled: true, maxDeposit: 5_000_000, feePolicy: "ikuti", channels: ["qris"] } } };
    await m.db.from("site_settings").upsert({ id: true, data: patched as never });
    try {
      const u = await newUser("c");
      const mk = (amount: number, channelCode = "qris") => m.gw.createGatewayDeposit({ userId: u.id, ip: `198.51.100.${(++seq % 200) + 1}`, amount, channelCode }, { client: client(), siteOrigin: "https://site.test" });
      await expect(mk(5_000)).rejects.toThrow(/Minimal deposit/);
      await expect(mk(6_000_000)).rejects.toThrow(/Maksimal deposit/);
      await expect(mk(20_000, "nonexistent")).rejects.toThrow(/tidak tersedia/);
      const created = await mk(20_000);
      const row = await dep(created.id);
      expect(row).toMatchObject({ status: "menunggu", gateway: "paymenku", channel_code: "qris", amount: 20_000, pay_amount: 20_000 + FEE, fee_amount: FEE, is_sandbox: true });
      expect(row.external_id).toMatch(/^zt-/);
      expect(row.payment_info).toEqual(expect.objectContaining({ qr_url: expect.any(String) }));
      expect(JSON.stringify(row.payment_info)).not.toContain("never stored");
      expect(calls).toContain(`create:${created.id}`);
      expect(world.get(row.external_id!)!.referenceId).toBe(created.id);
      await mk(20_000);
      await mk(20_000);
      await expect(mk(20_000)).rejects.toThrow(/menunggu pembayaran/); // 3 pending is the cap
      // cancelling one frees a slot; a paid transaction cannot be cancelled away
      expect((await m.gw.cancelGatewayDeposit(created.id, { userId: u.id }, { client: client() })).ok).toBe(true);
      expect((await dep(created.id)).status).toBe("dibatalkan");
      const other = (await m.db.from("deposits").select("id").eq("user_id", u.id).eq("status", "menunggu").limit(1).single()).data!;
      pay((await dep(other.id)).external_id!);
      const res = await m.gw.cancelGatewayDeposit(other.id, { userId: u.id }, { client: client() });
      expect(res.ok).toBe(false);
      expect((await dep(other.id)).status).toBe("berhasil"); // verified paid: credited, not cancelled
      // somebody else's deposit cannot be cancelled
      expect((await m.gw.cancelGatewayDeposit(other.id, { userId: userB }, { client: client() })).ok).toBe(false);
    } finally {
      await m.db.from("site_settings").upsert({ id: true, data: original as never });
    }
  }, 180_000);

  it("the creation rate limit stops a user who asks too often", async () => {
    const original = ((await m.db.from("site_settings").select("data").maybeSingle()).data?.data ?? {}) as { payments?: Record<string, unknown> };
    await m.db.from("site_settings").upsert({ id: true, data: { ...original, payments: { ...(original.payments ?? {}), gateway: { enabled: true, maxDeposit: 5_000_000, feePolicy: "ikuti", channels: ["qris"] } } } as never });
    try {
      const u = await newUser("d");
      let limited = 0;
      for (let i = 0; i < 8; i++) {
        try {
          const c = await m.gw.createGatewayDeposit({ userId: u.id, ip: `198.51.100.${(++seq % 200) + 1}`, amount: 20_000, channelCode: "qris" }, { client: client(), siteOrigin: "https://site.test" });
          await m.gw.cancelGatewayDeposit(c.id, { userId: u.id }, { client: client() }); // keeps the pending cap out of the way
        } catch (e) {
          if (/Terlalu banyak/.test(String((e as Error).message))) limited++;
        }
      }
      expect(limited).toBeGreaterThan(0);
    } finally {
      await m.db.from("site_settings").upsert({ id: true, data: original as never });
    }
  }, 180_000);

  it("sanity: a credited deposit without its ledger entry is counted", async () => {
    const before = (await m.db.rpc("run_sanity_check")).data!.deposit_mismatches;
    const { data } = await m.db.from("deposits").insert({ user_id: userA, method: "QRIS", amount: 12_345, status: "berhasil" }).select("id").single();
    const after = (await m.db.rpc("run_sanity_check")).data!.deposit_mismatches;
    expect(after).toBe(before + 1);
    await m.db.from("deposits").delete().eq("id", data!.id);
  }, 60_000);
});
