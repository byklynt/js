import "server-only";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

/** Development builds only (`next dev`, tests). Production never shows or logs the extra detail. */
export const isDevBuild = () => process.env.NODE_ENV !== "production";

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
  /** Set when the limiter itself failed (RPC error or empty answer) and the call was refused fail-closed. Not a real "too many attempts". */
  failure?: { code: string; message: string; status: number | null };
};

/** Key without the middle of an IP / username, so even the server log carries no more than needed to find the row. */
const keyKind = (key: string) => key.split(":")[0] ?? "?";

/**
 * Shared rate limiter backed by the rate_limits table (atomic upsert in Postgres: works across instances and restarts).
 * Fixed window: `limit` hits per `windowSeconds`. Login attempts count every try and are cleared on success.
 */
export async function hitRateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const { data, error, status } = await supabaseAdmin().rpc("rate_limit_hit", { p_key: key, p_limit: limit, p_window_seconds: windowSeconds });
  // Fail closed for security-sensitive callers: if the limiter itself is down we do not let attempts through unchecked.
  // This is NOT the same as "too many attempts", so it is logged loudly (the error text of PostgREST never contains the key).
  if (error || !data?.[0]) {
    const failure = { code: error?.code || "EMPTY", message: error?.message || "rate_limit_hit returned no row", status: status ?? null };
    console.error(`[rate-limit] LIMITER FAILED (refusing fail-closed) kind=${keyKind(key)} code=${failure.code} http=${failure.status} message=${failure.message}`);
    return { allowed: false, retryAfterSeconds: 60, failure };
  }
  const row = data[0];
  if (!row.allowed && isDevBuild()) {
    console.warn(`[rate-limit] BLOCKED by limiter key=${key} limit=${limit}/${windowSeconds}s retryAfter=${row.retry_after}s`);
  }
  return { allowed: row.allowed, retryAfterSeconds: row.retry_after };
}

export async function resetRateLimit(key: string): Promise<void> {
  await supabaseAdmin().rpc("rate_limit_reset", { p_key: key });
}

export const minutes = (seconds: number) => Math.max(1, Math.ceil(seconds / 60));

/** 5 attempts per 15 minutes. */
export const LOGIN_LIMIT = { limit: 5, windowSeconds: 15 * 60 };
