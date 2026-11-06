import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { amountLimits, channelAllowed, checkQuote, estimateCustomerFee } from "./gateway-rules";
import { createPaymenkuClient, paymenkuMode, parseRupiah, parseTransaction, PaymenkuError, sanitizePaymentInfo, verifyPaymenkuSignature } from "./paymenku";

vi.mock("server-only", () => ({}));

const DEV = "eoaagocvdclaxxzxsbjr";
const PROD = "prodprodprodprodprod";
const env = (o: Record<string, string>) => ({ SUPABASE_DEV_PROJECT_REF: DEV, ...o }) as unknown as NodeJS.ProcessEnv;
const url = (ref: string) => `https://${ref}.supabase.co`;

describe("mode: the gateway is off unless the key is allowed for THIS project", () => {
  it("no key, unknown prefix", () => {
    expect(paymenkuMode(env({ NEXT_PUBLIC_SUPABASE_URL: url(DEV) })).state).toBe("off");
    expect(paymenkuMode(env({ NEXT_PUBLIC_SUPABASE_URL: url(DEV), PAYMENKU_API_KEY: "pk_test_x" })).state).toBe("off");
  });
  it("sk_test_ works on the DEV project only", () => {
    expect(paymenkuMode(env({ NEXT_PUBLIC_SUPABASE_URL: url(DEV), PAYMENKU_API_KEY: "sk_test_abc" }))).toMatchObject({ state: "sandbox", apiKey: "sk_test_abc" });
    const prod = paymenkuMode(env({ NEXT_PUBLIC_SUPABASE_URL: url(PROD), PAYMENKU_API_KEY: "sk_test_abc" }));
    expect(prod.state).toBe("off");
    expect((prod as { reason: string }).reason).toMatch(/DEV/);
  });
  it("sk_live_ is refused on DEV always, and elsewhere needs PAYMENT_LIVE_APPROVED_REF = the project ref", () => {
    expect(paymenkuMode(env({ NEXT_PUBLIC_SUPABASE_URL: url(DEV), PAYMENKU_API_KEY: "sk_live_abc", PAYMENT_LIVE_APPROVED_REF: DEV })).state).toBe("off");
    expect(paymenkuMode(env({ NEXT_PUBLIC_SUPABASE_URL: url(PROD), PAYMENKU_API_KEY: "sk_live_abc" })).state).toBe("off");
    expect(paymenkuMode(env({ NEXT_PUBLIC_SUPABASE_URL: url(PROD), PAYMENKU_API_KEY: "sk_live_abc", PAYMENT_LIVE_APPROVED_REF: "someotherprojectrefxx" })).state).toBe("off");
    expect(paymenkuMode(env({ NEXT_PUBLIC_SUPABASE_URL: url(PROD), PAYMENKU_API_KEY: "sk_live_abc", PAYMENT_LIVE_APPROVED_REF: PROD }))).toMatchObject({ state: "live" });
  });
  it("the reason never contains the key", () => {
    const r = paymenkuMode(env({ NEXT_PUBLIC_SUPABASE_URL: url(PROD), PAYMENKU_API_KEY: "sk_live_SECRETVALUE123" })) as { reason: string };
    expect(r.reason).not.toContain("SECRETVALUE123");
  });
});

describe("money: integer Rupiah only", () => {
  it("parses decimal strings without floats", () => {
    expect(parseRupiah("15305.00")).toBe(15305);
    expect(parseRupiah("250000")).toBe(250000);
    expect(parseRupiah("0.00")).toBe(0);
    expect(parseRupiah(15000)).toBe(15000);
    expect(parseRupiah("9007199254740993.00".slice(0, 13))).toBe(9007199254740);
  });
  it("rejects anything that is not a whole, non-negative amount", () => {
    for (const bad of ["15305.50", "15305.01", "-1", "1e5", "abc", "", "12,5", " ", null, undefined, {}, 15.5, -3, Number.NaN, "99999999999999999999"]) {
      expect(() => parseRupiah(bad as never), String(bad)).toThrow(PaymenkuError);
    }
  });
});

