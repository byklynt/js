/**
 * "Teruskan biaya ke pelanggan" against the linked DEV Supabase project with a FAKE Paymenku (no network): the switch off keeps today's behaviour, on adds the
 * grossed-up fee, settlement compares the reported amount with the STORED total exactly, a payment of only the base amount is not credited and is flagged,
 * replays / concurrent webhooks credit once, the balance and the bonus come from the base amount, and deposits created before the switch are unaffected.
 * Run with: npm run test:db (node scripts/run-db-tests.mjs fee-passthrough)
 */
import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanupOrFail } from "../../../scripts/lib/test-cleanup.mjs";
import { gatewayFeeOn, grossUpTotal } from "../payments/gateway-rules";

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

type FakeTx = { trxId: string; referenceId: string; amount: number; totalFee: number; amountReceived: number; status: "pending" | "paid"; isSandbox: boolean; payUrl: string | null; channelCode: string | null; paidAt: string | null; paymentInfo: Record<string, unknown> };

describe.skipIf(!enabled)("fee pass-through (fake gateway)", () => {
  const MARKER = "fp";
  const run = MARKER + Math.random().toString(36).slice(2, 7);
  const SECRET = `zt-whsec-${run}`;
  const FLAT = 200;
  const PERCENT = 0.7;
  let seq = 0;
  let m: {
    db: ReturnType<typeof import("@/lib/server/supabase-admin").supabaseAdmin>;
    gw: typeof import("@/lib/server/payments/deposits-gateway");
  };
  let user = "";
  let baseline = 0;
  const world = new Map<string, FakeTx>();
  const created: { amount: number; channelCode: string }[] = [];
  const merchantChannel = (code: string, maxAmount: number) => ({ code, name: code.toUpperCase(), type: "qris", group: "QRIS", flowType: "direct", feeMode: "merchant" as const, feeFlat: FLAT, feePercent: PERCENT, minAmount: 1000, maxAmount });
  const fake = () => ({
    checkStatus: async (id: string) => {
      const tx = [...world.values()].find((t) => t.trxId === id || t.referenceId === id);
      if (!tx) throw Object.assign(new Error("Transaction not found"), { name: "PaymenkuError", kind: "rejected", status: 404 });
      return { ...tx };
    },
    cancelTransaction: async () => ({ status: "cancelled" }),
    // a merchant-billed channel: the customer is asked for exactly what we send, Paymenku keeps its fee out of that
    createTransaction: async (i: { channelCode: string; amount: number; referenceId: string }) => {
      created.push({ amount: i.amount, channelCode: i.channelCode });
      const fee = gatewayFeeOn(i.amount, FLAT, PERCENT)!;
      const tx: FakeTx = { trxId: `zt-${run}-c${++seq}`, referenceId: i.referenceId, amount: i.amount, totalFee: fee, amountReceived: i.amount - fee, status: "pending", isSandbox: true, payUrl: "https://paymenku.com/pay/x", channelCode: i.channelCode, paidAt: null, paymentInfo: { expiration_date: new Date(Date.now() + 900_000).toISOString() } };
      world.set(tx.trxId, tx);
      return tx;
    },
    listChannels: async () => [merchantChannel("qris", 10_000_000), merchantChannel("small", 20_000)],
  });
  const client = () => fake() as never;

  const newUser = async (label: string) => {
    const username = `zt_${label}_${run}`.slice(0, 24);
    const { data, error } = await m.db.auth.admin.createUser({ email: `${username}@jagoansosmed-test.invalid`, password: `Fpt-${run}-pass1`, email_confirm: true, user_metadata: { username } });
    if (error || !data.user) throw new Error(error?.message);
    return data.user.id;
  };
  const balance = async (id: string) => Number((await m.db.from("profiles").select("balance").eq("id", id).single()).data!.balance);
  const ledger = async (depositId: string) => (await m.db.from("balance_ledger").select("amount,type").eq("ref_type", "deposit").eq("ref_id", depositId)).data ?? [];
  const dep = async (id: string) => (await m.db.from("deposits").select("*").eq("id", id).single()).data!;
  const mk = (amount: number, channelCode = "qris") => m.gw.createGatewayDeposit({ userId: user, ip: `198.51.100.${(++seq % 200) + 1}`, amount, channelCode }, { client: client(), siteOrigin: "https://site.test" });

  /** The customer paid: the fake world says paid with the amounts Paymenku would report. */
  const pay = (trx: string, over: Partial<FakeTx> = {}) => {
    const t = world.get(trx)!;
    world.set(trx, { ...t, status: "paid", paidAt: new Date().toISOString(), ...over });
  };
  const hook = (id: string, trx: string) => {
    const t = world.get(trx)!;
    const body = JSON.stringify({ event: "payment.status_updated", trx_id: trx, reference_id: id, status: "paid", amount: `${t.amount}.00`, total_fee: `${t.totalFee}.00`, amount_received: `${t.amountReceived}.00`, payment_channel: "qris", paid_at: new Date().toISOString(), is_sandbox: true });
    const ts = String(Math.floor(Date.now() / 1000));
    return { rawBody: body, timestamp: ts, signature: createHmac("sha256", SECRET).update(`${ts}.${body}`).digest("hex") };
  };
  const send = (id: string, trx: string) => m.gw.handlePaymenkuWebhook(hook(id, trx), { secret: SECRET, client: client(), sandbox: true });

  let original: { payments?: Record<string, unknown> } = {};
  const configure = async (passthrough: boolean, bonusTiers: unknown[] = []) => {
    const patched = { ...original, payments: { ...(original.payments ?? {}), minDeposit: 10_000, bonusTiers, gateway: { enabled: true, maxDeposit: 5_000_000, feePolicy: "ikuti", feePassthrough: passthrough, channels: ["qris", "small"] } } };
    await m.db.from("site_settings").upsert({ id: true, data: patched as never });
  };

  beforeAll(async () => {
    const ref = process.env.SUPABASE_DEV_PROJECT_REF;
    if (!ref || new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname !== `${ref}.supabase.co`) throw new Error("Refusing to run: SUPABASE_DEV_PROJECT_REF does not match NEXT_PUBLIC_SUPABASE_URL.");
    m = { db: (await import("@/lib/server/supabase-admin")).supabaseAdmin(), gw: await import("@/lib/server/payments/deposits-gateway") };
    await cleanupOrFail({ marker: MARKER });
    original = ((await m.db.from("site_settings").select("data").maybeSingle()).data?.data ?? {}) as typeof original;
    baseline = (await m.db.rpc("run_sanity_check")).data!.deposit_mismatches;
  }, 240_000);

  afterAll(async () => {
    await m.db.from("site_settings").upsert({ id: true, data: original as never });
    await cleanupOrFail({ marker: MARKER });
  }, 300_000);

  it("switch OFF keeps today's behaviour: the customer pays the base amount, no fee is stored, the gateway is asked for the base", async () => {
    user = await newUser("u479");
    await configure(false);
    const before = created.length;
    const c = await mk(25_000);
    const row = await dep(c.id);
    expect(row).toMatchObject({ amount: 25_000, pay_amount: 25_000, fee_amount: 0, fee_passthrough: false, status: "menunggu" });
    expect(created[before].amount).toBe(25_000);
  }, 120_000);

  it("switch ON: the gateway is asked for the grossed-up total, the row stores total and fee, and the credit is the BASE amount (bonus on the base too)", async () => {
    user = await newUser("u981");
    await configure(true, [{ min: 10_000, percent: 10 }]);
    const amount = 10_000;
    const total = grossUpTotal(amount, FLAT, PERCENT)!;
    expect(total).toBe(10_272);
    const before = created.length;
    const c = await mk(amount);
    expect(c.payAmount).toBe(total);
    const row = await dep(c.id);
    expect(row).toMatchObject({ amount, pay_amount: total, fee_amount: total - amount, fee_passthrough: true, status: "menunggu" });
    expect(created[before].amount).toBe(total); // Paymenku is asked for the gross total
    pay(row.external_id!);
    const t = world.get(row.external_id!)!;
    expect(t.amountReceived).toBeGreaterThanOrEqual(amount); // the gross-up leaves the merchant at least the base
    const bal = await balance(user);
    expect(await send(c.id, row.external_id!)).toMatchObject({ status: 200, body: { ok: true } });
    expect((await dep(c.id)).status).toBe("berhasil");
    expect((await ledger(c.id)).filter((l) => l.type === "deposit").map((l) => Number(l.amount))).toEqual([amount]); // exactly the base
    expect(Number((await dep(c.id)).bonus)).toBe(1_000); // 10 % of 10.000, not of 10.272
    expect(await balance(user)).toBe(bal + amount + 1_000);
  }, 120_000);

  it("replayed and concurrent webhooks credit once", async () => {
    user = await newUser("u499");
    await configure(true);
    const c = await mk(50_000);
    const row = await dep(c.id);
    pay(row.external_id!);
    const bal = await balance(user);
    const results = await Promise.all(Array.from({ length: 6 }, () => send(c.id, row.external_id!)));
    expect(results.every((r) => r.status === 200)).toBe(true);
    await send(c.id, row.external_id!); // a late replay
    expect((await ledger(c.id)).filter((l) => l.type === "deposit")).toHaveLength(1);
    expect(await balance(user)).toBe(bal + 50_000);
  }, 120_000);

  it("a payment of only the BASE amount is not credited and the deposit is flagged 'Perlu dicek' with an admin alert", async () => {
    user = await newUser("u135");
    await configure(true);
    const c = await mk(25_000);
    const row = await dep(c.id);
    const bal = await balance(user);
    // the customer (or a tampered answer) paid the base only: the reported amount differs from the stored total
    pay(row.external_id!, { amount: 25_000, totalFee: gatewayFeeOn(25_000, FLAT, PERCENT)!, amountReceived: 25_000 - gatewayFeeOn(25_000, FLAT, PERCENT)! });
    const r = await send(c.id, row.external_id!);
    expect(r.status).toBe(200);
    const after = await dep(c.id);
    expect(after.status).toBe("menunggu");
    expect(after.needs_review).toBe(true);
    expect(after.review_reason).toMatch(/tidak cocok/);
    expect(await balance(user)).toBe(bal);
    expect(await ledger(c.id)).toHaveLength(0);
    const alerts = (await m.db.from("admin_alerts").select("message").eq("kind", "deposit_review").ilike("message", `%${c.id.slice(0, 8)}%`)).data ?? [];
    expect(alerts.length).toBe(1);
    // the same bad answer again: still one alert (idempotent flag)
    await send(c.id, row.external_id!);
    expect(((await m.db.from("admin_alerts").select("message").eq("kind", "deposit_review").ilike("message", `%${c.id.slice(0, 8)}%`)).data ?? []).length).toBe(1);
  }, 120_000);

  it("what reaches the merchant must be at least the base (Rp 1 of rounding tolerance); a bigger shortfall or a different paid total is flagged", async () => {
    user = await newUser("u532");
    await configure(true);
    const base = 40_000;
    const ok = await mk(base);
    const okRow = await dep(ok.id);
    pay(okRow.external_id!, { amountReceived: base - 1 }); // within the tolerance
    await send(ok.id, okRow.external_id!);
    expect((await dep(ok.id)).status).toBe("berhasil");

    const short = await mk(base);
    const shortRow = await dep(short.id);
    pay(shortRow.external_id!, { amountReceived: base - 2 }); // beyond it
    await send(short.id, shortRow.external_id!);
    expect(await dep(short.id)).toMatchObject({ status: "menunggu", needs_review: true });

    const more = await mk(base);
    const moreRow = await dep(more.id);
    pay(moreRow.external_id!, { amount: Number(moreRow.pay_amount) + 500 }); // paid a different total than the stored one
    await send(more.id, moreRow.external_id!);
    expect(await dep(more.id)).toMatchObject({ status: "menunggu", needs_review: true });
  }, 180_000);

  it("deposits created before the switch are settled by the old rules, unchanged", async () => {
    user = await newUser("u672");
    await configure(false);
    const c = await mk(30_000);
    const row = await dep(c.id);
    expect(row.fee_passthrough).toBe(false);
    await configure(true); // the switch flips while it is pending
    pay(row.external_id!);
    expect(world.get(row.external_id!)!.amount).toBe(30_000); // it was created at the base amount
    await send(c.id, row.external_id!);
    expect(await dep(c.id)).toMatchObject({ status: "berhasil", pay_amount: 30_000, fee_passthrough: false });
    expect((await ledger(c.id)).filter((l) => l.type === "deposit").map((l) => Number(l.amount))).toEqual([30_000]);
  }, 120_000);

  it("the total must fit the channel's own limits: a clear message and no row", async () => {
    user = await newUser("u421");
    await configure(true);
    const rowsBefore = (await m.db.from("deposits").select("id", { count: "exact", head: true }).eq("user_id", user)).count ?? 0;
    // the 'small' channel allows at most 20.000: 20.000 + fee exceeds it although the base itself does not
    await expect(mk(20_000, "small")).rejects.toThrow(/melebihi batas SMALL/);
    expect((await m.db.from("deposits").select("id", { count: "exact", head: true }).eq("user_id", user)).count ?? 0).toBe(rowsBefore);
    await configure(false);
    await expect(mk(20_000, "small")).resolves.toBeTruthy(); // switch off: the base fits
  }, 120_000);

  it("the sanity check stays consistent: every credited deposit has a ledger entry of exactly its base amount", async () => {
    const r = (await m.db.rpc("run_sanity_check")).data!;
    expect(r.deposit_mismatches).toBe(baseline);
  }, 60_000);
});
