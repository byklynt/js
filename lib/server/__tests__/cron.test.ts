import { describe, expect, it, vi } from "vitest";
import { createEmptyDb, type AdminOrder } from "@/lib/admin-data";
import { isSyncStalled, STALL_MINUTES, syncHealth } from "../metrics";
import { buildEnableSql, normalizeAppUrl, redact, sqlLiteral, vaultUpsertSql } from "../../../scripts/lib/cron-sql.mjs";
import { bearerMatches, cronAuthError, handleCron, runWithLease, type LeaseStore } from "../cron";

vi.mock("server-only", () => ({}));

const SECRET = "s".repeat(32);
const req = (auth?: string) => new Request("https://app.test/api/cron/sync-orders", { method: "POST", headers: auth ? { authorization: auth } : {} });

describe("Bearer check on the cron endpoints", () => {
  it("accepts only the exact secret", () => {
    expect(bearerMatches(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(bearerMatches(`Bearer ${SECRET}x`, SECRET)).toBe(false);
    expect(bearerMatches(`bearer ${SECRET}`, SECRET)).toBe(false);
    expect(bearerMatches(SECRET, SECRET)).toBe(false);
    expect(bearerMatches("", SECRET)).toBe(false);
    expect(bearerMatches(null, SECRET)).toBe(false);
  });
  it("answers 401 without or with a wrong header, 503 when CRON_SECRET is not configured, null when authorised", () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    expect(cronAuthError(req())?.status).toBe(401);
    expect(cronAuthError(req("Bearer nope"))?.status).toBe(401);
    expect(cronAuthError(req(`Bearer ${SECRET}`))).toBeNull();
    vi.stubEnv("CRON_SECRET", "");
    expect(cronAuthError(req(`Bearer ${SECRET}`))?.status).toBe(503);
    vi.unstubAllEnvs();
  });
  it("never runs the job (and never echoes the secret) when unauthorised", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const run = vi.fn(async () => ({ done: true }));
    const res = await handleCron(req("Bearer wrong"), { name: "t", ttlSeconds: 5, run });
    expect(res.status).toBe(401);
    expect(run).not.toHaveBeenCalled();
    expect(await res.text()).not.toContain(SECRET);
    vi.unstubAllEnvs();
  });
});

/** In-memory lease store with the same semantics as acquire_cron_lease (atomic, expires). */
function memoryLeases(now = () => Date.now()): LeaseStore & { held: Map<string, { until: number; owner: string }> } {
  const held = new Map<string, { until: number; owner: string }>();
  return {
    held,
    async acquire(name, ttl, owner) {
      const cur = held.get(name);
      if (cur && cur.until > now()) return false;
      held.set(name, { until: now() + ttl * 1000, owner });
      return true;
    },
    async release(name, owner) {
      if (held.get(name)?.owner === owner) held.set(name, { until: 0, owner });
    },
  };
}

describe("overlap lock", () => {
  it("two overlapping runs: exactly one does the work, the other is skipped", async () => {
    const leases = memoryLeases();
    let running = 0;
    let maxParallel = 0;
    const job = async () => {
      running++;
      maxParallel = Math.max(maxParallel, running);
      await new Promise((r) => setTimeout(r, 20));
      running--;
      return "ok";
    };
    const results = await Promise.all([runWithLease("sync", 60, job, leases), runWithLease("sync", 60, job, leases), runWithLease("sync", 60, job, leases)]);
    expect(results.filter((r) => !r.skipped)).toHaveLength(1);
    expect(results.filter((r) => r.skipped)).toHaveLength(2);
    expect(maxParallel).toBe(1);
  });
  it("releases the lease when the job throws, so the next tick can run", async () => {
    const leases = memoryLeases();
    await expect(runWithLease("sync", 60, async () => { throw new Error("boom"); }, leases)).rejects.toThrow("boom");
    expect((await runWithLease("sync", 60, async () => 1, leases)).skipped).toBe(false);
  });
  it("a crashed run cannot block the job forever: the lease expires by itself", async () => {
    let t = 1_000_000;
    const leases = memoryLeases(() => t);
    expect(await leases.acquire("sync", 120, "crashed")).toBe(true); // never released
    expect(await leases.acquire("sync", 120, "next")).toBe(false);
    t += 121_000;
    expect(await leases.acquire("sync", 120, "next")).toBe(true);
  });
  it("different jobs do not block each other", async () => {
    const leases = memoryLeases();
    expect(await leases.acquire("sync-orders", 60, "a")).toBe(true);
    expect(await leases.acquire("sanity", 60, "b")).toBe(true);
  });
});

