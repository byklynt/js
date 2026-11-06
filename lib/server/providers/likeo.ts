/**
 * Likeo adapter: the standard SMM-panel "API v2" convention (as used by PerfectPanel-style panels).
 * POST application/x-www-form-urlencoded to the API URL with `key` and `action`, JSON back.
 * ASSUMED, not verified against Likeo's own docs: see README.md in this folder for the list.
 */
import { z } from "zod";
import { ProviderError } from "../provider-client";
import { redact } from "./config";
import {
  MAX_STATUS_BATCH,
  type BatchStatusItem, type CancelResult, type CancelStatusItem, type RefillState, type RefillStatusItem, type MappedProviderStatus, type ProviderAdapter, type ProviderBalance,
  type ProviderOrderStatus, type ProviderServiceInfo,
} from "./types";

export const REQUEST_TIMEOUT_MS = 15_000;
export const READ_RETRIES = 2;

export type LikeoOptions = {
  apiUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Injected so tests do not really wait. */
  sleep?: (ms: number) => Promise<void>;
  /** Receives safe, key-free diagnostics. Defaults to console.warn. */
  log?: (event: string, meta: Record<string, unknown>) => void;
  mode?: "mock" | "live";
  /** Allow Custom Comments orders (the comments parameter is unverified, so this is off unless PROVIDER_CUSTOM_COMMENTS=1). */
  customComments?: boolean;
};

// ---------------------------------------------------------------------------
// Status mapping
// ---------------------------------------------------------------------------

/** Pending -> menunggu, Processing / In progress -> berjalan, Completed -> selesai, Partial -> sebagian, Canceled -> dibatalkan, Fail/Failed/Error -> gagal. */
export function mapLikeoStatus(raw: string): MappedProviderStatus {
  switch (raw.trim().toLowerCase().replace(/[\s_-]+/g, " ")) {
    case "pending":
      return "menunggu";
    case "processing":
    case "in progress":
    case "inprogress":
      return "berjalan";
    case "completed":
    case "complete":
      return "selesai";
    case "partial":
      return "sebagian";
    case "canceled":
    case "cancelled":
      return "dibatalkan";
    case "fail":
    case "failed":
    case "error":
      return "gagal";
    default:
      return null;
  }
}

/** Pending -> menunggu, In progress / Processing -> berjalan, Completed -> selesai, Rejected / Error / Failed / Canceled -> ditolak. */
export function mapRefillStatus(raw: string): RefillState | null {
  switch (raw.trim().toLowerCase().replace(/[\s_-]+/g, " ")) {
    case "pending":
      return "menunggu";
    case "processing":
    case "in progress":
    case "inprogress":
      return "berjalan";
    case "completed":
    case "complete":
      return "selesai";
    case "rejected":
    case "error":
    case "fail":
    case "failed":
    case "canceled":
    case "cancelled":
      return "ditolak";
    default:
      return null;
  }
}

/** Cancellation outcome from the order status: Canceled = confirmed; Completed / Partial / Fail = too late (rejected); anything else is still pending. */
export function cancelStateFromStatus(raw: string): "confirmed" | "pending" | "rejected" {
  const mapped = mapLikeoStatus(raw);
  if (mapped === "dibatalkan") return "confirmed";
  if (mapped === "selesai" || mapped === "sebagian" || mapped === "gagal") return "rejected";
  return "pending";
}

// ---------------------------------------------------------------------------
// Error text (Indonesian)
// ---------------------------------------------------------------------------

