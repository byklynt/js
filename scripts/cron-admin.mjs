// Production scheduling on Supabase (pg_cron + pg_net + Vault).
//   npm run cron:enable  -- https://your-app.example [--confirm]
//   npm run cron:disable -- [--purge] [--confirm]
// Without --confirm nothing is sent: the script prints what it WOULD do (secrets redacted). With --confirm it runs against the LINKED project.
// CRON_SECRET is read from .env.local (or the environment). The generated SQL (which contains the secret) goes through a temporary file with
// owner-only permissions that is deleted right after the run; the secret is never printed.
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildEnableSql, purgeSecretsSql, redact } from "./lib/cron-sql.mjs";

const [command, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith("--")));
const positional = rest.filter((a) => !a.startsWith("--"));

function loadEnv() {
  const out = {};
  if (!existsSync(".env.local")) return out;
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0 && !line.trim().startsWith("#")) out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}
const env = { ...loadEnv(), ...process.env };

function run(sql, label) {
  const dir = mkdtempSync(join(tmpdir(), "jago-cron-"));
  const file = join(dir, "job.sql");
  try {
    writeFileSync(file, sql, { mode: 0o600 });
    try { chmodSync(file, 0o600); } catch { /* not supported on this OS */ }
    const r = spawnSync("npx", ["supabase", "db", "query", "--remote", "--file", file, "--yes"], { encoding: "utf8", shell: process.platform === "win32" });
    const out = redact(`${r.stdout ?? ""}${r.stderr ?? ""}`, env.CRON_SECRET);
    if (r.status !== 0) {
      console.error(`${label}: GAGAL\n${out.slice(-1500)}`);
      process.exit(1);
    }
    console.log(`${label}: selesai.`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (command === "enable") {
  if (!positional[0]) {
    console.error("Pemakaian: npm run cron:enable -- https://url-aplikasi-publik [--confirm]");
    process.exit(1);
  }
  const sql = buildEnableSql({ appUrl: positional[0], secret: env.CRON_SECRET });
  if (!flags.has("--confirm")) {
    console.log("DRY RUN (tidak ada yang dikirim). Tambahkan --confirm untuk menjalankan ke proyek Supabase yang ter-link.\n");
    console.log(redact(sql, env.CRON_SECRET));
    process.exit(0);
  }
  run(sql, "cron:enable");
  console.log("Cek: select jobname, schedule, active from cron.job;  (lihat docs/supabase-setup.md)");
} else if (command === "disable") {
  const sql = readFileSync("supabase/cron/disable-cron.sql", "utf8") + (flags.has("--purge") ? `\n${purgeSecretsSql}` : "");
  if (!flags.has("--confirm")) {
    console.log("DRY RUN. Tambahkan --confirm untuk menghentikan semua job.\n");
    console.log(sql);
    process.exit(0);
  }
  run(sql, "cron:disable");
} else {
  console.error("Perintah: enable | disable");
  process.exit(1);
}
