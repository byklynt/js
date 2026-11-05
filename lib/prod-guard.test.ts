import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkDevOnly, checkLinkedIsDev, checkProdTarget, isValidRef, parsePendingMigrations, projectRefArg, readDevRef, refFromUrl, urlMatchesRef,
} from "../scripts/lib/prod-guard.mjs";

const DEV = "eoaagocvdclaxxzxsbjr";
const PROD = "prodprodprodprodprod";

describe("project refs and URLs (exact matches only)", () => {
  it("accepts 20 lower-case letters", () => {
    expect(isValidRef(PROD)).toBe(true);
    for (const bad of ["", "<ref>", "ABCDEFGHIJKLMNOPQRST", "short", `${PROD}x`, "abcdefghij klmnopqrst", "abcdefghijklmnopqrs1"]) expect(isValidRef(bad), bad).toBe(false);
  });
  it("reads the ref only from https://REF.supabase.co", () => {
    expect(refFromUrl(`https://${DEV}.supabase.co`)).toBe(DEV);
    expect(refFromUrl(`https://${DEV}.supabase.co/`)).toBe(DEV);
    expect(refFromUrl(`http://${DEV}.supabase.co`)).toBeNull();
    expect(refFromUrl(`https://${DEV}.supabase.co.evil.com`)).toBeNull();
    expect(refFromUrl(`https://evil.com/${DEV}.supabase.co`)).toBeNull();
    expect(refFromUrl(`https://user:pw@${DEV}.supabase.co`)).toBeNull();
    expect(refFromUrl(`https://${DEV}.supabase.co:8443`)).toBeNull();
    expect(refFromUrl("http://127.0.0.1:54321")).toBeNull();
    expect(refFromUrl("")).toBeNull();
    expect(urlMatchesRef(`https://${PROD}.supabase.co`, PROD)).toBe(true);
    expect(urlMatchesRef(`https://${PROD}.supabase.co`, DEV)).toBe(false);
    expect(urlMatchesRef(`https://${PROD}.supabase.co`, "<ref>")).toBe(false);
  });
});

describe("production target check (db:push:prod, prod:verify, admin:create, cron:enable, bootstrap)", () => {
  it("passes a valid ref that is not the dev project", () => {
    expect(checkProdTarget(PROD, DEV)).toEqual({ ok: true });
  });
  it("refuses the dev project, a missing or malformed ref, and an unknown dev ref", () => {
    expect(checkProdTarget(DEV, DEV)).toMatchObject({ ok: false, error: expect.stringContaining("DITOLAK") });
    expect(checkProdTarget("", DEV)).toMatchObject({ ok: false, error: expect.stringContaining("tanpa tanda kurung") });
    expect(checkProdTarget("<abcdefghijklmnopqrst>", DEV)).toMatchObject({ ok: false, error: expect.stringContaining("bukan project ref yang valid") });
    expect(checkProdTarget(PROD, "")).toMatchObject({ ok: false, error: expect.stringContaining("SUPABASE_DEV_PROJECT_REF belum diatur") });
  });
});

describe("dev-only check (tests, simulator, cleanup, screenshots)", () => {
  it("passes only when the URL is exactly the dev project", () => {
    expect(checkDevOnly({ NEXT_PUBLIC_SUPABASE_URL: `https://${DEV}.supabase.co` }, DEV)).toEqual({ ok: true });
  });
  it("refuses production, look-alikes, local stacks, an empty URL and an unknown dev ref", () => {
    for (const url of [`https://${PROD}.supabase.co`, `https://${DEV}.supabase.co.evil.com`, `http://${DEV}.supabase.co`, "http://127.0.0.1:54321", ""]) {
      expect(checkDevOnly({ NEXT_PUBLIC_SUPABASE_URL: url }, DEV), url).toMatchObject({ ok: false });
    }
    expect(checkDevOnly({ NEXT_PUBLIC_SUPABASE_URL: `https://${DEV}.supabase.co` }, "")).toMatchObject({ ok: false });
    expect(checkDevOnly({}, DEV)).toMatchObject({ ok: false });
  });
  it("names the project it refused but never echoes anything else", () => {
    const r = checkDevOnly({ NEXT_PUBLIC_SUPABASE_URL: `https://${PROD}.supabase.co` }, DEV);
    expect(r.ok === false && r.error).toContain(PROD);
  });
});

describe("the linked project of the Supabase CLI", () => {
  it("must be the dev project for anything destructive", () => {
    expect(checkLinkedIsDev(DEV, DEV)).toEqual({ ok: true });
    expect(checkLinkedIsDev(PROD, DEV)).toMatchObject({ ok: false, error: expect.stringContaining("bukan project DEV") });
    expect(checkLinkedIsDev("", DEV)).toMatchObject({ ok: false });
    expect(checkLinkedIsDev(DEV, "")).toMatchObject({ ok: false });
  });
});

describe("helpers", () => {
  it("lists the migrations a dry run would push", () => {
    const out = `DRY RUN: migrations will *not* be pushed to the database.\nWould push these migrations:\n • 20261105000027_service_completion_stats.sql\n • 20261105000028_prod_verify.sql\nWould push 2 migrations.\n20261105000027_service_completion_stats.sql again`;
    expect(parsePendingMigrations(out)).toEqual(["20261105000027_service_completion_stats.sql", "20261105000028_prod_verify.sql"]);
    expect(parsePendingMigrations("Remote database is up to date.")).toEqual([]);
  });
  it("reads --project-ref in both spellings and ignores everything else", () => {
    expect(projectRefArg(["a", "--project-ref", PROD, "--confirm"])).toBe(PROD);
    expect(projectRefArg([`--project-ref=${PROD}`])).toBe(PROD);
    expect(projectRefArg(["a", "b"])).toBeNull();
    expect(projectRefArg(["--project-ref"])).toBe("");
  });
  it("reads SUPABASE_DEV_PROJECT_REF from the session first, then from the file, and nothing else from the file", () => {
    const dir = mkdtempSync(join(tmpdir(), "guard-"));
    try {
      const file = join(dir, ".env.local");
      writeFileSync(file, `CRON_SECRET=shh\nSUPABASE_DEV_PROJECT_REF="${DEV}"\nOTHER=1\n`);
      const none = {} as NodeJS.ProcessEnv;
      expect(readDevRef(none, file)).toBe(DEV);
      expect(readDevRef(({ SUPABASE_DEV_PROJECT_REF: "sessionsessionsession" } as unknown as NodeJS.ProcessEnv), file)).toBe("sessionsessionsession");
      expect(readDevRef(none, join(dir, "missing"))).toBe("");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
