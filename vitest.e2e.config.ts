import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: { environment: "node", include: ["e2e/**/*.test.ts"], fileParallelism: false, testTimeout: 150_000, hookTimeout: 150_000 },
});