describe("webhook signature: HMAC-SHA256(timestamp + '.' + raw body) with the webhook secret", () => {
  const secret = "whsec_test_123";
  const raw = JSON.stringify({ event: "payment.status_updated", trx_id: "SBOX1", reference_id: "r1", status: "paid", amount: "15305.00" });
  const now = Date.UTC(2026, 10, 6, 10, 0, 0);
  const ts = String(Math.floor(now / 1000));
  const sign = (t: string, body: string, s = secret) => createHmac("sha256", s).update(`${t}.${body}`).digest("hex");
  const check = (over: Partial<Parameters<typeof verifyPaymenkuSignature>[0]> = {}) =>
    verifyPaymenkuSignature({ rawBody: raw, signature: sign(ts, raw), timestamp: ts, secret, nowMs: now, ...over });

  it("accepts a valid signature", () => {
    expect(check()).toEqual({ ok: true });
    expect(check({ signature: sign(ts, raw).toUpperCase() })).toEqual({ ok: true }); // hex case does not matter
  });
  it("rejects a wrong secret", () => {
    expect(check({ signature: sign(ts, raw, "other") })).toEqual({ ok: false, reason: "mismatch" });
    expect(check({ secret: "other" })).toEqual({ ok: false, reason: "mismatch" });
  });
  it("rejects a tampered body, a re-serialised body and a different timestamp", () => {
    expect(check({ rawBody: raw.replace("15305.00", "15306.00") })).toEqual({ ok: false, reason: "mismatch" });
    expect(check({ rawBody: JSON.stringify(JSON.parse(raw), null, 2) })).toEqual({ ok: false, reason: "mismatch" }); // same JSON, different bytes
    expect(check({ signature: sign(String(Number(ts) + 1), raw) })).toEqual({ ok: false, reason: "mismatch" });
  });
  it("rejects a stale or future timestamp (5 minutes), also in milliseconds", () => {
    const old = String(Number(ts) - 301);
    expect(check({ timestamp: old, signature: sign(old, raw) })).toEqual({ ok: false, reason: "stale" });
    const future = String(Number(ts) + 301);
    expect(check({ timestamp: future, signature: sign(future, raw) })).toEqual({ ok: false, reason: "stale" });
    const edge = String(Number(ts) - 299);
    expect(check({ timestamp: edge, signature: sign(edge, raw) })).toEqual({ ok: true });
    const ms = String(now);
    expect(check({ timestamp: ms, signature: sign(ms, raw) })).toEqual({ ok: true });
  });
  it("rejects missing headers, a missing secret and a malformed timestamp", () => {
    expect(check({ signature: null })).toEqual({ ok: false, reason: "missing_header" });
    expect(check({ timestamp: null })).toEqual({ ok: false, reason: "missing_header" });
    expect(check({ secret: undefined })).toEqual({ ok: false, reason: "no_secret" });
    expect(check({ secret: "" })).toEqual({ ok: false, reason: "no_secret" });
    expect(check({ timestamp: "yesterday", signature: sign("yesterday", raw) })).toEqual({ ok: false, reason: "bad_timestamp" });
    expect(check({ signature: "abc" })).toEqual({ ok: false, reason: "mismatch" }); // wrong length: no throw
  });
});

describe("parseTransaction / sanitizePaymentInfo", () => {
  const base = { trx_id: "SBOX2026", reference_id: "11111111-1111-4111-8111-111111111111", amount: "15305.00", status: "pending", pay_url: "https://paymenku.com/pay/SBOX2026" };
  it("reads the create answer with integer Rupiah and the sandbox flag from the prefix", () => {
    const tx = parseTransaction({ ...base, payment_info: { qr_url: "https://paymenku.com/api/qris/SBOX2026", expiration_date: "2026-10-27T10:20:40+07:00" } });
    expect(tx).toMatchObject({ trxId: "SBOX2026", amount: 15305, totalFee: 0, status: "pending", isSandbox: true });
  });
  it("reads check-status / webhook fields", () => {
    const tx = parseTransaction({ ...base, trx_id: "IDP1", status: "paid", total_fee: "305.00", amount_received: "15000.00", is_sandbox: false, payment_channel: { code: "qris", name: "QRIS", type: "qris" }, paid_at: "2026-10-27T10:45:12+07:00" });
    expect(tx).toMatchObject({ amount: 15305, totalFee: 305, amountReceived: 15000, isSandbox: false, channelCode: "qris", status: "paid" });
    expect(parseTransaction({ ...base, trx_id: "IDP1", payment_channel: "bca_va" }).channelCode).toBe("bca_va");
  });
  it("rejects unknown statuses, missing ids and fractional amounts", () => {
    expect(() => parseTransaction({ ...base, status: "mystery" })).toThrow(PaymenkuError);
    expect(() => parseTransaction({ ...base, trx_id: "" })).toThrow(PaymenkuError);
    expect(() => parseTransaction({ ...base, amount: "15305.50" })).toThrow(PaymenkuError);
    expect(() => parseTransaction(null)).toThrow(PaymenkuError);
  });
  it("keeps only known display fields, https urls and bounded strings", () => {
    const out = sanitizePaymentInfo({
      qr_url: "https://paymenku.com/q.png", simulator_url: "javascript:alert(1)", checkout_url: "ftp://x", va_number: "123", bank: "BCA", secret_key: "nope", customer_email: "a@b.c",
      qr_string: "x".repeat(5000), expiration_date: "2026-10-27T10:20:40+07:00", sandbox: true,
    });
    expect(out).toEqual({ qr_url: "https://paymenku.com/q.png", va_number: "123", bank: "BCA", expiration_date: "2026-10-27T10:20:40+07:00", sandbox: true });
  });
});

