// Runs every supabase/tests/database/*.test.sql WITHOUT Docker, through `supabase db query`.
//   node scripts/db-test.mjs            -> linked remote project (dev project only)
//   node scripts/db-test.mjs --local    -> local Supabase (npm run db:start)
//   node scripts/db-test.mjs --only=rls -> only files whose name contains "rls"
// Each file runs in ONE transaction that always ends in an exception, so it ALWAYS rolls back and leaves no data behind.
// `db query` prints only the last statement's result, so every assertion is routed into a temp table and the final
// exception message carries the verdict ("PGTAP-RESULT ok" or the list of failed assertions).
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const local = process.argv.includes("--local");
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);
const dir = "supabase/tests/database";
const files = readdirSync(dir).filter((f) => f.endsWith(".test.sql")).sort();
const tmp = mkdtempSync(join(tmpdir(), "pgtap-"));
const ASSERT = /^select\s+(is|isnt|ok|throws_ok|lives_ok|results_eq|is_empty)\(/i;
const NL = String.fromCharCode(10);
let failed = 0;

function build(body) {
  const cleaned = body
    .replace(/^\s*begin;\s*$/im, "")
    .replace(/select \* from finish\(\);\s*/i, "")
    .replace(/^\s*rollback;\s*$/im, "");
  const wrapped = cleaned
    .split(/;[ \t]*\r?\n/)
    .map((stmt) => {
      const code = stmt.replace(/^(\s*--[^\n]*\n)+/g, "").trim();
      return ASSERT.test(code) ? `insert into pg_temp.tap_out(line) ${code}` : stmt;
    })
    .join(";" + NL);
  return [
    "begin;",
    "create extension if not exists pgtap with schema extensions;",
    "set local search_path = public, extensions;",
    "create temp table tap_out (n serial, line text);",
    "grant all on pg_temp.tap_out to public;",
    "grant all on sequence pg_temp.tap_out_n_seq to public;",
    wrapped,
    ";",
    "do $result$",
    "declare bad text; total int; fails int;",
    "begin",
    "  select count(*), count(*) filter (where line like 'not ok%') into total, fails from pg_temp.tap_out;",
    "  select string_agg(line, ' | ' order by n) into bad from pg_temp.tap_out where line like 'not ok%';",
    "  if fails = 0 then raise exception 'PGTAP-RESULT ok (% assertions)', total; end if;",
    "  raise exception 'PGTAP-RESULT FAIL (% of % failed): %', fails, total, bad;",
    "end $result$;",
    "",
  ].join(NL);
}

for (const f of files) {
  if (only && !f.includes(only)) continue;
  const path = join(tmp, f);
  writeFileSync(path, build(readFileSync(join(dir, f), "utf8")));
  const args = ["supabase", "db", "query", local ? "--local" : "--remote", "--file", path];
  if (!local) args.push("--yes");
  const r = spawnSync("npx", args, { encoding: "utf8", shell: process.platform === "win32" });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  const m = out.match(/PGTAP-RESULT[^\\"]*/);
  if (m && m[0].startsWith("PGTAP-RESULT ok")) console.log(`PASS ${f}: ${m[0]}`);
  else {
    failed++;
    console.log(`FAIL ${f}`);
    console.log(m ? m[0] : out.slice(-2500));
  }
}
rmSync(tmp, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
