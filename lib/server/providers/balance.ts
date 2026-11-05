import "server-only";
import { loadSettings } from "@/lib/server/repo/settings";
import { likeoCredentials, loadProvider, updateProvider } from "@/lib/server/repo/providers";
import { ProviderError } from "../provider-client";
import { LIKEO_ID, providerMode } from "./config";
import { createMockAdapter } from "./mock";
import { mockWorld } from "./client";
import { formatProbe, probeBalance, type ProbeResult } from "./probe";

export const BALANCE_CACHE_MS = 60_000;

const formatNative = (n: number, currency: string) => `${n.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

export type CheckOutcome = { ok: boolean; message: string; probe?: ProbeResult };

async function toRupiah(native: number, currency: string): Promise<number> {
  const p = (await loadSettings()).pricing;
  return Math.round(currency.toUpperCase() === p.currency.toUpperCase() ? native * p.rateIdr : native);
}

async function recordTest(ok: boolean, message: string, now: Date) {
  await updateProvider(LIKEO_ID, { last_test: { ok, at: now.toISOString(), message } });
}

/**
 * Reads the Likeo balance and records the outcome on the provider row ("Tes koneksi" and "Segarkan").
 * mock: the fake adapter. live: ONE real request to the provider URL (action=balance) with diagnostics. A failing live call is
 * an error shown to the admin, never a silent fallback to mock data. Numbers from another mode are never shown.
 */
export async function checkLikeo(opts: { force?: boolean; now?: Date; fetchImpl?: typeof fetch } = {}): Promise<CheckOutcome> {
  const p = await loadProvider(LIKEO_ID);
  if (!p) return { ok: false, message: "Provider Likeo tidak ada. Jalankan npm run bootstrap." };
  const now = opts.now ?? new Date();
  const mode = providerMode();
  if (!opts.force && p.dataMode === mode && p.balanceAt && now.getTime() - new Date(p.balanceAt).getTime() < BALANCE_CACHE_MS) {
    return { ok: true, message: "Saldo masih segar (cache 60 detik)." };
  }

  if (mode === "off") {
    const message = "Provider belum aktif: PROVIDER_MODE belum diatur (isi live di .env.local lalu restart).";
    await recordTest(false, message, now);
    return { ok: false, message };
  }

  if (mode === "mock") {
    const started = Date.now();
    try {
      const b = await createMockAdapter(mockWorld()).getBalance();
      await updateProvider(LIKEO_ID, { currency: b.currency, balance_native: b.balance, balance_idr: await toRupiah(b.balance, b.currency), balance_at: now.toISOString(), mode: "mock" });
      const message = `Terhubung (mode mock, data contoh, ${Date.now() - started} ms). Saldo ${formatNative(b.balance, b.currency)}.`;
      await recordTest(true, message, now);
      return { ok: true, message };
    } catch (e) {
      const message = e instanceof ProviderError ? e.message : "Koneksi gagal.";
      await recordTest(false, message, now);
      return { ok: false, message };
    }
  }

  const { apiUrl, apiKey } = await likeoCredentials();
  if (!apiKey) {
    const message = "API key Likeo belum diisi (jalankan npm run bootstrap setelah mengisi LIKEO_API_KEY dan PROVIDER_KEY_ENC_KEY).";
    await recordTest(false, message, now);
    return { ok: false, message };
  }
  const probe = await probeBalance({ apiUrl, apiKey, fetchImpl: opts.fetchImpl });
  const message = formatProbe(probe);
  await recordTest(probe.ok, message, now);
  if (probe.ok && probe.balance !== undefined) {
    const idr = await toRupiah(probe.balance, probe.currency ?? "USD");
    await updateProvider(LIKEO_ID, { currency: probe.currency ?? "USD", balance_native: probe.balance, balance_idr: idr, balance_at: now.toISOString(), mode: "live" });
    return { ok: true, message: `${message} (≈ Rp ${idr.toLocaleString("id-ID")})`, probe };
  }
  return { ok: false, message, probe };
}
