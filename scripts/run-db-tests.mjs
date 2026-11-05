// Runs the DB integration tests (they are skipped in a normal `npm test`).
import { spawnSync } from "node:child_process";

const r = spawnSync("npx", ["vitest", "run", "lib/server/__tests__/db-concurrency.test.ts"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, RUN_DB_TESTS: "1" },
});
process.exit(r.status ?? 1);