describe("client", () => {
  const ok = (data: unknown, init: ResponseInit = {}) => new Response(JSON.stringify({ status: "success", data }), { status: 200, ...init });
  const tx = { trx_id: "SBOX1", reference_id: "ref", amount: "15305.00", status: "pending", pay_url: "https://paymenku.com/pay/SBOX1" };
  function make(responses: (Response | Error)[], extra: { sleep?: (ms: number) => Promise<void> } = {}) {
    const calls: { url: string; init: RequestInit }[] = [];
    let i = 0;
    const fetchImpl = (async (u: string, init?: RequestInit) => {
      calls.push({ url: String(u), init: init ?? {} });
      const r = responses[Math.min(i++, responses.length - 1)];
      if (r instanceof Error) throw r;
      return r.clone();
    }) as unknown as typeof fetch;
    const sleep = extra.sleep ?? (async () => {});
    return { client: createPaymenkuClient({ apiKey: "sk_test_SECRET", fetchImpl, sleep }), calls };
  }
  const input = { channelCode: "qris", amount: 15000, referenceId: "ref", customerName: "Budi", customerEmail: "b@x.id", returnUrl: "https://site/deposit/ref", idempotencyKey: "ref" };

  it("create: one POST with the key, the Idempotency-Key and the documented fields", async () => {
    const { client, calls } = make([ok(tx)]);
    const t = await client.createTransaction(input);
    expect(t.trxId).toBe("SBOX1");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://paymenku.com/api/v1/transaction/create");
    const h = calls[0].init.headers as Record<string, string>;
    expect(h.Authorization).toBe("Bearer sk_test_SECRET");
    expect(h["Idempotency-Key"]).toBe("ref");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ channel_code: "qris", amount: 15000, reference_id: "ref", customer_name: "Budi", customer_email: "b@x.id", return_url: "https://site/deposit/ref" });
  });
  it("create is NEVER retried: a 500 and a timeout are ambiguous after a single attempt", async () => {
    const a = make([new Response("{}", { status: 500 }), ok(tx)]);
    await expect(a.client.createTransaction(input)).rejects.toMatchObject({ kind: "http", ambiguous: true });
    expect(a.calls).toHaveLength(1);
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    const b = make([abort, ok(tx)]);
    await expect(b.client.createTransaction(input)).rejects.toMatchObject({ kind: "timeout", ambiguous: true });
    expect(b.calls).toHaveLength(1);
  });
  it("create: 429 surfaces Retry-After without repeating; 4xx is a clean rejection", async () => {
    const a = make([new Response("{}", { status: 429, headers: { "Retry-After": "7" } }), ok(tx)]);
    await expect(a.client.createTransaction(input)).rejects.toMatchObject({ kind: "rate_limited", retryAfterSeconds: 7 });
    expect(a.calls).toHaveLength(1);
    const b = make([new Response(JSON.stringify({ status: "error", message: "Minimum amount for QRIS is Rp 1.000" }), { status: 422 })]);
    await expect(b.client.createTransaction(input)).rejects.toMatchObject({ kind: "rejected", status: 422, ambiguous: false, message: expect.stringContaining("Minimum amount") });
  });
  it("an error envelope with HTTP 200 is an error ({status:'error'} and {success:false})", async () => {
    const a = make([new Response(JSON.stringify({ status: "error", message: "Payment channel is inactive." }), { status: 200 })]);
    await expect(a.client.createTransaction(input)).rejects.toMatchObject({ kind: "rejected", message: "Payment channel is inactive." });
    const b = make([new Response(JSON.stringify({ success: false, message: "Wallet not found" }), { status: 200 })]);
    await expect(b.client.walletBalance()).rejects.toMatchObject({ kind: "rejected" });
  });
  it("GET retries 5xx and network errors with backoff, then succeeds", async () => {
    const sleeps: number[] = [];
    const { client, calls } = make([new Response("{}", { status: 503 }), new Error("socket"), ok({ ...tx, status: "paid" })], { sleep: async (ms) => void sleeps.push(ms) });
    const t = await client.checkStatus("ref");
    expect(t.status).toBe("paid");
    expect(calls).toHaveLength(3);
    expect(sleeps).toEqual([500, 1500]);
    expect(calls[0].url).toBe("https://paymenku.com/api/v1/check-status/ref");
  });
  it("GET honours Retry-After on 429 and gives up after 3 attempts", async () => {
    const sleeps: number[] = [];
    const rl = new Response("{}", { status: 429, headers: { "Retry-After": "3" } });
    const { client, calls } = make([rl, rl, rl], { sleep: async (ms) => void sleeps.push(ms) });
    await expect(client.checkStatus("ref")).rejects.toMatchObject({ kind: "rate_limited" });
    expect(calls).toHaveLength(3);
    expect(sleeps).toHaveLength(2);
    for (const s of sleeps) expect(s).toBeGreaterThanOrEqual(3000);
  });
  it("GET does not retry a 404", async () => {
    const { client, calls } = make([new Response(JSON.stringify({ status: "error", message: "Transaction not found" }), { status: 404 })]);
    await expect(client.checkStatus("x")).rejects.toMatchObject({ kind: "rejected", status: 404 });
    expect(calls).toHaveLength(1);
  });
  it("channels and wallet", async () => {
    const { client } = make([
      ok([{ code: "qris", name: "QRIS", type: "qris", group: "QRIS", flow_type: "direct", fee_mode: "customer", fee_flat: 200, fee_percent: 0.7, min_amount: 1000, max_amount: 10000000 }, { code: "weird", fee_mode: "nobody" }]),
      new Response(JSON.stringify({ success: true, data: { balance: "36793.00", currency: "IDR" } }), { status: 200 }),
    ]);
    const ch = await client.listChannels();
    expect(ch).toHaveLength(1); // the row with an unknown fee mode is skipped
    expect(ch[0]).toMatchObject({ code: "qris", feeMode: "customer", feeFlat: 200, feePercent: 0.7, minAmount: 1000, maxAmount: 10_000_000 });
    expect(await client.walletBalance()).toBe(36793);
  });
  it("cancel posts the trx_id", async () => {
    const { client, calls } = make([new Response(JSON.stringify({ status: "success", message: "ok", data: { trx_id: "SBOX1", status: "cancelled" } }), { status: 200 })]);
    expect((await client.cancelTransaction("SBOX1")).status).toBe("cancelled");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ trx_id: "SBOX1" });
  });
});

