/**
 * Sliding-window rate limiter. Pure (injectable clock + store) so it is unit tested.
 * TODO(infra): the default instance lives in process memory; use Redis / a database table when running more than one instance.
 */
export type RateLimiter = {
  hit(key: string, limit: number, windowMs: number, now?: number): { allowed: boolean; retryAfterSec: number };
  reset(key: string): void;
};

export function createRateLimiter(store: Map<string, number[]> = new Map()): RateLimiter {
  return {
    hit(key, limit, windowMs, now = Date.now()) {
      const hits = (store.get(key) ?? []).filter((t) => now - t < windowMs);
      if (hits.length >= limit) {
        store.set(key, hits);
        return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000)) };
      }
      hits.push(now);
      store.set(key, hits);
      return { allowed: true, retryAfterSec: 0 };
    },
    reset(key) {
      store.delete(key);
    },
  };
}

const g = globalThis as unknown as { __sgLimiter?: RateLimiter };
/** Shared limiter for user actions (orders, tickets). Login keeps its own failure counter in lib/rate-limit.ts. */
export const sharedLimiter: RateLimiter = (g.__sgLimiter ??= createRateLimiter());