describe("stalled sync detection", () => {
  const now = new Date("2026-11-05T10:00:00Z");
  const ago = (min: number) => new Date(now.getTime() - min * 60_000).toISOString();
  it("is stalled after 10 minutes without a SUCCESSFUL run, not before", () => {
    expect(STALL_MINUTES).toBe(10);
    expect(isSyncStalled({ lastSuccessAt: ago(9), hasRunBefore: true, hasWork: true }, now)).toBe(false);
    expect(isSyncStalled({ lastSuccessAt: ago(11), hasRunBefore: true, hasWork: true }, now)).toBe(true);
    expect(isSyncStalled({ lastSuccessAt: null, hasRunBefore: true, hasWork: false }, now)).toBe(true); // it ran before, never successfully
  });
  it("a fresh install that never ran and has nothing to sync is not 'stalled'", () => {
    expect(isSyncStalled({ lastSuccessAt: null, hasRunBefore: false, hasWork: false }, now)).toBe(false);
    expect(isSyncStalled({ lastSuccessAt: null, hasRunBefore: false, hasWork: true }, now)).toBe(true);
  });
  it("syncHealth: failing runs do not count as a sync, and the last SUCCESS is what is shown", () => {
    const db = createEmptyDb();
    const id = db.providers[0].id;
    const run = (min: number, errors: number) => ({ id: `r${min}`, providerId: id, startedAt: ago(min), finishedAt: ago(min), ordersChecked: 1, ordersChanged: 0, errors, errorMessage: errors ? "x" : null });
    db.orders = [{ providerId: id, status: "berjalan" } as AdminOrder];
    db.syncRuns = [run(1, 2), run(3, 1), run(5, 3), run(15, 0)]; // newest first: three failures after an old success
    const h = syncHealth(db, now)[0];
    expect(h.lastSyncedAt).toBe(ago(15));
    expect(h.stalled).toBe(true);
    expect(h.failingRuns).toBe(3);
    db.syncRuns = [run(2, 0), run(4, 1)];
    const ok = syncHealth(db, now)[0];
    expect(ok.stalled).toBe(false);
    expect(ok.lastSyncedAt).toBe(ago(2));
    db.syncRuns = [];
    expect(syncHealth(db, now)[0].stalled).toBe(true); // work exists, the job never ran
  });
});

describe("cron:enable SQL generation", () => {
  it("accepts only public HTTPS urls without credentials, query or fragment", () => {
    expect(normalizeAppUrl("https://panel.example.com/")).toBe("https://panel.example.com");
    expect(normalizeAppUrl("https://panel.example.com/app/")).toBe("https://panel.example.com/app");
    for (const bad of ["http://panel.example.com", "https://u:p@panel.example.com", "https://panel.example.com/?k=1", "https://panel.example.com/#x", "https://localhost:3000", "nonsense", ""]) {
      expect(() => normalizeAppUrl(bad)).toThrow();
    }
  });
  it("escapes quotes and refuses control characters", () => {
    expect(sqlLiteral("it's")).toBe("'it''s'");
    expect(() => sqlLiteral("a\nb")).toThrow();
  });
  it("puts the secret only in the Vault upsert, and redaction removes it", () => {
    const sql = buildEnableSql({ appUrl: "https://panel.example.com", secret: SECRET });
    expect(sql).toContain("vault.create_secret");
    expect(sql).toContain("cron.schedule('jago-sync-orders'");
    expect(sql.split(SECRET).length - 1).toBe(2); // create + update branch, nothing else
    expect(sql).not.toMatch(/net\.http_post\([^)]*sync-orders[^)]*key=/);
    expect(redact(sql, SECRET)).not.toContain(SECRET);
    expect(() => buildEnableSql({ appUrl: "https://panel.example.com", secret: "short" })).toThrow();
    expect(vaultUpsertSql({ appUrl: "https://a.example", secret: "q'uote".padEnd(30, "x") })).toContain("q''uote");
  });
});
