// Guards shared by the database / ops scripts. Plain Node, no dependencies, no network.
//
// Two kinds of script:
//   * DEV-ONLY (tests, simulator, cleanup, screenshots, reset tools): assertDevOnly() / assertLinkedIsDev(). They refuse to run unless the
//     Supabase URL in the environment is EXACTLY <SUPABASE_DEV_PROJECT_REF>.supabase.co and (for CLI-based ones) the linked project is the dev one.
//   * PRODUCTION-CAPABLE (db:push:prod, prod:verify, admin:create, cron:enable, bootstrap): they need `--project-ref REF` / a REF argument, never read
//     .env.local (so a dev secret can never leak into a production run), and take every secret from the terminal session environment only.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** A Supabase project ref: 20 lower-case letters. */
export const REF_RE = /^[a-z]{20}$/;
export const isValidRef = (ref) => typeof ref === "string" && REF_RE.test(ref);

/** "abcdefghijklmnopqrst.supabase.co" -> "abcdefghijklmnopqrst"; anything else (other hosts, look-alikes, localhost) -> null. */
export function refFromUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
    const m = /^([a-z]{20})\.supabase\.co$/.exec(u.hostname);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}
export const urlMatchesRef = (url, ref) => isValidRef(ref) && refFromUrl(url) === ref;

/** SUPABASE_DEV_PROJECT_REF from the session, or (only this one non-secret variable) from .env.local. */
export function readDevRef(env = process.env, file = ".env.local") {
  const fromEnv = (env.SUPABASE_DEV_PROJECT_REF ?? "").trim();
  if (fromEnv) return fromEnv;
  try {
    if (!existsSync(file)) return "";
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = /^\s*SUPABASE_DEV_PROJECT_REF\s*=\s*(.*)$/.exec(line);
      if (m) return m[1].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* unreadable */
  }
  return "";
}

/**
 * Production target check (pure). `ref` must look like a project ref, must not be the dev project, and the dev ref must be KNOWN
 * (otherwise the guard cannot protect it, so we stop and ask for it to be set).
 */
export function checkProdTarget(ref, devRef) {
  if (!ref) return { ok: false, error: "Project ref wajib diisi, tanpa tanda kurung. Contoh: npm run db:push:prod -- abcdefghijklmnopqrst" };
  if (!isValidRef(ref)) return { ok: false, error: `"${ref}" bukan project ref yang valid (20 huruf kecil). Ketik tanpa tanda kurung.` };
  if (!devRef) return { ok: false, error: "SUPABASE_DEV_PROJECT_REF belum diatur (di session atau .env.local). Isi dulu supaya project DEV terlindungi dari skrip production." };
  if (ref === devRef) return { ok: false, error: "DITOLAK: ref ini adalah project DEV (SUPABASE_DEV_PROJECT_REF). Skrip production tidak pernah berjalan terhadap DEV." };
  return { ok: true };
}

/** DEV-only scripts: the URL must be exactly the dev project. */
export function checkDevOnly(env, devRef) {
  if (!devRef) return { ok: false, error: "SUPABASE_DEV_PROJECT_REF belum diatur. Skrip ini hanya boleh berjalan terhadap project DEV." };
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!urlMatchesRef(url, devRef)) {
    const got = refFromUrl(url);
    return { ok: false, error: `DITOLAK: NEXT_PUBLIC_SUPABASE_URL (${got ?? "bukan alamat supabase.co yang valid"}) bukan project DEV. Skrip ini hanya boleh berjalan terhadap SUPABASE_DEV_PROJECT_REF.` };
  }
  return { ok: true };
}

/** The ref the Supabase CLI is linked to (supabase/.temp/project-ref), or "". */
export function linkedRef(root = ".") {
  try {
    return readFileSync(join(root, "supabase", ".temp", "project-ref"), "utf8").trim();
  } catch {
    return "";
  }
}

