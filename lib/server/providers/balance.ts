import "server-only";
import { loadSettings } from "@/lib/server/repo/settings";
import { loadProvider, loadProviders, providerCredentials, updateProvider } from "@/lib/server/repo/providers";
import { ProviderError } from "../provider-client";
import { LIKEO_ID, providerMode } from "./config";
import { createMockAdapter } from "./mock";
import { mockWorld } from "./client";
import { formatProbe, probeBalance, type ProbeResult } from "./probe";
import { nativeToRupiah, providerRate } from "./rates";

export const BALANCE_CACHE_MS = 60_000;

const formatNative = (n: number, currency: string) => `${n.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

export type CheckOutcome = { ok: boolean; message: string; probe?: ProbeResult };

async function recordTest(providerId: string, ok: boolean, message: string, now: Date) {
  await updateProvider(providerId, { last_test: { ok, at: now.toISOString(), message } });
}

/**
 * Reads the balance of ONE provider and records the outcome on its row ("Tes koneksi", "Segarkan" and the cron).
 * mock: the fake adapter. live: ONE real request to the provider URL (action=balance) with diagnostics. A failing live call is
 * an error shown to the admin, never a silent fallback to mock data. Numbers from another mode are never shown.
 * A provider whose currency has no rate yet keeps its native balance; the Rupiah balance stays unknown (null) instead of a wrong number.
 */
export async function checkProvider(providerId: string, opts: { force?: boolean; now?: Date; fetchImpl?: typeof fetch } = {}): Promise<CheckOutcome> {
  const p = await loadProvider(providerId);
  if (!p) return { ok: false, message: "Provider tidak ditemukan." };
  const now = opts.now ?? new Date();
  const mode = providerMode();
  if (!opts.force && p.dataMode === mode && p.balanceAt && now.getTime() - new Date(p.balanceAt).getTime() < BALANCE_CACHE_MS) {
    return { ok: true, message: "Saldo masih segar (cache 60 detik)." };
  }

  if (mode === "off") {
    const message = "Provider belum aktif: PROVIDER_MODE belum diatur (isi live di .env.local lalu restart).";
    await recordTest(p.id, false, message, now);
    return { ok: false, message };
  }

  const rate = providerRate(p, (await loadSettings()).pricing);
  /** Saves the reading. Likeo adopts the currency the provider reports (as before); other providers keep the currency the admin configured. */
  const save = async (native: number, currency: string, m: "mock" | "live") => {
    const idr = nativeToRupiah(native, currency, rate);
    await updateProvider(p.id, { ...(p.id === LIKEO_ID ? { currency } : {}), balance_native: native, balance_idr: idr, balance_at: now.toISOString(), mode: m });
    return idr;
  };
  const unknownNote = (idr: number | null, currency: string) =>
    idr === null ? ` Kurs ${currency} ke Rupiah belum diatur untuk ${p.name}, jadi saldo dalam Rupiah belum bisa dihitung.` : "";

  if (mode === "mock") {
    const started = Date.now();
    try {
      const b = await createMockAdapter(mockWorld(), p.id).getBalance();
      const idr = await save(b.balance, b.currency, "mock");
      const message = `Terhubung (mode mock, data contoh, ${Date.now() - started} ms). Saldo ${formatNative(b.balance, b.currency)}.${unknownNote(idr, b.currency)}`;
      await recordTest(p.id, true, message, now);
      return { ok: true, message };
    } catch (e) {
      const message = e instanceof ProviderError ? e.message : "Koneksi gagal.";
      await recordTest(p.id, false, message, now);
      return { ok: false, message };
    }
  }

  const creds = await providerCredentials(p.id);
  if (!creds?.apiKey || !creds.apiUrl) {
    const message = `API key atau URL ${p.name} belum diisi. Simpan keduanya di halaman Provider.`;
    await recordTest(p.id, false, message, now);
    return { ok: false, message };
  }
  const probe = await probeBalance({ apiUrl: creds.apiUrl, apiKey: creds.apiKey, fetchImpl: opts.fetchImpl, providerName: p.name });
  const message = formatProbe(probe);
  await recordTest(p.id, probe.ok, message, now);
  if (probe.ok && probe.balance !== undefined) {
    const currency = probe.currency ?? "USD";
    const idr = await save(probe.balance, currency, "live");
    return { ok: true, message: idr === null ? `${message}.${unknownNote(idr, currency)}` : `${message} (≈ Rp ${idr.toLocaleString("id-ID")})`, probe };
  }
  return { ok: false, message, probe };
}

/** The first provider (Likeo). Kept for callers that predate multi-provider. */
export const checkLikeo = (opts: Parameters<typeof checkProvider>[1] = {}) => checkProvider(LIKEO_ID, opts);

/**
 * Refreshes the balance of every ACTIVE provider. One provider failing (or throwing) never stops the others; each failure is recorded on
 * its own card. Returns the outcome per provider id.
 */
export async function checkAllProviders(opts: Parameters<typeof checkProvider>[1] = {}): Promise<Record<string, CheckOutcome>> {
  const providers = (await loadProviders()).filter((p) => p.status === "aktif");
  const settled = await Promise.allSettled(providers.map((p) => checkProvider(p.id, opts)));
  const out: Record<string, CheckOutcome> = {};
  settled.forEach((r, i) => {
    out[providers[i].id] = r.status === "fulfilled" ? r.value : { ok: false, message: "Pengecekan saldo gagal." };
  });
  return out;
}
