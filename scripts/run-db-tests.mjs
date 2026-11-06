// Runs the DB integration tests (they are skipped in a normal `npm test`), ONE FILE PER PROCESS, one after another, with the lowest memory
// footprint that still works:
//   - vitest.db.config.ts: a single worker, files never in parallel, a capped heap, long hook timeouts;
//   - between files it waits until enough memory is free (DB_TEST_MIN_FREE_MB, default 700) and runs the test-data cleanup IN-PROCESS;
//   - no shell and no npx: vitest is started directly with the current Node binary.
// Prints one PASS/FAIL line per file and the final counts. Exit code 1 if any file failed or a cleanup failed (it names the manual command).
//   node scripts/run-db-tests.mjs                 all files
//   node scripts/run-db-tests.mjs refund estimate only files whose name contains one of the words
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { freemem, tmpdir, totalmem } from "node:os";
import { dirname, join } from "node:path";
import { assertDevOnlyWithFile } from "./lib/prod-guard.mjs";
import { cleanupTestData, MANUAL_CLEANUP_COMMAND, summarizeCleanup } from "./lib/test-cleanup.mjs";

assertDevOnlyWithFile(); // tests create and delete data: dev project only

const ALL = [
  "lib/server/__tests__/db-concurrency.test.ts",
  "lib/server/__tests__/db-flows.test.ts",
  "lib/server/__tests__/estimate-flows.test.ts",
  "lib/server/__tests__/refund-flows.test.ts",
  "lib/server/__tests__/service-search-flows.test.ts",
  "lib/server/__tests__/service-types-flows.test.ts",
];
const words = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const files = words.length ? ALL.filter((f) => words.some((w) => f.includes(w))) : ALL;
if (!files.length) {
  console.error(`Tidak ada berkas tes yang cocok dengan: ${words.join(", ")}`);
  process.exit(1);
}

const MIN_FREE_MB = Number(process.env.DB_TEST_MIN_FREE_MB ?? 700);
const MAX_WAIT_S = Number(process.env.DB_TEST_MAX_WAIT_S ?? 180);
const mb = (bytes) => Math.round(bytes / 1_048_576);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Waits until at least MIN_FREE_MB is free (prints what it waits for); gives up after MAX_WAIT_S and says so. */
async function waitForMemory(label) {
  const need = Math.min(MIN_FREE_MB, Math.floor(mb(totalmem()) * 0.25));
  let waited = 0;
  while (mb(freemem()) < need && waited < MAX_WAIT_S) {
    if (waited === 0) console.log(`  [memori] ${label}: bebas ${mb(freemem())} MB, menunggu sampai ${need} MB...`);
    await sleep(3000);
    waited += 3;
  }
  if (mb(freemem()) < need) console.warn(`  [memori] ${label}: setelah ${MAX_WAIT_S} detik hanya ${mb(freemem())} MB bebas; lanjut dengan risiko kehabisan memori.`);
  else if (waited > 0) console.log(`  [memori] ${label}: ${mb(freemem())} MB bebas setelah ${waited} detik.`);
}

const require = createRequire(import.meta.url);
const vitestBin = join(dirname(require.resolve("vitest/package.json")), "vitest.mjs");
const tmp = mkdtempSync(join(tmpdir(), "dbtests-"));
const results = [];
let aborted = "";

try {
  // an earlier killed run may have left data behind: start from a clean slate
  console.log("Pembersihan awal (data uji sisa)...");
  console.log(`  ${summarizeCleanup(await cleanupTestData())}`);

  for (const [i, file] of files.entries()) {
    await waitForMemory(file);
    console.log(`\n[${i + 1}/${files.length}] ${file}`);
    const out = join(tmp, `r${i}.json`);
    const started = Date.now();
    const r = spawnSync(process.execPath, ["--max-old-space-size=1024", vitestBin, "run", "--config", "vitest.db.config.ts", file, "--reporter=default", "--reporter=json", `--outputFile.json=${out}`], {
      stdio: "inherit",
      // the tests always use the mock provider, even when .env.local approves the real one
      env: { ...process.env, RUN_DB_TESTS: "1", PROVIDER_MODE: "mock", PROVIDER_LIVE_APPROVED_REF: "" },
    });
    let counts = { passed: 0, failed: 0, skipped: 0, total: 0 };
    try {
      if (existsSync(out)) {
        const j = JSON.parse(readFileSync(out, "utf8"));
        counts = { passed: j.numPassedTests ?? 0, failed: j.numFailedTests ?? 0, skipped: j.numPendingTests ?? 0, total: j.numTotalTests ?? 0 };
      }
    } catch {
      /* no readable report: the exit code decides */
    }
    const ok = r.status === 0 && counts.failed === 0;
    results.push({ file, ok, ...counts, seconds: Math.round((Date.now() - started) / 1000), crashed: r.status !== 0 && counts.total === 0 });

    // cleanup after every file; if it cannot be done, stop (the next file would collide with the leftovers) and say how to do it by hand
    try {
      console.log(`  pembersihan: ${summarizeCleanup(await cleanupTestData())}`);
    } catch (e) {
      aborted = `Pembersihan setelah ${file} GAGAL, jadi berkas berikutnya tidak dijalankan.\n${e instanceof Error ? e.message : String(e)}`;
      break;
    }
  }
} catch (e) {
  aborted = `Pembersihan awal GAGAL: ${e instanceof Error ? e.message : String(e)}\nJalankan sendiri: ${MANUAL_CLEANUP_COMMAND}`;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log("\n=== HASIL test:db ===");
for (const r of results) {
  const detail = r.crashed ? "proses berhenti tanpa laporan (kemungkinan kehabisan memori)" : `${r.passed} lulus, ${r.failed} gagal, ${r.skipped} dilewati`;
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.file}  (${detail}, ${r.seconds} dtk)`);
}
const total = results.reduce((a, r) => ({ passed: a.passed + r.passed, failed: a.failed + r.failed, skipped: a.skipped + r.skipped }), { passed: 0, failed: 0, skipped: 0 });
console.log(`Total: ${total.passed} lulus, ${total.failed} gagal, ${total.skipped} dilewati, ${results.length}/${files.length} berkas dijalankan.`);
if (aborted) console.error(`\n${aborted}`);
process.exit(aborted || results.some((r) => !r.ok) || results.length < files.length ? 1 : 0);