export function checkLinkedIsDev(linked, devRef) {
  if (!devRef) return { ok: false, error: "SUPABASE_DEV_PROJECT_REF belum diatur." };
  if (!linked) return { ok: false, error: "Supabase CLI belum ter-link ke project mana pun (npx supabase link). Skrip ini hanya untuk project DEV yang ter-link." };
  if (linked !== devRef) return { ok: false, error: `DITOLAK: Supabase CLI ter-link ke ${linked}, bukan project DEV. Jalankan npx supabase link --project-ref <ref DEV> dulu.` };
  return { ok: true };
}

const die = (message) => {
  console.error(message);
  process.exit(1);
};

/** For dev-only scripts: exit unless the environment URL is the dev project (and, with { linked: true }, the CLI link is too). */
export function assertDevOnly({ env = process.env, linked = false } = {}) {
  const devRef = readDevRef(env);
  const a = checkDevOnly(env, devRef);
  if (!a.ok) die(a.error);
  if (linked) {
    const b = checkLinkedIsDev(linkedRef(), devRef);
    if (!b.ok) die(b.error);
  }
  return devRef;
}

/** Every `npx supabase ... --remote` call of a dev-only script goes through here: the linked project must be the dev one. */
export function assertLinkedIsDev() {
  const devRef = readDevRef();
  const r = checkLinkedIsDev(linkedRef(), devRef);
  if (!r.ok) die(r.error);
  return devRef;
}

/** Pending migration file names found in the output of `supabase db push --dry-run`. */
export function parsePendingMigrations(output) {
  const found = [...String(output).matchAll(/\b(\d{14}_[A-Za-z0-9_-]+\.sql)\b/g)].map((m) => m[1]);
  return [...new Set(found)];
}

/**
 * A throw-away Supabase project directory (config + migrations only) so the production project can be linked WITHOUT touching the dev
 * link of this repo (supabase/.temp stays as it is). Returns { dir, cleanup }.
 */
