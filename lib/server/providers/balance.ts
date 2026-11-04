import type { AdminDb, ProviderRecord } from "@/lib/admin-data";
import { ProviderError } from "../provider-client";
import { likeoApiKey, likeoApiUrl, LIKEO_ID, providerMode, type ProviderMode } from "./config";
import { createMockAdapter } from "./mock";
import { formatProbe, probeBalance, type ProbeResult } from "./probe";

export const BALANCE_CACHE_MS = 60_000;

const formatNative = (n: number, currency: string) => `${n.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

function toRupiah(db: AdminDb, native: number, currency: string): number {
  const p = db.settings.pricing;
  return Math.round(currency.toUpperCase() === p.currency.toUpperCase() ? native * p.rateIdr : native);
}

const likeoOf = (db: AdminDb) => db.providers.find((x) => x.id === LIKEO_ID);

/**
 * Keeps stored provider data honest about the CURRENT mode (called on every getDb()):
 * - numbers that came from the mock (or from the other mode) are cleared when the mode changed, so a live card never shows
 *   a fake balance;
 * - in live mode the demo providers (Alfa, Beta, Gamma) are removed, so their fake balances stay off the dashboard.
 * The mode itself is never stored: it is read from PROVIDER_MODE each time.
 */
export function reconcileProviderMode(db: AdminDb, mode: ProviderMode = providerMode()): void {
  const p = likeoOf(db);
  if (p && p.dataMode !== mode) {
    p.balanceNative = undefined;
    p.balanceAt = null;
    p.lastTest = null;
    p.balance = 0;
    p.dataMode = mode;
  }
  // Demo providers exist only in mock mode (tests / explicit experiments).
  if (mode !== "mock" && db.providers.some((x) => !x.kind)) db.providers = db.providers.filter((x) => x.kind);
}

export type CheckOutcome = { ok: boolean; message: string; probe?: ProbeResult };

function storeBalance(db: AdminDb, p: ProviderRecord, balance: number, currency: string, now: Date, mode: "mock" | "live") {
  p.currency = currency;
  p.balanceNative = balance;
  p.balance = toRupiah(db, balance, currency);
  p.balanceAt = now.toISOString();
  p.dataMode = mode;
}

/**
 * Reads the Likeo balance and records the outcome on the provider ("Tes koneksi" and "Segarkan").
 * mock: the fake adapter. live: ONE real request to LIKEO_API_URL (action=balance) with diagnostics. A failing live call is an
 * error shown to the admin, never a silent fallback to mock data.
 */
export async function checkLikeo(db: AdminDb, opts: { force?: boolean; now?: Date; fetchImpl?: typeof fetch } = {}): Promise<CheckOutcome> {
  const p = likeoOf(db);
  if (!p) return { ok: false, message: "Provider Likeo tidak ada." };
  const now = opts.now ?? new Date();
  const mode = providerMode();
  if (!opts.force && p.dataMode === mode && p.balanceAt && now.getTime() - new Date(p.balanceAt).getTime() < BALANCE_CACHE_MS) {
    return { ok: true, message: "Saldo masih segar (cache 60 detik)." };
  }

  if (mode === "off") {
    const message = "Provider belum aktif: PROVIDER_MODE belum diatur (isi live di .env.local lalu restart).";
    p.lastTest = { ok: false, at: now.toISOString(), message };
    return { ok: false, message };
  }

  if (mode === "mock") {
    const started = Date.now();
    try {
      const b = await createMockAdapter(db).getBalance();
      storeBalance(db, p, b.balance, b.currency, now, "mock");
      const message = `Terhubung (mode mock, data contoh, ${Date.now() - started} ms). Saldo ${formatNative(b.balance, b.currency)}.`;
      p.lastTest = { ok: true, at: now.toISOString(), message };
      return { ok: true, message };
    } catch (e) {
      const message = e instanceof ProviderError ? e.message : "Koneksi gagal.";
      p.lastTest = { ok: false, at: now.toISOString(), message };
      return { ok: false, message };
    }
  }

  // live
  let apiKey: string;
  try {
    apiKey = likeoApiKey();
  } catch (e) {
    const message = e instanceof ProviderError ? e.message : "LIKEO_API_KEY belum diisi.";
    p.lastTest = { ok: false, at: now.toISOString(), message };
    return { ok: false, message };
  }
  const probe = await probeBalance({ apiUrl: likeoApiUrl(), apiKey, fetchImpl: opts.fetchImpl });
  const message = formatProbe(probe);
  p.lastTest = { ok: probe.ok, at: now.toISOString(), message };
  if (probe.ok && probe.balance !== undefined) {
    storeBalance(db, p, probe.balance, probe.currency ?? "USD", now, "live");
    return { ok: true, message: `${message} (≈ Rp ${p.balance.toLocaleString("id-ID")})`, probe };
  }
  return { ok: false, message, probe };
}
