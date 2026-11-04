/**
 * Provider configuration. Environment only: the key never goes to the client, never into the dev store.
 * LIKEO_API_URL (default https://likeo.net/api/v2), LIKEO_API_KEY, PROVIDER_MODE=mock|live (default mock).
 */
import { existsSync, readFileSync } from "node:fs";
import { ProviderError } from "../provider-client";

export const LIKEO_ID = "prv_likeo";
export const LIKEO_NAME = "Likeo";
export const LIKEO_DEFAULT_URL = "https://likeo.net/api/v2";

export type ProviderMode = "mock" | "live";

/**
 * THE single source of truth for the mode: the PROVIDER_MODE environment variable, read on every call (never cached,
 * never stored). "live" means live; anything else (unset, empty, a typo) means mock.
 */
export const providerMode = (): ProviderMode => (process.env.PROVIDER_MODE?.trim().replace(/^["']|["']$/g, "").toLowerCase() === "live" ? "live" : "mock");

export type ModeInfo = {
  mode: ProviderMode;
  /** Raw value as Next.js loaded it (null = the variable does not exist). Not secret. */
  raw: string | null;
  /** Human text, e.g. "dari .env.local" or "PROVIDER_MODE tidak ditemukan di environment, jadi default mock". */
  source: string;
  /** Set when the value is something other than "live"/"mock", so a typo is visible instead of silently meaning mock. */
  warning: string | null;
};

const ENV_FILES = [".env.development.local", ".env.local", ".env.development", ".env"]; // Next.js precedence in `next dev`

/** Which env file defines `name` (dev only: reads the files from disk, values are never returned). */
export function envFileDefining(name: string): string | null {
  if (process.env.NODE_ENV === "production" || process.env.VITEST) return null;
  try {
    for (const file of ENV_FILES) {
      if (!existsSync(file)) continue;
      const defined = readFileSync(file, "utf8")
        .split(String.fromCharCode(10))
        .map((line) => line.trim().replace(/^export\s+/, ""))
        .some((line) => line.startsWith(`${name}=`) || line.startsWith(`${name} =`));
      if (defined) return file;
    }
  } catch {
    /* unreadable: no source file shown */
  }
  return null;
}

export function resolveModeInfo(): ModeInfo {
  const mode = providerMode();
  const rawValue = process.env.PROVIDER_MODE;
  const raw = rawValue === undefined ? null : rawValue;
  if (raw === null || raw.trim() === "") {
    return { mode, raw, source: raw === null ? "PROVIDER_MODE tidak ada di environment, jadi default mock" : "PROVIDER_MODE kosong, jadi default mock", warning: null };
  }
  const file = envFileDefining("PROVIDER_MODE");
  const source = file ? `dari ${file}` : "dari environment proses";
  const clean = raw.trim().replace(/^["']|["']$/g, "").toLowerCase();
  const warning = clean === "live" || clean === "mock" ? null : `Nilai PROVIDER_MODE "${raw.slice(0, 20)}" tidak dikenal, jadi dianggap mock. Pakai "live" atau "mock".`;
  return { mode, raw, source, warning };
}

/** One safe line for the server console (dev): mode, source, whether a key exists (boolean), URL. Never the key. */
export function describeConfig(): string {
  const info = resolveModeInfo();
  const keySet = Boolean(process.env.LIKEO_API_KEY?.trim() && process.env.LIKEO_API_KEY.trim() !== PLACEHOLDER);
  return `[provider] PROVIDER_MODE=${info.raw === null ? "(tidak diatur)" : JSON.stringify(info.raw)} -> mode=${info.mode} (${info.source}); LIKEO_API_KEY terisi=${keySet}; LIKEO_API_URL=${likeoApiUrl()}`;
}

export const likeoApiUrl = (): string => process.env.LIKEO_API_URL?.trim() || LIKEO_DEFAULT_URL;

const PLACEHOLDER = "isi_api_key_likeo_di_sini";

/** Throws a clear developer error when the key is missing (live mode only). */
export function likeoApiKey(): string {
  const key = process.env.LIKEO_API_KEY?.trim();
  if (!key || key === PLACEHOLDER) {
    throw new ProviderError("LIKEO_API_KEY belum diisi. Isi di .env.local (lihat .env.example) atau pakai PROVIDER_MODE=mock.", { kind: "config" });
  }
  return key;
}

/** Last 4 characters only. */
export function maskApiKey(key: string | undefined | null): string {
  if (!key || key === PLACEHOLDER) return "belum diatur";
  return `${"•".repeat(12)}${key.slice(-4)}`;
}

export const maskedLikeoKey = (): string => maskApiKey(process.env.LIKEO_API_KEY?.trim() || "");

/** Removes every occurrence of the given secrets from a text (used before anything is logged or returned). */
export function redact(text: string, ...secrets: (string | undefined)[]): string {
  let out = text;
  for (const s of secrets) if (s && s.length >= 4) out = out.split(s).join(`${"•".repeat(8)}${s.slice(-4)}`);
  return out;
}
