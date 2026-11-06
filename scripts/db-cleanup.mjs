// Removes the data the DB / e2e tests and the dev tools create (users @jagoansosmed-test.invalid, ZT- fixtures ...).
//   node scripts/db-cleanup.mjs              everything tagged as test data
//   node scripts/db-cleanup.mjs --marker rf  only the fixtures of one suite (its run ids start with "rf")
// It runs IN-PROCESS: one HTTPS call to public.test_cleanup() (no CLI, no extra process, so it works under memory pressure). It refuses
// unless NEXT_PUBLIC_SUPABASE_URL is exactly the DEV project (SUPABASE_DEV_PROJECT_REF). It prints how many rows it removed per table and
// exits 1 (printing the exact command to run by hand) if anything goes wrong.
import { cleanupTestData, summarizeCleanup } from "./lib/test-cleanup.mjs";

const i = process.argv.indexOf("--marker");
const marker = i === -1 ? null : (process.argv[i + 1] ?? "");

try {
  const counts = await cleanupTestData({ marker: marker === "" ? "?" : marker });
  console.log(`db-cleanup${marker ? ` (marker ${marker})` : ""}: ${summarizeCleanup(counts)}`);
  console.log(JSON.stringify(counts));
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
