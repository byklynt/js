/**
 * Live diagnostics: one real `action=balance` request, with everything needed to see what the provider actually answers.
 * Used by "Tes koneksi" / "Segarkan" in live mode. It reports the HTTP status, the latency, the reason in Indonesian and the
 * first 200 characters of the response body with the key removed. It never falls back to mock data.
 */
import { redact } from "./config";
import { translateProviderError } from "./smm-v2";

export type ProbeReason = "ok" | "key_salah" | "url_salah" | "timeout" | "jaringan" | "server" | "format" | "ditolak";

export type ProbeResult = {
  ok: boolean;
  reason: ProbeReason;
  /** Indonesian, without the response body. */
  message: string;
  httpStatus: number | null;
  latencyMs: number;
  /** First 200 characters of the response body, key removed. */
  preview: string;
  balance?: number;
  currency?: string;
};

export const PREVIEW_CHARS = 200;

const reasonText = (name: string): Record<Exclude<ProbeReason, "ok">, string> => ({
  key_salah: `API key salah atau ditolak oleh ${name}`,
  url_salah: "URL API salah atau tidak ditemukan",
  timeout: `${name} tidak merespons dalam batas waktu`,
  jaringan: "Tidak bisa terhubung ke URL (jaringan, DNS atau sertifikat)",
  server: `Server ${name} bermasalah`,
  format: "Format respons tidak dikenali",
  ditolak: `${name} menolak permintaan`,
});

export const cleanPreview = (body: string, key: string) => redact(body.replace(/\s+/g, " ").trim(), key).slice(0, PREVIEW_CHARS);

export async function probeBalance(opts: { apiUrl: string; apiKey: string; fetchImpl?: typeof fetch; timeoutMs?: number; providerName?: string }): Promise<ProbeResult> {
  const name = opts.providerName ?? "Likeo";
  const REASON_TEXT = reasonText(name);
  const doFetch = opts.fetchImpl ?? fetch;
  const started = Date.now();
  const latency = () => Date.now() - started;
  const fail = (reason: Exclude<ProbeReason, "ok">, httpStatus: number | null, preview: string, detail = ""): ProbeResult => ({
    ok: false, reason, message: `${REASON_TEXT[reason]}${detail ? ` (${detail})` : ""}.`, httpStatus, latencyMs: latency(), preview,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15_000);
  let res: Response;
  try {
    // redirect: "manual" so a http -> https or trailing-slash redirect (which turns a POST into a GET) is visible, not hidden.
    res = await doFetch(opts.apiUrl, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ key: opts.apiKey, action: "balance" }).toString(), signal: controller.signal, redirect: "manual", cache: "no-store",
    });
  } catch (e) {
    clearTimeout(timer);
    const err = e as { name?: string; message?: string; cause?: { code?: string; message?: string } };
    if (err.name === "AbortError" || controller.signal.aborted) return fail("timeout", null, "");
    const code = err.cause?.code ?? "";
    return fail("jaringan", null, redact(err.cause?.message ?? err.message ?? "", opts.apiKey).slice(0, PREVIEW_CHARS), code);
  }
  let body = "";
  try {
    body = await res.text();
  } catch {
    /* empty body */
  } finally {
    clearTimeout(timer);
  }
  const preview = cleanPreview(body, opts.apiKey);
  const status = res.status;

  if (status >= 300 && status < 400) return fail("url_salah", status, preview, `dialihkan ke ${redact(res.headers.get("location") ?? "?", opts.apiKey).slice(0, 80)}, ubah URL API provider ke alamat tujuan`);
  if (status === 401 || status === 403) return fail("key_salah", status, preview, `HTTP ${status}`);
  if (status === 404 || status === 405) return fail("url_salah", status, preview, `HTTP ${status}`);
  if (status >= 500) return fail("server", status, preview, `HTTP ${status}`);

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    const looksHtml = /^\s*<(!doctype|html)/i.test(body);
    return fail("format", status, preview, looksHtml ? "balasan berupa halaman HTML, bukan JSON; URL kemungkinan salah atau diblokir" : "balasan bukan JSON");
  }
  if (json && typeof json === "object" && !Array.isArray(json) && typeof (json as { error?: unknown }).error === "string") {
    const raw = (json as { error: string }).error;
    const mapped = translateProviderError(raw, name);
    const keyProblem = /api key|invalid key|incorrect request|unauthori[sz]ed/i.test(raw);
    return { ...fail(keyProblem ? "key_salah" : "ditolak", status, preview, mapped.replace(/\.$/, "")), message: `${mapped}` };
  }
  const balance = Number((json as { balance?: unknown } | null)?.balance);
  if (json && typeof json === "object" && "balance" in json && Number.isFinite(balance)) {
    const currency = String((json as { currency?: unknown }).currency ?? "USD");
    return { ok: true, reason: "ok", message: "Terhubung.", httpStatus: status, latencyMs: latency(), preview, balance, currency };
  }
  return fail("format", status, preview, "tidak ada field balance di respons");
}

/** One line for the card and the toast. */
export function formatProbe(r: ProbeResult): string {
  const parts = [r.ok ? "Berhasil" : `Gagal: ${r.message}`];
  if (r.httpStatus !== null) parts.push(`HTTP ${r.httpStatus}`);
  parts.push(`${r.latencyMs} ms`);
  if (r.ok && r.balance !== undefined) parts.push(`saldo ${r.balance.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${r.currency}`);
  if (!r.ok && r.preview) parts.push(`Respons: ${r.preview}`);
  return parts.join(" · ");
}
