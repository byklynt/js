/**
 * Provider configuration. Environment only: the key never goes to the client, never into the dev store.
 * LIKEO_API_URL (default https://likeo.net/api/v2), LIKEO_API_KEY, PROVIDER_MODE=mock|live (default mock).
 */
import { existsSync, readFileSync } from "node:fs";
import { ProviderError } from "../provider-client";

/** Fixed id of the Likeo provider row (providers.id is a uuid); the bootstrap script inserts it. */
export const LIKEO_ID = "5c1e0a00-0000-4000-8000-00000000e001";
export const LIKEO_NAME = "Likeo";
export const LIKEO_DEFAULT_URL = "https://likeo.net/api/v2";

/** live = real Likeo calls. mock = deterministic fake data, ONLY when explicitly selected. off = not configured: nothing is faked. */
export type ProviderMode = "mock" | "live" | "off";

/** "https://abcdefghijklmnopqrst.supabase.co" -> the project ref; null for anything else (local stack, unknown host). */
export function supabaseTargetRef(url: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL): string | null {
  try {
    const u = new URL(url ?? "");
    const m = /^([a-z]{20})\.supabase\.co$/.exec(u.hostname);
    return u.protocol === "https:" && m ? m[1] : null;
  } catch {
    return null;
  }
}

const clean = (v: string | undefined) => v?.trim().replace(/^["']|["']$/g, "") ?? "";

/**
 * The project that is EXPLICITLY approved to talk to the real provider (and to spend real money): PROVIDER_LIVE_APPROVED_REF. Without it nothing is
 * approved, whatever PROVIDER_MODE says.
 */
export const liveApprovedRef = (): string | null => clean(process.env.PROVIDER_LIVE_APPROVED_REF) || null;

/** True only when the Supabase project this server talks to is exactly the approved one. */
export const isLiveApproved = (): boolean => {
  const target = supabaseTargetRef();
  return target !== null && target === liveApprovedRef();
};

/** The dev project or a local stack: the places where mock data is welcome. */
const isDevTarget = (): boolean => {
  const target = supabaseTargetRef();
  const dev = clean(process.env.SUPABASE_DEV_PROJECT_REF);
  return target === null || (dev !== "" && target === dev);
};

/**
 * THE single source of truth for the mode (read on every call, never cached, never stored). The real provider is reachable ONLY from a project
 * that is explicitly approved (PROVIDER_LIVE_APPROVED_REF = the project of NEXT_PUBLIC_SUPABASE_URL) AND PROVIDER_MODE=live.
 *  - approved project: "live" with PROVIDER_MODE=live, otherwise "off" (an approved project never fakes data);
 *  - any other project: "mock" (the default, also when PROVIDER_MODE=live is asked for), except a production build against a project that is
 *    not the dev one, which is "off": nothing is faked and nothing is spent.
 */
export const providerMode = (): ProviderMode => {
  const requested = clean(process.env.PROVIDER_MODE).toLowerCase();
  if (isLiveApproved()) return requested === "live" ? "live" : "off";
  if (process.env.NODE_ENV === "production" && !isDevTarget()) return "off";
  return "mock";
};

/**
 * Whether "Custom Comments" services can be ordered. The mock accepts them (tests, development). Live, they stay OFF until
 * PROVIDER_CUSTOM_COMMENTS=1 is set. The format (comments joined by line feeds, no quantity) was verified against the real Likeo on
 * 2026-11-06 with one 10-comment order (see the README); the flag stays so each environment opts in on purpose.
 */
export const customCommentsEnabled = (): boolean => {
  const mode = providerMode();
  return mode === "mock" || (mode === "live" && clean(process.env.PROVIDER_CUSTOM_COMMENTS) === "1");
};

export type ModeInfo = {
  mode: ProviderMode;
  /** Raw value as Next.js loaded it (null = the variable does not exist). Not secret. */
  raw: string | null;
  /** Human text, e.g. "dari .env.local" or "PROVIDER_MODE tidak ditemukan di environment, jadi default mock". */
  source: string;
  /** Set when the value is something other than "live"/"mock", so a typo is visible instead of silently switching things off. */
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
  const file = envFileDefining("PROVIDER_MODE");
  const origin = raw === null ? "PROVIDER_MODE tidak ada di environment" : raw.trim() === "" ? "PROVIDER_MODE kosong" : file ? `dari ${file}` : "dari environment proses";
  const requested = clean(raw ?? undefined).toLowerCase();
  const target = supabaseTargetRef();
  let warning: string | null = null;
  let source = origin;
  if (isLiveApproved()) {
    source = requested === "live" ? origin : `${origin}; project ini disetujui untuk provider asli`;
    if (requested !== "live") warning = "Project ini disetujui untuk provider asli (PROVIDER_LIVE_APPROVED_REF), tetapi PROVIDER_MODE bukan live: provider mati dan tidak ada data contoh.";
  } else if (requested === "live") {
    warning = `PROVIDER_MODE=live diminta, tetapi project ini (${target ?? "lokal/tidak dikenal"}) belum disetujui: isi PROVIDER_LIVE_APPROVED_REF dengan ref project ini. Provider asli TIDAK dipanggil (mode ${mode}).`;
    source = `${origin}; ditolak karena project belum disetujui`;
  } else if (mode === "mock") {
    source = `${origin}: memakai mock (project ini bukan production yang disetujui)`;
  } else {
    source = `${origin}: provider mati (build production di project yang bukan DEV dan belum disetujui)`;
  }
  if (requested !== "" && requested !== "live" && requested !== "mock") warning = `Nilai PROVIDER_MODE "${(raw ?? "").slice(0, 20)}" tidak dikenal. Pakai "live" (hanya di project yang disetujui) atau "mock" (uji).`;
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

// ---------------------------------------------------------------------------
// Provider URL validation (admin typed): the server fetches it, so it must be a public https address.
// ---------------------------------------------------------------------------

const PRIVATE_V4 = [/^10\./, /^127\./, /^0\./, /^169\.254\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./];

/**
 * Accepts only https URLs to a public host name: no credentials in the URL, no custom port, no IP literals, no localhost / internal names.
 * (A DNS name that points to a private address is not caught here; the key is only ever sent to the address the admin saved.)
 */
export function validateProviderUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  const text = raw.trim();
  if (!text) return { ok: false, error: "URL API wajib diisi." };
  if (text.length > 300) return { ok: false, error: "URL API terlalu panjang." };
  let u: URL;
  try {
    u = new URL(text);
  } catch {
    return { ok: false, error: "URL API tidak valid. Contoh: https://contoh.com/api/v2" };
  }
  if (u.protocol !== "https:") return { ok: false, error: "URL API harus memakai https://." };
  if (u.username || u.password) return { ok: false, error: "URL API tidak boleh berisi username atau password." };
  if (u.port && u.port !== "443") return { ok: false, error: "URL API tidak boleh memakai port khusus." };
  const host = u.hostname.toLowerCase();
  if (host.startsWith("[") || /^\d+(\.\d+){3}$/.test(host) || PRIVATE_V4.some((r) => r.test(host))) return { ok: false, error: "URL API harus berupa nama domain publik, bukan alamat IP." };
  if (host === "localhost" || !host.includes(".") || /\.(local|localhost|internal|lan|home|corp)$/.test(host)) return { ok: false, error: "URL API harus berupa nama domain publik." };
  u.hash = "";
  return { ok: true, url: u.toString() };
}
