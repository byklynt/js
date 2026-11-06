// Safe production migration push.
//   npm run db:push:prod -- PROJECT_REF            (type the ref as is, without angle brackets)
//   npm run db:push:prod -- PROJECT_REF --dry-run   (stop after the dry run)
//
// What it does, in this order:
//   1. refuses a malformed ref and the DEV project (SUPABASE_DEV_PROJECT_REF);
//   2. needs SUPABASE_DB_PASSWORD in the TERMINAL SESSION environment (it never reads a file, never takes the password as an argument);
//   3. prints the target project (name, ref, region), links a throw-away copy of supabase/ to it (the dev link of this repo is not touched)
//      and checks the link is exactly the typed ref;
//   4. runs `supabase db push --dry-run --remote=REF` (CLI v3 targets the LOCAL stack unless --remote is given) and aborts unless its
//      "Target:" line names exactly that project (local stack, another ref or an unreadable line all abort);
//   5. applies the pending migrations (`db push --remote=REF --yes`) only after you type the project ref again.
// Nothing is applied by this script on its own: it is meant to be run by you, on purpose. See docs/production-setup.md.
import { spawnSync } from "node:child_process";
import readline from "node:readline";
import { buildLinkArgs, buildPushArgs, checkProdTarget, checkPushTarget, formatCommand, makeWorkdir, maskSecrets, parsePendingMigrations, readDevRef, readWorkdirLinkedRef } from "./lib/prod-guard.mjs";

const args = process.argv.slice(2);
const dryRunOnly = args.includes("--dry-run");
const ref = args.find((a) => !a.startsWith("--")) ?? "";
const win = process.platform === "win32";
const die = (m) => {
  console.error(m);
  process.exit(1);
};

const check = checkProdTarget(ref, readDevRef());
if (!check.ok) die(check.error);

const password = process.env.SUPABASE_DB_PASSWORD ?? "";
if (!password) {
  die(
    [
      "SUPABASE_DB_PASSWORD belum ada di session terminal ini. Skrip ini tidak membaca file dan tidak menerima password lewat argumen.",
      "  PowerShell: $env:SUPABASE_DB_PASSWORD = Read-Host 'Password database production'   (lalu jalankan skrip ini di jendela yang sama)",
      "  bash/zsh  : read -rs SUPABASE_DB_PASSWORD && export SUPABASE_DB_PASSWORD",
      "Pastikan ini password database project PRODUCTION, bukan DEV.",
    ].join("\n")
  );
}

/** Runs the Supabase CLI. The password travels only in the child's environment; an echoed command (DB_PUSH_ECHO=1) is masked. */
function cli(cliArgs, opts = {}) {
  if (process.env.DB_PUSH_ECHO) console.log(`  $ ${formatCommand(cliArgs, [password])}`);
  return spawnSync("npx", ["supabase", ...cliArgs], { encoding: "utf8", shell: win, env: process.env, ...opts });
}

// --- target: name and region from the account's project list (read-only) ---
const list = cli(["projects", "list", "--output", "json"]);
if (list.status !== 0) die(`Tidak bisa membaca daftar project (sudah login? npx supabase login atau SUPABASE_ACCESS_TOKEN):\n${(list.stderr || list.stdout || "").slice(-600)}`);
let project;
try {
  const all = JSON.parse(list.stdout);
  project = all.find((p) => p.id === ref || p.ref === ref || p.reference_id === ref);
} catch {
  die("Daftar project tidak bisa dibaca (format tidak dikenal).");
}
if (!project) die(`Project ${ref} tidak ditemukan di akun yang sedang login. Tidak ada yang dijalankan.`);
const region = project.region ?? "(region tidak diketahui)";
console.log("");
console.log("TARGET PRODUCTION");
console.log(`  nama   : ${project.name ?? "(tanpa nama)"}`);
console.log(`  ref    : ${ref}`);
console.log(`  region : ${region}`);
console.log("");

const work = makeWorkdir();
let exitCode = 0;
const fatal = (m) => { throw new Error(m); };
try {
  const link = cli(buildLinkArgs(ref, work.dir));
  if (link.status !== 0) fatal(maskSecrets(`Gagal menautkan ke project ${ref}:\n${(link.stderr || link.stdout || "").slice(-600)}`, [password]));
  const linked = readWorkdirLinkedRef(work.dir);
  if (linked !== ref) fatal(`DIBATALKAN: salinan sementara supabase/ tertaut ke "${linked || "(tidak ada)"}", bukan ${ref}. Tidak ada yang diterapkan.`);

  const dry = cli(buildPushArgs({ ref, workdir: work.dir, dryRun: true }));
  const dryOut = maskSecrets(`${dry.stdout ?? ""}${dry.stderr ?? ""}`, [password]);
  // the target is verified first, even when the CLI failed (a failure against the local stack must say so)
  const target = checkPushTarget(dryOut, ref);
  if (!target.ok) fatal(`${target.error}\n${dryOut.slice(-600)}`);
  if (dry.status !== 0) fatal(`Dry run gagal, tidak ada yang diterapkan:\n${dryOut.slice(-1200)}`);
  const pending = parsePendingMigrations(dryOut);
  console.log("DRY RUN (belum ada yang diterapkan):");
  console.log(dryOut.trim() || "(tidak ada keluaran)");
  console.log("");
  if (pending.length === 0) {
    console.log("Tidak ada migrasi tertunda: database production sudah sesuai dengan folder supabase/migrations.");
  } else {
    console.log(`Migrasi tertunda (${pending.length}):`);
    for (const m of pending) console.log(`  - ${m}`);
    console.log("");
    if (dryRunOnly) {
      console.log("--dry-run: berhenti di sini.");
    } else {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise((resolve) => rl.question(`Ketik project ref (${ref}) sekali lagi untuk MENERAPKAN ke production: `, resolve));
      rl.close();
      if (answer.trim() !== ref) {
        console.log("Konfirmasi tidak cocok. Dibatalkan, tidak ada yang diterapkan.");
        exitCode = 2;
      } else {
        const push = cli(buildPushArgs({ ref, workdir: work.dir, dryRun: false }));
        console.log(maskSecrets(`${push.stdout ?? ""}${push.stderr ?? ""}`, [password]).trim());
        if (push.status !== 0) {
          console.error("db push gagal. Periksa pesan di atas; migrasi yang sudah berhasil tercatat di supabase_migrations.schema_migrations.");
          exitCode = 1;
        } else {
          console.log(`\nSelesai. Langkah berikut: npm run prod:verify -- ${ref}`);
        }
      }
    }
  }
} catch (e) {
  console.error(maskSecrets(e instanceof Error ? e.message : String(e), [password]));
  exitCode = 1;
} finally {
  work.cleanup();
}
process.exit(exitCode);