/** Maps the provider's English error strings to Indonesian. Unknown text is passed on, shortened. */
export function translateProviderError(message: string): string {
  const m = message.trim().toLowerCase();
  if (m.includes("api key") || m.includes("invalid key") || m.includes("incorrect request") || m.includes("unauthorized")) return "API key Likeo tidak valid atau tidak punya akses.";
  if (m.includes("not enough funds") || m.includes("insufficient") || m.includes("low balance")) return "Saldo di Likeo tidak cukup.";
  if (m.includes("incorrect service") || (m.includes("service") && m.includes("not"))) return "Layanan tidak ditemukan di Likeo.";
  if (m.includes("incorrect order") || m.includes("order not found") || m.includes("no such order")) return "ID pesanan tidak ditemukan di Likeo.";
  if (m.includes("incorrect link") || m.includes("invalid link")) return "Likeo menolak link ini.";
  if (m.includes("quantity")) return "Likeo menolak jumlah pesanan ini (di luar batas min/maks).";
  if (m.includes("active order") || m.includes("same link")) return "Masih ada pesanan aktif untuk link yang sama di Likeo.";
  if (m.includes("refill") && (m.includes("not") || m.includes("cannot") || m.includes("unavailable"))) return "Refill belum bisa diajukan untuk pesanan ini.";
  if (m.includes("cancel") && (m.includes("not") || m.includes("cannot"))) return "Pesanan ini tidak bisa dibatalkan di Likeo.";
  if (m.includes("too many") || m.includes("rate limit")) return "Terlalu banyak permintaan ke Likeo. Coba lagi sebentar.";
  return `Likeo menolak permintaan: ${message.trim().slice(0, 120)}`;
}

// ---------------------------------------------------------------------------
// Response schemas (zod). Panels send numbers as strings, so everything is coerced.
// ---------------------------------------------------------------------------

const num = z.preprocess((v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : v), z.number().finite());
const flag = z.preprocess((v) => (typeof v === "string" ? ["1", "true", "yes"].includes(v.toLowerCase()) : typeof v === "number" ? v !== 0 : v), z.boolean());
const text = z.preprocess((v) => (typeof v === "number" ? String(v) : v), z.string());

const serviceRow = z.object({
  service: text, name: z.string(), type: z.string().optional().default("Default"), category: z.string().optional().default("Lainnya"),
  rate: num, min: num, max: num, refill: flag.optional().default(false), cancel: flag.optional().default(false),
});
const errorBody = z.object({ error: z.string() });
const addBody = z.object({ order: text });
const statusRow = z.object({ status: z.string(), start_count: num.optional().default(0), remains: num.optional().default(0), charge: num.optional(), currency: z.string().optional() });
const balanceBody = z.object({ balance: num, currency: z.string().optional().default("USD") });
const refillBody = z.object({ refill: text });
const refillStatusRow = z.object({ refill: text, status: z.union([z.string(), z.object({ error: z.string() })]) });
const cancelRow = z.object({ order: text, cancel: z.union([z.number(), z.string(), z.object({ error: z.string() })]) });

// ---------------------------------------------------------------------------

