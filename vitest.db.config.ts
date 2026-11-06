import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * The DB integration suites (npm run test:db): they talk to the DEV Supabase project over HTTPS, so what matters is memory, not CPU.
 * One worker, files never in parallel, a capped heap, and generous hook timeouts (the hooks create and delete data on the remote project).
 */
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["lib/server/__tests__/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    pool: "forks",
    maxWorkers: 1,
    fileParallelism: false,
    execArgv: ["--max-old-space-size=768"],
    testTimeout: 180_000,
    hookTimeout: 300_000,
    teardownTimeout: 120_000,
  },
});