export function makeWorkdir(root = ".") {
  const dir = mkdtempSync(join(tmpdir(), "jago-prod-"));
  mkdirSync(join(dir, "supabase"), { recursive: true });
  cpSync(join(root, "supabase", "config.toml"), join(dir, "supabase", "config.toml"));
  cpSync(join(root, "supabase", "migrations"), join(dir, "supabase", "migrations"), { recursive: true });
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** `--project-ref REF` (or `--project-ref=REF`) from argv, or null. */
export function projectRefArg(argv) {
  const i = argv.findIndex((a) => a === "--project-ref" || a.startsWith("--project-ref="));
  if (i === -1) return null;
  return argv[i].includes("=") ? argv[i].split("=")[1] : (argv[i + 1] ?? "");
}

/**
 * Environment for a script that may run against production.
 *  - with --project-ref REF: PRODUCTION mode. REF must pass checkProdTarget, NO file is read, and NEXT_PUBLIC_SUPABASE_URL (from the session)
 *    must be exactly https://REF.supabase.co. Returns { prod: true, ref, env: process.env }.
 *  - without it: DEV mode (loads .env.local like before) and the URL must be exactly the dev project, otherwise it stops.
 */
export function resolveTarget({ argv = process.argv.slice(2), loadDevEnv }) {
  const ref = projectRefArg(argv);
  if (ref !== null) {
    const devRef = readDevRef();
    const c = checkProdTarget(ref, devRef);
    if (!c.ok) die(c.error);
    if (!urlMatchesRef(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", ref)) {
      die(`DITOLAK: NEXT_PUBLIC_SUPABASE_URL di session harus persis https://${ref}.supabase.co. Mode production tidak membaca .env.local.`);
    }
    return { prod: true, ref, env: process.env };
  }
  loadDevEnv?.();
  assertDevOnly();
  return { prod: false, ref: readDevRef(), env: process.env };
}

/**
 * For runners that start tests: merge .env.local into the environment (the session wins), then require the dev project.
 * Used by `npm run test:db` / `npm run test:e2e` before anything starts.
 */
export function assertDevOnlyWithFile({ linked = false, file = ".env.local" } = {}) {
  try {
    if (existsSync(file)) {
      for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
        const i = line.indexOf("=");
        if (i > 0 && !line.trim().startsWith("#")) {
          const k = line.slice(0, i).trim();
          if (process.env[k] === undefined) process.env[k] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
        }
      }
    }
  } catch {
    /* unreadable: the check below fails */
  }
  return assertDevOnly({ linked });
}

// ---------------------------------------------------------------------------------------------------------------------------------
// db:push:prod helpers (pure, unit-tested). Supabase CLI v3: `db push` targets the LOCAL stack unless --remote is given, so every push
// call is built here and ALWAYS carries --remote=<ref> (the typed production ref), and its output is checked before anything is applied.
// ---------------------------------------------------------------------------------------------------------------------------------

/** `supabase link` arguments for the throw-away workdir. */
export function buildLinkArgs(ref, workdir) {
  if (!isValidRef(ref)) throw new Error(`ref tidak valid: ${ref}`);
  return ["link", "--project-ref", ref, "--workdir", workdir];
}

/**
 * `supabase db push` arguments. Always `--remote=<ref>` (never the local default, never --local / --db-url), for the dry run AND the real push.
 * `--yes` is added only to the real push (the caller does that after you typed the ref again).
 */
export function buildPushArgs({ ref, workdir, dryRun }) {
  if (!isValidRef(ref)) throw new Error(`ref tidak valid: ${ref}`);
  if (!workdir) throw new Error("workdir wajib");
  return ["db", "push", ...(dryRun ? ["--dry-run"] : []), `--remote=${ref}`, "--workdir", workdir, ...(dryRun ? [] : ["--yes"])];
}

const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;

/**
 * What the CLI says it will talk to, from its "Target:" line.
 *   "Target: local stack (127.0.0.1:54322) · default; pass --remote ..."  -> { kind: "local" }
 *   "Target: project NAME (abcdefghijklmnopqrst) · production"           -> { kind: "project", ref }
 *   anything else / no Target line                                       -> { kind: "unknown" }
 * Any mention of "local stack" anywhere in the output counts as local.
 */
export function parseCliTarget(output) {
  const text = String(output ?? "").replace(ANSI, "");
  if (/local stack/i.test(text)) return { kind: "local" };
  const line = /^\s*Target:\s*(.+?)\s*$/im.exec(text)?.[1];
  if (!line) return { kind: "unknown" };
  if (/\b(127\.0\.0\.1|localhost)\b/i.test(line)) return { kind: "local" };
  const ref = /\(([a-z]{20})\)/.exec(line)?.[1];
  return ref ? { kind: "project", ref } : { kind: "unknown", line };
}

/** The dry-run output must name exactly the project that was typed. Anything else (local, another ref, unreadable) aborts. */
export function checkPushTarget(output, ref) {
  const t = parseCliTarget(output);
  if (t.kind === "local") return { ok: false, error: "DIBATALKAN: CLI memilih stack LOKAL (127.0.0.1), bukan project production. Tidak ada yang diterapkan." };
  if (t.kind === "project" && t.ref !== ref) return { ok: false, error: `DIBATALKAN: CLI menargetkan project ${t.ref}, bukan ${ref} yang kamu ketik. Tidak ada yang diterapkan.` };
  if (t.kind !== "project") return { ok: false, error: "DIBATALKAN: target CLI tidak bisa dipastikan dari keluarannya (tidak ada baris \"Target: project ...\"). Tidak ada yang diterapkan." };
  return { ok: true };
}

/** The ref the temporary workdir is linked to (supabase/.temp/project-ref inside it), or "". */
export function readWorkdirLinkedRef(workdir) {
  return linkedRef(workdir);
}

/** Replaces every occurrence of a secret (and nothing else) so a password never reaches the screen, an error or a log. */
export function maskSecrets(text, secrets) {
  let out = String(text ?? "");
  for (const s of secrets ?? []) if (typeof s === "string" && s.length >= 3) out = out.split(s).join("***");
  return out;
}

/** A command line for display, with secrets masked. */
export function formatCommand(args, secrets = []) {
  return maskSecrets(["supabase", ...args].join(" "), secrets);
}
