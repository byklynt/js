import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildLinkArgs, buildPushArgs, checkProdTarget, checkPushTarget, formatCommand, maskSecrets, parseCliTarget, readWorkdirLinkedRef,
} from "../scripts/lib/prod-guard.mjs";

const DEV = "eoaagocvdclaxxzxsbjr";
const PROD = "ypocxjvenysyqdurjdvk";
const OTHER = "otherotherotherother";
const LOCAL = "Target: local stack (127.0.0.1:54322) · default; pass --remote for jagoansosmed-prod";
const REMOTE = (ref: string) => `Target: project jagoansosmed-prod (${ref}) · production`;

describe("db push argument construction", () => {
  it("always carries --remote=<ref>, for the dry run and the real push", () => {
    const dry = buildPushArgs({ ref: PROD, workdir: "/w", dryRun: true });
    const real = buildPushArgs({ ref: PROD, workdir: "/w", dryRun: false });
    for (const a of [dry, real]) {
      expect(a).toContain(`--remote=${PROD}`);
      expect(a.slice(0, 2)).toEqual(["db", "push"]);
      expect(a).toContain("--workdir");
      expect(a.join(" ")).not.toMatch(/--local|--db-url|--linked|--password/);
    }
    expect(dry).toContain("--dry-run");
    expect(dry).not.toContain("--yes");
    expect(real).toContain("--yes");
    expect(real).not.toContain("--dry-run");
  });
  it("refuses a malformed ref or missing workdir", () => {
    for (const ref of ["", "short", "UPPERCASEUPPERCASEUP", `${PROD}x`, "--remote"]) expect(() => buildPushArgs({ ref, workdir: "/w", dryRun: true })).toThrow();
    expect(() => buildPushArgs({ ref: PROD, workdir: "", dryRun: true })).toThrow();
    expect(() => buildLinkArgs("nope", "/w")).toThrow();
    expect(buildLinkArgs(PROD, "/w")).toEqual(["link", "--project-ref", PROD, "--workdir", "/w"]);
  });
  it("the DEV ref is refused before any argument is built", () => {
    expect(checkProdTarget(DEV, DEV).ok).toBe(false);
    expect(checkProdTarget(PROD, DEV).ok).toBe(true);
  });
});

describe("target assertion on the dry-run output", () => {
  it("accepts only the typed project", () => {
    expect(checkPushTarget(`${REMOTE(PROD)}\nDRY RUN: migrations to push`, PROD).ok).toBe(true);
    expect(parseCliTarget(`\u001b[1m${REMOTE(PROD)}\u001b[0m`)).toEqual({ kind: "project", ref: PROD });
  });
  it('aborts on "local stack"', () => {
    const r = checkPushTarget(`${LOCAL}\nECONNREFUSED 127.0.0.1:54322`, PROD);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/LOKAL/);
    expect(checkPushTarget(`${REMOTE(PROD)}\nalso local stack mention`, PROD).ok).toBe(false);
    expect(checkPushTarget("Target: 127.0.0.1:54322", PROD).ok).toBe(false);
  });
  it("aborts on another ref (dev or any other project)", () => {
    for (const other of [DEV, OTHER]) {
      const r = checkPushTarget(REMOTE(other), PROD);
      expect(r.ok).toBe(false);
      expect(r.error).toContain(other);
    }
  });
  it("aborts when the output cannot be parsed", () => {
    for (const out of ["", undefined, "Applying migration 1...", "Target: something odd", "Target: project x (short)"]) expect(checkPushTarget(out as string, PROD).ok).toBe(false);
  });
});

describe("linked ref of the temporary workdir", () => {
  it("reads supabase/.temp/project-ref and a mismatch is detectable", () => {
    const dir = mkdtempSync(join(tmpdir(), "pushlink-"));
    try {
      expect(readWorkdirLinkedRef(dir)).toBe("");
      mkdirSync(join(dir, "supabase", ".temp"), { recursive: true });
      writeFileSync(join(dir, "supabase", ".temp", "project-ref"), `${DEV}\n`);
      expect(readWorkdirLinkedRef(dir)).toBe(DEV);
      expect(readWorkdirLinkedRef(dir)).not.toBe(PROD);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("password masking", () => {
  it("never shows the password in an echoed command or an error", () => {
    const pw = "s3cr3t-pass!";
    const args = ["db", "push", `--remote=${PROD}`, "--password", pw];
    expect(formatCommand(args, [pw])).not.toContain(pw);
    expect(formatCommand(args, [pw])).toContain("***");
    expect(maskSecrets(`connect failed postgres://u:${pw}@h/db (${pw})`, [pw])).toBe("connect failed postgres://u:***@h/db (***)");
    expect(maskSecrets("nothing here", [pw, ""])).toBe("nothing here");
  });
});
