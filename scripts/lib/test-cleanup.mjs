// In-process cleanup of the data the DB / e2e tests create. Used by the tests themselves (beforeAll pre-clean, afterAll), by
// scripts/db-cleanup.mjs (the CLI) and by scripts/run-db-tests.mjs. It needs no extra process: one HTTPS call to public.test_cleanup()
// (migration 29, service role only, refuses unless the DEV-only flag dev_flags.allow_test_cleanup is set on the project).
//
// Guards: SUPABASE_DEV_PROJECT_REF must be known and NEXT_PUBLIC_SUPABASE_URL must be EXACTLY that project. Anything else throws.
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { checkDevOnly, readDevRef } from "./prod-guard.mjs";

/** What to run by hand when the in-process cleanup cannot (linked CLI, DEV project only). */
export const MANUAL_CLEANUP_COMMAND = "npx supabase db query --remote --file scripts/db-cleanup-test-data.sql --yes";

export class CleanupError extends Error {
  constructor(message) {
    super(`${message}\nPembersihan data uji gagal. Jalankan sendiri / run by hand:\n  ${MANUAL_CLEANUP_COMMAND}\n  (or: npm run db:cleanup)`);
    this.name = "CleanupError";
  }
}

/** A copy of the environment where missing variables are filled from .env.local (the session always wins). */
export function envWithFile(env = process.env, file = ".env.local") {
  const out = { ...env };
  try {
    if (existsSync(file)) {
      for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
        const i = line.indexOf("=");
        if (i > 0 && !line.trim().startsWith("#")) {
          const k = line.slice(0, i).trim();
          if (out[k] === undefined) out[k] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
        }
      }
    }
  } catch {
    /* unreadable: the guard below fails */
  }
  return out;
}

/**
 * Removes the test data (everything tagged as test data, or only one suite's fixtures with `marker`). Returns the number of rows removed per
 * table, e.g. { services: 5005, auth_users: 21, ... }. Throws CleanupError (with the manual command in the message) on ANY problem: it never
 * continues silently.
 */
/** @param {{ marker?: string | null, env?: NodeJS.ProcessEnv, retries?: number }} [options] */
export async function cleanupTestData({ marker = null, env = process.env, retries = 2 } = {}) {
  const e = envWithFile(env);
  const devRef = readDevRef(e);
  const guard = checkDevOnly(e, devRef);
  if (!guard.ok) throw new CleanupError(guard.error);
  const key = e.SUPABASE_SECRET_KEY || e.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!key) throw new CleanupError("SUPABASE_SECRET_KEY (atau SUPABASE_SERVICE_ROLE_KEY) tidak ditemukan.");
  if (marker !== null && !/^[a-z0-9]{1,12}$/.test(marker)) throw new CleanupError(`Marker "${marker}" tidak valid (1-12 huruf kecil/angka).`);
  const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
  let lastError = "";
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { data, error } = await sb.rpc("test_cleanup", marker ? { p_marker: marker } : {});
      if (!error) return { ...(data ?? {}), ...(await removeTestImages(sb, marker)) };
      lastError = `${error.message}${error.hint ? ` (${error.hint})` : ""}`;
      if (error.hint === "disabled" || error.hint === "bad_marker") break; // not transient
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  throw new CleanupError(`test_cleanup gagal: ${lastError}`);
}

/**
 * Test images in the public "blog-images" bucket (names zt-...): SQL cannot delete storage objects, the Storage API can. Only objects whose name
 * starts with zt- (and zt-<marker> when a marker is given) are removed. Throws nothing: a failed removal is reported as a count of 0.
 */
async function removeTestImages(sb, marker) {
  try {
    const { data } = await sb.storage.from("blog-images").list("", { limit: 1000, search: "zt-" });
    const prefix = marker ? `zt-${marker}` : "zt-";
    const names = (data ?? []).map((o) => o.name).filter((n) => n.startsWith(prefix));
    if (!names.length) return {};
    const { data: removed } = await sb.storage.from("blog-images").remove(names);
    return { blog_images: removed?.length ?? 0 };
  } catch {
    return {};
  }
}

/** "services=5005, auth_users=21" (only the tables that had rows) or "tidak ada yang dihapus". */
export function summarizeCleanup(counts) {
  const parts = Object.entries(counts ?? {}).filter(([, n]) => Number(n) > 0).map(([t, n]) => `${t}=${n}`);
  return parts.length ? parts.join(", ") : "tidak ada yang dihapus";
}

/** For hooks: cleans up and throws loudly (also printing the message) when it cannot. */
/** @param {{ marker?: string | null, env?: NodeJS.ProcessEnv, retries?: number }} [options] */
export async function cleanupOrFail(options = {}) {
  try {
    return await cleanupTestData(options);
  } catch (e) {
    console.error(`\n[test-cleanup] ${e instanceof Error ? e.message : String(e)}\n`);
    throw e;
  }
}
