// Starts the production server (run `npm run build` first), runs the browser e2e against it, then stops the server.
import { assertDevOnlyWithFile } from "./lib/prod-guard.mjs";
import { spawn, spawnSync } from "node:child_process";
import { openSync } from "node:fs";

assertDevOnlyWithFile({ linked: true }); // tests create and delete data: dev project only
const PORT = "3110";
const win = process.platform === "win32";
const log = openSync(".e2e-server.log", "w");
const server = spawn("npx", ["next", "start", "-p", PORT], { shell: win, stdio: ["ignore", log, log], env: { ...process.env, PROVIDER_MODE: "mock" } });

async function ready() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://localhost:${PORT}/login`);
      if (r.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

let code = 1;
try {
  if (!(await ready())) throw new Error("server did not start");
  const r = spawnSync("npx", ["vitest", "run", "--config", "vitest.e2e.config.ts", ...process.argv.slice(2)], {
    stdio: "inherit",
    shell: win,
    env: { ...process.env, RUN_E2E: "1", E2E_BASE: `http://localhost:${PORT}` },
  });
  code = r.status ?? 1;
} finally {
  if (win) spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
  else server.kill("SIGTERM");
}
process.exit(code);
