import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CleanupError, cleanupTestData, MANUAL_CLEANUP_COMMAND, summarizeCleanup } from "../scripts/lib/test-cleanup.mjs";

const DEV = "eoaagocvdclaxxzxsbjr";
const PROD = "prodprodprodprodprod";
const env = (o: Record<string, string>) => ({ SUPABASE_DEV_PROJECT_REF: DEV, SUPABASE_SECRET_KEY: "k", ...o }) as unknown as NodeJS.ProcessEnv;

describe("in-process test cleanup (guards, no network)", () => {
  it("refuses a project that is not the dev project, and tells how to do it by hand", async () => {
    await expect(cleanupTestData({ env: env({ NEXT_PUBLIC_SUPABASE_URL: `https://${PROD}.supabase.co` }), retries: 0 })).rejects.toThrow(/bukan project DEV/);
    await expect(cleanupTestData({ env: env({ NEXT_PUBLIC_SUPABASE_URL: `https://${PROD}.supabase.co` }), retries: 0 })).rejects.toThrow(MANUAL_CLEANUP_COMMAND);
  });
  it("refuses a missing or look-alike URL and an unknown dev ref", async () => {
    await expect(cleanupTestData({ env: env({}), retries: 0 })).rejects.toBeInstanceOf(CleanupError);
    await expect(cleanupTestData({ env: env({ NEXT_PUBLIC_SUPABASE_URL: `https://${DEV}.supabase.co.evil.com` }), retries: 0 })).rejects.toThrow(/bukan project DEV/);
    await expect(cleanupTestData({ env: { ...env({ NEXT_PUBLIC_SUPABASE_URL: `https://${DEV}.supabase.co` }), SUPABASE_DEV_PROJECT_REF: "" } as unknown as NodeJS.ProcessEnv, retries: 0 })).rejects.toBeInstanceOf(CleanupError);
  });
  it("rejects a bad marker before doing anything", async () => {
    const good = env({ NEXT_PUBLIC_SUPABASE_URL: `https://${DEV}.supabase.co` });
    for (const marker of ["", "Rf", "r f", "a'; drop table x;--", "x".repeat(13)]) {
      await expect(cleanupTestData({ marker, env: good, retries: 0 }), marker).rejects.toThrow(/Marker/);
    }
  });
  it("summarizes only the tables that had rows", () => {
    expect(summarizeCleanup({ services: 5005, orders: 0, auth_users: 21 })).toBe("services=5005, auth_users=21");
    expect(summarizeCleanup({})).toBe("tidak ada yang dihapus");
    expect(summarizeCleanup(null)).toBe("tidak ada yang dihapus");
  });
});

describe("every DB / e2e suite is collision-proof and cleans up in-process", () => {
  const dirs = ["lib/server/__tests__", "e2e"];
  const files = dirs.flatMap((d) => readdirSync(d).filter((f) => /\.test\.ts$/.test(f)).map((f) => join(d, f)));
  const isDbSuite = (src: string) => src.includes("RUN_DB_TESTS") || src.includes("RUN_E2E");
  const suites = files.filter((f) => isDbSuite(readFileSync(f, "utf8")));

  it("finds the suites", () => {
    expect(suites.length).toBeGreaterThanOrEqual(13);
  });
  it.each(suites)("%s: no spawned Node process for cleanup, a unique marker, a pre-clean and a loud cleanup", (file) => {
    const src = readFileSync(file, "utf8");
    expect(src, "must not spawn another node process for the cleanup").not.toMatch(/spawnSync\("node", \["scripts\/db-cleanup\.mjs"\]/);
    expect(src, "must not use the supabase CLI for the cleanup").not.toMatch(/["'`]scripts\/db-cleanup-test-data\.sql["'`]/);
    const marker = /const MARKER = "([a-z0-9]{1,12})";/.exec(src);
    expect(marker, "has a suite marker").not.toBeNull();
    expect(src, "run id starts with the marker").toMatch(/const run = MARKER \+ Math\.random\(\)/);
    expect((src.match(/cleanupOrFail\(\{ marker: MARKER \}\)/g) ?? []).length, "pre-clean in beforeAll and cleanup in afterAll").toBeGreaterThanOrEqual(2);
    expect(src, "never the fixed mock provider service id on the shared Likeo provider").not.toMatch(/provider_id: (m\.config\.)?LIKEO(_ID)?, provider_service_id: "1001"/);
  });
  it("the markers are unique per file", () => {
    const seen = new Map<string, string>();
    for (const f of suites) {
      const m = /const MARKER = "([a-z0-9]{1,12})";/.exec(readFileSync(f, "utf8"))![1];
      expect(seen.get(m), `marker ${m} used by ${seen.get(m)} and ${f}`).toBeUndefined();
      seen.set(m, f);
    }
  });
});
