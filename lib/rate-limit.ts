import "server-only";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

/**
 * Shared rate limiter backed by the rate_limits table (atomic upsert in Postgres: works across instances and restarts).
 * Fixed window: `limit` hits per `windowSeconds`. Login attempts count every try and are cleared on success.
 */
export async function hitRateLimit(key: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const { data, error } = await supabaseAdmin().rpc("rate_limit_hit", { p_key: key, p_limit: limit, p_window_seconds: windowSeconds });
  // Fail closed for security-sensitive callers: if the limiter itself is down we do not let attempts through unchecked.
  if (error || !data?.[0]) return { allowed: false, retryAfterSeconds: 60 };
  return { allowed: data[0].allowed, retryAfterSeconds: data[0].retry_after };
}

export async function resetRateLimit(key: string): Promise<void> {
  await supabaseAdmin().rpc("rate_limit_reset", { p_key: key });
}

export const minutes = (seconds: number) => Math.max(1, Math.ceil(seconds / 60));

/** 5 attempts per 15 minutes. */
export const LOGIN_LIMIT = { limit: 5, windowSeconds: 15 * 60 };