describe("rules: fee policy, estimate, limits, quote check", () => {
  const qris = { feeMode: "customer" as const, feeFlat: 200, feePercent: 0.7, minAmount: 1000, maxAmount: 10_000_000 };
  const bca = { feeMode: "merchant" as const, feeFlat: 4440, feePercent: 0.2, minAmount: 10_000, maxAmount: 10_000_000 };
  const split = { ...qris, feeMode: "split" as const };
  it("fee policy filters channels", () => {
    expect([qris, bca, split].map((c) => channelAllowed(c, "ikuti"))).toEqual([true, true, true]);
    expect([qris, bca, split].map((c) => channelAllowed(c, "pengguna"))).toEqual([true, false, true]);
    expect([qris, bca, split].map((c) => channelAllowed(c, "kami"))).toEqual([false, true, false]);
  });
  it("estimates the customer fee exactly like the documented example (15.000 -> 305)", () => {
    expect(estimateCustomerFee(qris, 15_000)).toBe(305);
    expect(estimateCustomerFee(bca, 100_000)).toBe(0);
    expect(estimateCustomerFee(qris, 10_000)).toBe(270);
  });
  it("limits combine our settings and the channel", () => {
    expect(amountLimits(qris, { minDeposit: 10_000, maxDeposit: 5_000_000 })).toEqual({ min: 10_000, max: 5_000_000 });
    expect(amountLimits(bca, { minDeposit: 5_000, maxDeposit: 20_000_000 })).toEqual({ min: 10_000, max: 10_000_000 });
  });
  it("the quote must make sense: never less than the amount, none extra when the merchant bears it, never absurd", () => {
    expect(checkQuote(qris, 15_000, 15_305)).toBeNull();
    expect(checkQuote(qris, 15_000, 15_000)).toBeNull();
    expect(checkQuote(qris, 15_000, 14_999)).toMatch(/lebih kecil/);
    expect(checkQuote(bca, 100_000, 100_000)).toBeNull();
    expect(checkQuote(bca, 100_000, 100_300)).toMatch(/tanpa biaya/);
    expect(checkQuote(qris, 15_000, 20_000)).toMatch(/jauh di atas/);
    expect(checkQuote(qris, 15_000, 15_305.5)).not.toBeNull();
  });
});
