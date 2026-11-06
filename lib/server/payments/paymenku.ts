import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { supabaseTargetRef } from "@/lib/server/providers/config";

/**
 * Paymenku (https://paymenku.com) client and helpers, written from the official docs (github.com/paymenku/docs-paymenku, openapi.yaml):
 *  - base URL https://paymenku.com/api/v1, `Authorization: Bearer sk_test_... | sk_live_...`;
 *  - POST /transaction/create {channel_code, amount, reference_id, customer_name, customer_email, return_url}, Idempotency-Key kept 24 h;
 *  - GET /check-status/{trx_id | reference_id}, POST /transaction/cancel {trx_id}, GET /payment-channels, GET /merchant/fee-calculator, GET /wallet/balance;
 *  - amounts in responses are DECIMAL STRINGS ("15305.00"): parsed here without floats; `amount` is what the CUSTOMER pays (base + customer fee),
 *    `amount_received` what reaches the merchant;
 *  - statuses pending | paid | expired | failed | cancelled | refunded;
 *  - webhook: X-PaymenKu-Signature = HMAC-SHA256(timestamp + "." + RAW body, webhook secret) as hex, X-PaymenKu-Timestamp (the docs name no tolerance and no retry schedule).
 * Nothing here logs a key, a secret or a webhook body.
 */

export const PAYMENKU_BASE = "https://paymenku.com/api/v1";
export const WEBHOOK_TOLERANCE_SECONDS = 300;

// ---------------------------------------------------------------------------------------------------------------------------------
// Mode: the gateway is "off" unless the key is allowed for THIS Supabase project
// ---------------------------------------------------------------------------------------------------------------------------------
export type PaymenkuMode = { state: "off"; reason: string } | { state: "sandbox" | "live"; apiKey: string };

const clean = (v: string | undefined) => (v ?? "").trim();

/**
 * sk_test_  -> "sandbox", ONLY on the DEV project (a sandbox payment moves no money: on any other project it would credit balance for free);
 * sk_live_  -> "live", ONLY when PAYMENT_LIVE_APPROVED_REF equals the project ref of NEXT_PUBLIC_SUPABASE_URL (and never on the DEV project);
 * anything else (no key, unknown prefix, key not allowed here) -> "off". The reason is safe to show to an admin (it never contains the key).
 */
export function paymenkuMode(env: NodeJS.ProcessEnv = process.env): PaymenkuMode {
  const key = clean(env.PAYMENKU_API_KEY);
  if (!key) return { state: "off", reason: "PAYMENKU_API_KEY belum diisi." };
  const target = supabaseTargetRef(env.NEXT_PUBLIC_SUPABASE_URL);
  const dev = clean(env.SUPABASE_DEV_PROJECT_REF);
  const isDev = target !== null && dev !== "" && target === dev;
  if (key.startsWith("sk_test_")) {
    return isDev ? { state: "sandbox", apiKey: key } : { state: "off", reason: "Kunci sandbox (sk_test_) hanya boleh dipakai di project DEV: transaksi sandbox tidak memindahkan uang." };
  }
  if (key.startsWith("sk_live_")) {
    if (isDev) return { state: "off", reason: "Project DEV menolak kunci live (sk_live_)." };
    const approved = clean(env.PAYMENT_LIVE_APPROVED_REF);
    if (!approved || approved !== target) return { state: "off", reason: "Kunci live belum disetujui: isi PAYMENT_LIVE_APPROVED_REF dengan ref project Supabase production." };
    return { state: "live", apiKey: key };
  }
  return { state: "off", reason: "Format kunci tidak dikenal (harus sk_test_ atau sk_live_)." };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Money: integer Rupiah only
// ---------------------------------------------------------------------------------------------------------------------------------
/** "15305.00" -> 15305. Accepts a decimal string or a number, rejects anything that is not a whole, non-negative Rupiah amount. No floats are involved for strings. */
export function parseRupiah(value: unknown): number {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) throw new PaymenkuError("Nominal dari Paymenku bukan Rupiah utuh.", { kind: "invalid" });
    return value;
  }
  if (typeof value !== "string") throw new PaymenkuError("Nominal dari Paymenku tidak terbaca.", { kind: "invalid" });
  const m = /^(\d{1,13})(?:\.(\d+))?$/.exec(value.trim());
  if (!m || (m[2] && /[1-9]/.test(m[2]))) throw new PaymenkuError("Nominal dari Paymenku bukan Rupiah utuh.", { kind: "invalid" });
  return Number(m[1]);
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Webhook signature
// ---------------------------------------------------------------------------------------------------------------------------------
export type SignatureCheck = { ok: true } | { ok: false; reason: "no_secret" | "missing_header" | "bad_timestamp" | "stale" | "mismatch" };

