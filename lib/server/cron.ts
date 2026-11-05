import "server-only";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "./supabase-admin";

/**
 * Shared guard for the scheduled endpoints (/api/cron/*): `Authorization: Bearer <CRON_SECRET>` compared in constant time (both sides
 * are hashed first, so even the length is not leaked), and a lease so two overlapping runs of the same job never both do the work.
 * The secret travels only in the header: never in a URL, never in a log line.
 */
export function bearerMatches(header: string | null, secret: string): boolean {
  const a = createHash("sha256").update(header ?? "").digest();
  const b = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(a, b);
}

/** null = authorised; otherwise the response to send (503 when the secret is not configured, 401 otherwise). */
export function cronAuthError(request: Request): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ ok: false, message: "CRON_SECRET belum diatur." }, { status: 503 });
  if (!bearerMatches(request.headers.get("authorization"), secret)) return Response.json({ ok: false }, { status: 401 });
  return null;
}

export type LeaseStore = {
  acquire(name: string, ttlSeconds: number, owner: string): Promise<boolean>;
  release(name: string, owner: string): Promise<void>;
};

export const dbLeases: LeaseStore = {
  async acquire(name, ttl, owner) {
    const { data, error } = await supabaseAdmin().rpc("acquire_cron_lease", { p_name: name, p_ttl_seconds: ttl, p_owner: owner });
    if (error) throw new Error(`acquire_cron_lease: ${error.message}`);
    return data === true;
  },
  async release(name, owner) {
    await supabaseAdmin().rpc("release_cron_lease", { p_name: name, p_owner: owner });
  },
};

/**
 * Runs `fn` only if no other run of `name` holds the lease. The lease expires by itself after `ttlSeconds` (a crashed run cannot block
 * the job forever) and is released when `fn` ends. Returns `{ skipped: true }` when another run is still going.
 */
export async function runWithLease<T>(name: string, ttlSeconds: number, fn: () => Promise<T>, store: LeaseStore = dbLeases): Promise<{ skipped: true } | { skipped: false; value: T }> {
  const owner = randomUUID();
  if (!(await store.acquire(name, ttlSeconds, owner))) return { skipped: true };
  try {
    return { skipped: false, value: await fn() };
  } finally {
    await store.release(name, owner).catch(() => undefined);
  }
}

/** Wraps a job in auth + lease and answers 200 / 202 (skipped) / 500 without ever echoing details of an internal error. */
export async function handleCron(request: Request, job: { name: string; ttlSeconds: number; run: () => Promise<Record<string, unknown>> }): Promise<Response> {
  const denied = cronAuthError(request);
  if (denied) return denied;
  try {
    const res = await runWithLease(job.name, job.ttlSeconds, job.run);
    if (res.skipped) return Response.json({ ok: true, skipped: "Masih ada proses sebelumnya yang berjalan." }, { status: 202 });
    return Response.json({ ok: true, ...res.value });
  } catch (e) {
    console.error(`[cron:${job.name}]`, e instanceof Error ? e.message : "error");
    return Response.json({ ok: false, message: "Job gagal. Lihat log server." }, { status: 500 });
  }
}