export function createLikeoAdapter(opts: LikeoOptions): ProviderAdapter {
  const doFetch = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const log = opts.log ?? ((event, meta) => { if (!process.env.VITEST) console.warn(`[provider:likeo] ${event}`, meta); });
  const safe = (t: string) => redact(t, opts.apiKey);

  /** One HTTP round trip. Never logs or returns the request body (it holds the key). */
  async function once(action: string, params: Record<string, string>): Promise<unknown> {
    const body = new URLSearchParams({ key: opts.apiKey, action, ...params });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await doFetch(opts.apiUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: body.toString(), signal: controller.signal, cache: "no-store" });
    } catch (e) {
      const aborted = (e instanceof Error && e.name === "AbortError") || controller.signal.aborted;
      log(aborted ? "timeout" : "network_error", { action, message: safe(e instanceof Error ? e.message : "error").slice(0, 120) });
      throw new ProviderError(aborted ? "Likeo tidak merespons (waktu habis)." : "Tidak bisa terhubung ke Likeo.", { kind: aborted ? "timeout" : "network", ambiguous: true });
    } finally {
      clearTimeout(timer);
    }
    if (res.status >= 500) {
      log("http_5xx", { action, status: res.status });
      throw new ProviderError(`Likeo sedang bermasalah (HTTP ${res.status}).`, { kind: "http", ambiguous: true });
    }
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      log("invalid_json", { action, status: res.status });
      throw new ProviderError("Jawaban Likeo tidak bisa dibaca.", { kind: "invalid", ambiguous: true });
    }
    // {"error": "..."} comes with HTTP 200 on most panels, but accept it on 4xx too.
    const err = errorBody.safeParse(json);
    if (err.success) {
      log("provider_error", { action, status: res.status, message: safe(err.data.error).slice(0, 120) });
      throw new ProviderError(translateProviderError(err.data.error), { kind: "provider", ambiguous: false });
    }
    if (!res.ok) throw new ProviderError(`Likeo menjawab HTTP ${res.status}.`, { kind: "http", ambiguous: false });
    return json;
  }

  /** Read calls: up to 2 retries with backoff on network errors / timeouts / 5xx. */
  async function read(action: string, params: Record<string, string> = {}): Promise<unknown> {
    let last: unknown;
    for (let attempt = 0; attempt <= READ_RETRIES; attempt++) {
      try {
        return await once(action, params);
      } catch (e) {
        last = e;
        const retryable = e instanceof ProviderError && e.ambiguous && e.kind !== "invalid";
        if (!retryable || attempt === READ_RETRIES) break;
        await sleep(500 * 3 ** attempt);
      }
    }
    throw last;
  }

  const bad = (what: string) => new ProviderError(`Jawaban Likeo untuk ${what} tidak sesuai format yang diharapkan.`, { kind: "invalid", ambiguous: true });

  const toStatus = (row: z.infer<typeof statusRow>): ProviderOrderStatus => ({
    raw: row.status, status: mapLikeoStatus(row.status), startCount: Math.max(0, Math.trunc(row.start_count)), remains: Math.max(0, Math.trunc(row.remains)),
    charge: row.charge ?? null, currency: row.currency ?? null,
  });

  return {
    mode: opts.mode ?? "live",

    async getServices() {
      const json = await read("services");
      if (!Array.isArray(json)) throw bad("daftar layanan");
      const out: ProviderServiceInfo[] = [];
      let skipped = 0;
      for (const row of json) {
        const p = serviceRow.safeParse(row);
        if (!p.success) { skipped++; continue; }
        const r = p.data;
        out.push({ id: r.service, name: r.name, category: r.category, rate: r.rate, min: Math.trunc(r.min), max: Math.trunc(r.max), refill: r.refill, cancel: r.cancel, type: r.type });
      }
      if (skipped) log("services_skipped", { skipped, total: json.length });
      if (json.length > 0 && out.length === 0) throw bad("daftar layanan");
      return out;
    },

    async getBalance(): Promise<ProviderBalance> {
      const p = balanceBody.safeParse(await read("balance"));
      if (!p.success) throw bad("saldo");
      return { balance: p.data.balance, currency: p.data.currency };
    },

    async createOrder({ serviceId, link, quantity, comments }) {
      // One attempt only. Any ambiguous failure (timeout, 5xx, dropped connection) is surfaced as such so the caller
      // marks the order for a manual check instead of sending it again.
      // Custom Comments: PerfectPanel convention (UNVERIFIED for Likeo): service, link, comments = one comment per line (LF); the quantity is
      // the number of lines, so it is not sent. Off unless explicitly enabled; a refusal here is definite (nothing was sent), never ambiguous.
      if (comments && comments.length) {
        if (!(opts.customComments ?? false)) throw new ProviderError("Pesanan Custom Comments belum diaktifkan untuk Likeo.", { kind: "config" });
        const p2 = addBody.safeParse(await once("add", { service: serviceId, link, comments: comments.join(String.fromCharCode(10)) }));
        if (!p2.success) throw new ProviderError("Jawaban Likeo untuk pesanan tidak sesuai format. Cek manual di Likeo.", { kind: "invalid", ambiguous: true });
        return { orderId: p2.data.order };
      }
      const p = addBody.safeParse(await once("add", { service: serviceId, link, quantity: String(quantity) }));
      if (!p.success) throw new ProviderError("Jawaban Likeo untuk pesanan tidak sesuai format. Cek manual di Likeo.", { kind: "invalid", ambiguous: true });
      return { orderId: p.data.order };
    },

    async getOrderStatus(id) {
      const p = statusRow.safeParse(await read("status", { order: id }));
      if (!p.success) throw bad("status pesanan");
      return toStatus(p.data);
    },

    async getOrdersStatus(ids) {
      const out: Record<string, BatchStatusItem> = {};
      for (let i = 0; i < ids.length; i += MAX_STATUS_BATCH) {
        const chunk = ids.slice(i, i + MAX_STATUS_BATCH);
        const json = await read("status", { orders: chunk.join(",") });
        if (typeof json !== "object" || json === null || Array.isArray(json)) throw bad("status pesanan");
        const record = json as Record<string, unknown>;
        for (const id of chunk) {
          const row = record[id];
          const e = errorBody.safeParse(row);
          if (e.success) { out[id] = { ok: false, error: translateProviderError(e.data.error) }; continue; }
          const p = statusRow.safeParse(row);
          out[id] = p.success ? { ok: true, status: toStatus(p.data) } : { ok: false, error: "Status tidak ada di jawaban Likeo." };
        }
      }
      return out;
    },

    async requestRefill(id) {
      const p = refillBody.safeParse(await once("refill", { order: id }));
      if (!p.success) throw bad("refill");
      return { refillId: p.data.refill };
    },

    async getRefillStatuses(refillIds) {
      const out: Record<string, RefillStatusItem> = {};
      for (let i = 0; i < refillIds.length; i += MAX_STATUS_BATCH) {
        const chunk = refillIds.slice(i, i + MAX_STATUS_BATCH);
        const json = await read("refill_status", { refills: chunk.join(",") });
        // Multi form: [{ "refill": "1", "status": "Completed" }, { "refill": "2", "status": { "error": "..." } }]; a lone object is accepted for one id.
        const rows = Array.isArray(json) ? json : [json];
        for (const row of rows) {
          const p = refillStatusRow.safeParse(row);
          if (p.success) out[p.data.refill] = typeof p.data.status === "object" ? { ok: false, error: translateProviderError(p.data.status.error) } : { ok: true, raw: p.data.status, state: mapRefillStatus(p.data.status) };
          else if (chunk.length === 1 && typeof row === "object" && row !== null && typeof (row as { status?: unknown }).status === "string") {
            const raw = (row as { status: string }).status;
            out[chunk[0]] = { ok: true, raw, state: mapRefillStatus(raw) };
          }
        }
        for (const id of chunk) out[id] ??= { ok: false, error: "Status refill tidak ada di jawaban Likeo." };
      }
      return out;
    },

    async getCancelStatuses(providerOrderIds) {
      const out: Record<string, CancelStatusItem> = {};
      const statuses = await this.getOrdersStatus(providerOrderIds);
      for (const id of providerOrderIds) {
        const item = statuses[id];
        out[id] = item?.ok ? { ok: true, raw: item.status.raw, state: cancelStateFromStatus(item.status.raw) } : { ok: false, error: item?.ok === false ? item.error : "Status tidak ada di jawaban Likeo." };
      }
      return out;
    },

    async requestCancel(ids) {
      const json = await once("cancel", { orders: ids.slice(0, MAX_STATUS_BATCH).join(",") });
      if (!Array.isArray(json)) throw bad("pembatalan");
      const out: Record<string, CancelResult> = {};
      for (const row of json) {
        const p = cancelRow.safeParse(row);
        if (!p.success) continue;
        const c = p.data.cancel;
        out[p.data.order] = typeof c === "object" ? { ok: false, error: translateProviderError(c.error) } : { ok: true };
      }
      for (const id of ids) out[id] ??= { ok: false, error: "Tidak ada jawaban untuk pesanan ini." };
      return out;
    },
  };
}
