import "server-only";
import { hashPassword, verifyPassword } from "@/lib/server/password";
import { getStore } from "@/lib/server/store";

/**
 * Placeholder credential store for the mock admin accounts.
 * TODO: replace with the real auth provider. Never keep passwords in code or env defaults in production:
 * in production no account can sign in unless ADMIN_DEV_PASSWORD (or a real store) is configured.
 */
export { hashPassword, verifyPassword };

const globalForPasswords = globalThis as unknown as { __sgAdminHashes?: Map<string, string> };

function devPassword(): string | null {
  if (process.env.ADMIN_DEV_PASSWORD) return process.env.ADMIN_DEV_PASSWORD;
  // Development-only default so the mock admin area can be explored locally.
  return process.env.NODE_ENV === "production" ? null : "admin12345";
}

const dummyHash = hashPassword("dummy-password-for-timing", "0".repeat(32));

/** Stored scrypt hashes per admin id (created lazily so the plaintext never lives in a constant). */
function hashes(): Map<string, string> {
  if (!globalForPasswords.__sgAdminHashes) {
    const map = new Map<string, string>();
    const pwd = devPassword();
    if (pwd) {
      map.set("adm_1", hashPassword(pwd));
      map.set("adm_2", hashPassword(pwd));
    }
    // Passwords changed in the panel survive restarts (durable store); the dev default only fills the gaps.
    for (const [id, hash] of Object.entries(getStore().read().adminPasswords ?? {})) map.set(id, hash);
    globalForPasswords.__sgAdminHashes = map;
  }
  return globalForPasswords.__sgAdminHashes;
}

/** Constant-ish time check: also hashes a dummy when the account has no stored hash. */
export function verifyAdminPassword(adminId: string | null, password: string): boolean {
  const stored = adminId ? hashes().get(adminId) : undefined;
  const ok = verifyPassword(password, stored ?? dummyHash);
  return Boolean(stored) && ok;
}

export function setAdminPassword(adminId: string, password: string) {
  const hash = hashPassword(password);
  hashes().set(adminId, hash);
  getStore().update({ adminPasswords: { ...(getStore().read().adminPasswords ?? {}), [adminId]: hash } });
}
