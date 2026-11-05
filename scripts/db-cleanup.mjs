// Removes the data the DB / e2e tests and the dev tools create (users @jagoansosmed-test.invalid, ZT- fixtures ...).
//   node scripts/db-cleanup.mjs
// It runs scripts/db-cleanup-test-data.sql with the Supabase CLI against the LINKED project, and refuses unless that project is the DEV one
// (SUPABASE_DEV_PROJECT_REF), and unless the environment URL, when present, is the DEV project too. It never runs against anything else.
import { spawnSync } from "node:child_process";
import { assertLinkedIsDev, checkDevOnly, readDevRef } from "./lib/prod-guard.mjs";

const devRef = assertLinkedIsDev();
if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
  const c = checkDevOnly(process.env, devRef);
  if (!c.ok) {
    console.error(c.error);
    process.exit(1);
  }
}
void readDevRef;
const r = spawnSync("node", ["scripts/db-cleanup.mjs"], { encoding: "utf8", shell: process.platform === "win32" });
process.stdout.write(r.stdout ?? "");
process.stderr.write(r.stderr ?? "");
process.exit(r.status ?? 1);