/**
 * HMAC-SHA256(timestamp + "." + raw body, secret), hex, compared in constant time. The body must be the RAW text exactly as received.
 * The timestamp must be within `toleranceSeconds` (the docs name no tolerance: 5 minutes is our own choice), in seconds or milliseconds.
 */
export function verifyPaymenkuSignature(input: { rawBody: string; signature: string | null; timestamp: string | null; secret: string | undefined; nowMs?: number; toleranceSeconds?: number }): SignatureCheck {
  if (!input.secret) return { ok: false, reason: "no_secret" };
  if (!input.signature || !input.timestamp) return { ok: false, reason: "missing_header" };
  if (!/^\d{9,13}$/.test(input.timestamp)) return { ok: false, reason: "bad_timestamp" };
  const raw = Number(input.timestamp);
  const tsMs = input.timestamp.length >= 13 ? raw : raw * 1000;
  const tolerance = (input.toleranceSeconds ?? WEBHOOK_TOLERANCE_SECONDS) * 1000;
  if (Math.abs((input.nowMs ?? Date.now()) - tsMs) > tolerance) return { ok: false, reason: "stale" };
  const expected = createHmac("sha256", input.secret).update(`${input.timestamp}.${input.rawBody}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(input.signature.trim().toLowerCase());
  return a.length === b.length && timingSafeEqual(a, b) ? { ok: true } : { ok: false, reason: "mismatch" };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Errors and client
// ---------------------------------------------------------------------------------------------------------------------------------
export class PaymenkuError extends Error {
  readonly kind: "config" | "timeout" | "network" | "http" | "rejected" | "invalid" | "rate_limited";
  readonly status: number | null;
  /** The request may have reached Paymenku (timeout, dropped connection, 5xx): never repeat a create blindly. */
  readonly ambiguous: boolean;
  readonly retryAfterSeconds: number | null;
  constructor(message: string, opts: { kind: PaymenkuError["kind"]; status?: number | null; ambiguous?: boolean; retryAfterSeconds?: number | null }) {
    super(message);
    this.name = "PaymenkuError";
    this.kind = opts.kind;
    this.status = opts.status ?? null;
    this.ambiguous = opts.ambiguous ?? false;
    this.retryAfterSeconds = opts.retryAfterSeconds ?? null;
  }
}

export type PaymenkuStatus = "pending" | "paid" | "expired" | "failed" | "cancelled" | "refunded";
const STATUSES = ["pending", "paid", "expired", "failed", "cancelled", "refunded"] as const;

export type PaymenkuChannel = { code: string; name: string; type: string; group: string; flowType: string; feeMode: "merchant" | "customer" | "split"; feeFlat: number; feePercent: number; minAmount: number; maxAmount: number };

export type PaymenkuTransaction = {
  trxId: string;
  referenceId: string;
  /** What the customer pays (Rupiah). */
  amount: number;
  totalFee: number;
  amountReceived: number;
  status: PaymenkuStatus;
  isSandbox: boolean;
  payUrl: string | null;
  channelCode: string | null;
  paidAt: string | null;
  paymentInfo: Record<string, unknown>;
};

const optStr = z.string().nullish();
const txSchema = z.object({
  trx_id: z.string().min(1),
  reference_id: z.string().min(1),
  amount: z.union([z.string(), z.number()]),
  total_fee: z.union([z.string(), z.number()]).nullish(),
  amount_received: z.union([z.string(), z.number()]).nullish(),
  status: z.enum(STATUSES),
  is_sandbox: z.boolean().nullish(),
  pay_url: optStr,
  paid_at: optStr,
  payment_channel: z.union([z.string(), z.object({ code: z.string() }).passthrough()]).nullish(),
  payment_info: z.record(z.string(), z.unknown()).nullish(),
  sandbox_mode: z.boolean().nullish(),
});

/** One transaction object (create / check-status / webhook share the shape) -> our typed, integer-Rupiah form. */
export function parseTransaction(raw: unknown): PaymenkuTransaction {
  const p = txSchema.safeParse(raw);
  if (!p.success) throw new PaymenkuError("Jawaban Paymenku tidak sesuai format.", { kind: "invalid" });
  const d = p.data;
  const amount = parseRupiah(d.amount);
  const totalFee = d.total_fee == null ? 0 : parseRupiah(d.total_fee);
  // when the answer carries no amount_received (create), nothing is claimed about it
  const amountReceived = d.amount_received == null ? amount - totalFee : parseRupiah(d.amount_received);
  const info = (d.payment_info ?? {}) as Record<string, unknown>;
  const channel = typeof d.payment_channel === "string" ? d.payment_channel : (d.payment_channel?.code ?? null);
  return {
    trxId: d.trx_id, referenceId: d.reference_id, amount, totalFee, amountReceived, status: d.status,
    isSandbox: Boolean(d.is_sandbox ?? d.sandbox_mode ?? info.sandbox ?? d.trx_id.startsWith("SBOX")),
    payUrl: d.pay_url ?? null, channelCode: channel, paidAt: d.paid_at ?? null, paymentInfo: info,
  };
}

const SAFE_INFO_KEYS = ["transaction_status", "qr_url", "qr_string", "merchant_name", "expiration_date", "bank", "va_number", "checkout_url", "checkout_url_app", "store", "payment_code", "simulator_url", "sandbox"];
const URL_KEYS = new Set(["qr_url", "checkout_url", "checkout_url_app", "simulator_url"]);

/** Only the known, display-safe fields of payment_info, with https URLs and bounded strings (stored and shown to the owner). */
export function sanitizePaymentInfo(info: Record<string, unknown> | null | undefined): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const key of SAFE_INFO_KEYS) {
    const v = info?.[key];
    if (typeof v === "boolean") out[key] = v;
    else if (typeof v === "string" && v.length > 0 && v.length <= 4000) {
      if (URL_KEYS.has(key) && !/^https?:\/\//i.test(v)) continue;
      out[key] = v;
    }
  }
  return out;
}

export type PaymenkuClientOptions = { apiKey: string; baseUrl?: string; fetchImpl?: typeof fetch; timeoutMs?: number; sleep?: (ms: number) => Promise<void>; maxReadAttempts?: number };

export type CreateTransactionInput = { channelCode: string; amount: number; referenceId: string; customerName: string; customerEmail: string; returnUrl: string; idempotencyKey: string };

export function createPaymenkuClient(opts: PaymenkuClientOptions) {
  const doFetch = opts.fetchImpl ?? fetch;
  const base = (opts.baseUrl ?? PAYMENKU_BASE).replace(/\/+$/, "");
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const maxReads = opts.maxReadAttempts ?? 3;

  async function once(method: "GET" | "POST", path: string, body?: unknown, headers: Record<string, string> = {}): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await doFetch(`${base}${path}`, {
        method, signal: controller.signal, cache: "no-store",
        headers: { Authorization: `Bearer ${opts.apiKey}`, Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      const aborted = (e instanceof Error && e.name === "AbortError") || controller.signal.aborted;
      throw new PaymenkuError(aborted ? "Paymenku tidak merespons (waktu habis)." : "Tidak bisa terhubung ke Paymenku.", { kind: aborted ? "timeout" : "network", ambiguous: true });
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    const msg = (json && typeof json === "object" && typeof (json as { message?: unknown }).message === "string" ? (json as { message: string }).message : "").slice(0, 200);
    if (res.status === 429) {
      const ra = Number(res.headers.get("Retry-After"));
      throw new PaymenkuError("Paymenku membatasi permintaan. Coba lagi sebentar.", { kind: "rate_limited", status: 429, retryAfterSeconds: Number.isFinite(ra) && ra > 0 ? Math.min(ra, 120) : 2 });
    }
    if (res.status >= 500) throw new PaymenkuError(msg || "Paymenku sedang bermasalah.", { kind: "http", status: res.status, ambiguous: true });
    if (!res.ok) throw new PaymenkuError(msg || `Paymenku menolak permintaan (HTTP ${res.status}).`, { kind: "rejected", status: res.status });
    // an error envelope can arrive with HTTP 200
    if (json && typeof json === "object") {
      const j = json as { status?: unknown; success?: unknown };
      if (j.success === false || j.status === "error") throw new PaymenkuError(msg || "Paymenku menolak permintaan.", { kind: "rejected", status: res.status });
    }
    if (json === null) throw new PaymenkuError("Jawaban Paymenku tidak terbaca.", { kind: "invalid", status: res.status, ambiguous: method === "POST" });
    return json;
  }

  /** Reads are safe to repeat: 429 waits Retry-After, 5xx / network / timeout back off (0.5 s, 1.5 s). */
  async function read(path: string): Promise<unknown> {
    let last: unknown;
    for (let attempt = 1; attempt <= maxReads; attempt++) {
      try {
        return await once("GET", path);
      } catch (e) {
        last = e;
        if (!(e instanceof PaymenkuError) || attempt === maxReads) break;
        if (e.kind === "rate_limited") await sleep((e.retryAfterSeconds ?? 2) * 1000 + Math.floor(Math.random() * 250));
        else if (e.ambiguous && e.kind !== "invalid") await sleep(500 * 3 ** (attempt - 1));
        else break;
      }
    }
    throw last;
  }

  const data = (json: unknown): unknown => (json && typeof json === "object" && "data" in json ? (json as { data: unknown }).data : json);

  return {
    /** Channels active for this merchant, with fee mode and limits. */
    async listChannels(): Promise<PaymenkuChannel[]> {
      const rows = data(await read("/payment-channels"));
      if (!Array.isArray(rows)) throw new PaymenkuError("Daftar kanal tidak sesuai format.", { kind: "invalid" });
      const out: PaymenkuChannel[] = [];
      for (const r of rows as Record<string, unknown>[]) {
        const mode = r.fee_mode;
        if (typeof r.code !== "string" || (mode !== "merchant" && mode !== "customer" && mode !== "split")) continue;
        out.push({
          code: r.code, name: String(r.name ?? r.code), type: String(r.type ?? ""), group: String(r.group ?? ""), flowType: String(r.flow_type ?? ""), feeMode: mode,
          feeFlat: Math.max(0, Math.trunc(Number(r.fee_flat) || 0)), feePercent: Math.max(0, Number(r.fee_percent) || 0),
          minAmount: Math.max(0, Math.trunc(Number(r.min_amount) || 0)), maxAmount: Math.max(0, Math.trunc(Number(r.max_amount) || 0)),
        });
      }
      return out;
    },

    /** Fee quote for one channel: what the customer and the merchant each bear for `amount`. */
    async calculateFee(amount: number, code: string): Promise<{ customerFee: number; merchantFee: number } | null> {
      const rows = data(await read(`/merchant/fee-calculator?amount=${encodeURIComponent(String(amount))}&code=${encodeURIComponent(code)}`));
      const row = (Array.isArray(rows) ? rows : [rows]).find((r) => r && typeof r === "object" && (r as { code?: string }).code === code) as { total_fee?: { customer?: unknown; merchant?: unknown } } | undefined;
      if (!row?.total_fee) return null;
      return { customerFee: parseRupiah(row.total_fee.customer ?? 0), merchantFee: parseRupiah(row.total_fee.merchant ?? 0) };
    },

    /** ONE attempt (a repeat could create a second transaction); Idempotency-Key = our deposit id, so a retry by the CALLER replays the first answer. */
    async createTransaction(i: CreateTransactionInput): Promise<PaymenkuTransaction> {
      const json = await once(
        "POST", "/transaction/create",
        { channel_code: i.channelCode, amount: i.amount, reference_id: i.referenceId, customer_name: i.customerName, customer_email: i.customerEmail, return_url: i.returnUrl },
        { "Idempotency-Key": i.idempotencyKey },
      );
      return parseTransaction(data(json));
    },

    /** By trx_id or reference_id (both accepted by the endpoint). */
    async checkStatus(idOrReference: string): Promise<PaymenkuTransaction> {
      return parseTransaction(data(await read(`/check-status/${encodeURIComponent(idOrReference)}`)));
    },

    async cancelTransaction(trxId: string): Promise<{ status: string }> {
      const d = data(await once("POST", "/transaction/cancel", { trx_id: trxId })) as { status?: unknown } | null;
      return { status: typeof d?.status === "string" ? d.status : "cancelled" };
    },

    async walletBalance(): Promise<number | null> {
      const d = data(await read("/wallet/balance")) as { balance?: unknown } | null;
      return d && d.balance != null ? parseRupiah(d.balance) : null;
    },
  };
}

export type PaymenkuClient = ReturnType<typeof createPaymenkuClient>;

/** The client for the current environment, or null when the gateway is off. A custom base URL (tests) is honoured in sandbox mode only. */
export function getPaymenkuClient(env: NodeJS.ProcessEnv = process.env): { client: PaymenkuClient; mode: "sandbox" | "live" } | null {
  const mode = paymenkuMode(env);
  if (mode.state === "off") return null;
  const custom = mode.state === "sandbox" ? clean(env.PAYMENKU_API_BASE) : "";
  return { client: createPaymenkuClient({ apiKey: mode.apiKey, ...(custom ? { baseUrl: custom } : {}) }), mode: mode.state };
}
