import "server-only";

/**
 * Login rate limiting: max 5 failed attempts per 15 minutes per key (IP + username).
 * TODO: back this with a real shared store (Redis / database). This in-memory Map resets on
 * restart and is not shared across server instances, so it is a placeholder only.
 */
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

type Entry = { failures: number; windowStart: number };

const globalForLimit = globalThis as unknown as { __sgRateLimit?: Map<string, Entry> };
const store = (globalForLimit.__sgRateLimit ??= new Map<string, Entry>());

export function checkRateLimit(key: string): { allowed: boolean; retryAfterMinutes: number } {
  const entry = store.get(key);
  const now = Date.now();
  if (!entry || now - entry.windowStart > WINDOW_MS) return { allowed: true, retryAfterMinutes: 0 };
  if (entry.failures < MAX_ATTEMPTS) return { allowed: true, retryAfterMinutes: 0 };
  return { allowed: false, retryAfterMinutes: Math.max(1, Math.ceil((entry.windowStart + WINDOW_MS - now) / 60000)) };
}

export function recordFailure(key: string) {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    store.set(key, { failures: 1, windowStart: now });
  } else {
    entry.failures += 1;
  }
}

export function resetFailures(key: string) {
  store.delete(key);
}
