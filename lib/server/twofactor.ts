/**
 * Admin 2FA lifecycle on top of the store: pending setup, confirm, login check, disable.
 * Pure over `db` and an explicit encryption key, so it is unit tested without a database or env.
 * Secrets are encrypted before they are put anywhere (AES-GCM, see crypto-at-rest.ts).
 */
import { createHash } from "node:crypto";
import type { AdminDb } from "@/lib/admin-data";
import { decryptSecret, encryptSecret } from "./crypto-at-rest";
import { consumeBackupCode, generateBackupCodes, generateSecret, matchTotpStep, totpStep } from "./totp";

export const PENDING_TTL_MS = 10 * 60_000;
export const BACKUP_CODE_COUNT = 10;

/** Why a code was refused. Shown in development, collapsed to one generic message in production. */
export type FailReason = "not_enabled" | "wrong_code" | "replay" | "decrypt_error" | "backup_invalid";

/** Safe-to-log facts about one check: never the secret and never the code. */
export type Diag = {
  via: "totp" | "backup";
  /** The 30s step of the server clock and the steps that were accepted around it. */
  nowStep: number;
  window: [number, number];
  matchedStep: number | null;
  lastUsedStep: number | null;
  decrypt: "ok" | "failed" | "n/a";
  /** First 8 hex chars of sha256(secret): lets two log lines prove they used the same secret. */
  fingerprint: string | null;
};

export const fingerprint = (secret: string) => createHash("sha256").update(secret).digest("hex").slice(0, 8);

const GENERIC = "Kode salah atau kedaluwarsa.";

const DEV_MESSAGES: Record<FailReason, (d: Diag) => string> = {
  not_enabled: () => "[dev] Verifikasi dua langkah belum aktif untuk akun ini.",
  wrong_code: (d) => `[dev] Kode tidak cocok dengan langkah waktu server ${d.nowStep} (jendela ${d.window[0]} sampai ${d.window[1]}). Periksa jam ponsel dan jam komputer.`,
  replay: (d) => `[dev] Kode ini sudah dipakai (langkah ${d.matchedStep} <= langkah terakhir yang dipakai ${d.lastUsedStep}). Tunggu kode berikutnya, sekitar 30 detik.`,
  decrypt_error: () => "[dev] Rahasia 2FA tidak bisa didekripsi. ADMIN_2FA_ENC_KEY kemungkinan berubah sejak 2FA diaktifkan. Jalankan: npm run admin:reset-2fa -- <username>",
  backup_invalid: () => "[dev] Kode cadangan tidak dikenal atau sudah dipakai.",
};

/** Development shows the reason; production always shows the same generic text (no oracle for attackers). */
export function userMessage(reason: FailReason, diag: Diag, dev: boolean): string {
  return dev ? DEV_MESSAGES[reason](diag) : GENERIC;
}

function tryDecrypt(payload: string, key: Buffer): string | null {
  try {
    return decryptSecret(payload, key);
  } catch {
    return null;
  }
}

export type BeginResult = { status: "pending"; secret: string; expiresAt: string; reused: boolean } | { status: "already_enabled" };

/**
 * One secret per setup attempt. Calling this again (page reload, React strict mode) returns the SAME secret
 * while the pending one is still valid; only an expired, missing or unreadable pending setup gets a new secret.
 */
export function beginSetup(db: AdminDb, adminId: string, key: Buffer, now = new Date()): BeginResult {
  if (db.adminSecurity[adminId]?.enabled) return { status: "already_enabled" };
  const pending = db.pending2fa[adminId];
  if (pending && new Date(pending.expiresAt).getTime() > now.getTime()) {
    const secret = tryDecrypt(pending.secretEnc, key);
    if (secret) return { status: "pending", secret, expiresAt: pending.expiresAt, reused: true };
  }
  const secret = generateSecret();
  const expiresAt = new Date(now.getTime() + PENDING_TTL_MS).toISOString();
  db.pending2fa[adminId] = { secretEnc: encryptSecret(secret, key), createdAt: now.toISOString(), expiresAt };
  return { status: "pending", secret, expiresAt, reused: false };
}

export type ConfirmResult = { ok: true; backupCodes: string[]; fingerprint: string } | { ok: false; error: string };

export function confirmSetup(db: AdminDb, adminId: string, code: string, key: Buffer, now = new Date()): ConfirmResult {
  if (db.adminSecurity[adminId]?.enabled) return { ok: false, error: "Verifikasi dua langkah sudah aktif." };
  const pending = db.pending2fa[adminId];
  if (!pending || new Date(pending.expiresAt).getTime() <= now.getTime()) {
    delete db.pending2fa[adminId];
    return { ok: false, error: "Pengaturan kedaluwarsa. Muat ulang halaman untuk memulai lagi." };
  }
  const secret = tryDecrypt(pending.secretEnc, key);
  if (!secret) {
    delete db.pending2fa[adminId];
    return { ok: false, error: "Pengaturan tidak bisa dibaca (kunci enkripsi berubah?). Muat ulang halaman untuk memulai lagi." };
  }
  if (matchTotpStep(secret, code, now.getTime()) === null) return { ok: false, error: "Kode salah. Pastikan jam ponselmu akurat, lalu coba lagi." };
  const codes = generateBackupCodes(BACKUP_CODE_COUNT);
  // The setup code is NOT burned (lastUsedStep stays 0): setting up is not a login, and burning it made the very
  // next sign-in with the same on-screen code fail as a "replay". Codes used to LOG IN are burned (see checkCode).
  db.adminSecurity[adminId] = { secretEnc: pending.secretEnc, enabled: true, enabledAt: now.toISOString(), backupHashes: codes.hashes, lastUsedStep: 0 };
  delete db.pending2fa[adminId];
  return { ok: true, backupCodes: codes.plain, fingerprint: fingerprint(secret) };
}

export type CodeResult = { ok: true; via: "totp" | "backup"; diag: Diag } | { ok: false; reason: FailReason; error: string; diag: Diag };

const fail = (reason: FailReason, diag: Diag): CodeResult => ({ ok: false, reason, error: DEV_MESSAGES[reason](diag), diag });

/**
 * Login / sensitive-action check. A TOTP step can be used once (last_used_step), so a code that was already
 * accepted, or an older one, is rejected. A backup code is consumed. The result always carries a Diag.
 */
export function checkCode(db: AdminDb, adminId: string, code: string, key: Buffer, now = new Date()): CodeResult {
  const nowStep = totpStep(now.getTime());
  const base: Diag = { via: /^\d{6}$/.test(code) ? "totp" : "backup", nowStep, window: [nowStep - 1, nowStep + 1], matchedStep: null, lastUsedStep: null, decrypt: "n/a", fingerprint: null };
  const security = db.adminSecurity[adminId];
  if (!security?.enabled || !security.secretEnc) return fail("not_enabled", base);
  base.lastUsedStep = security.lastUsedStep;

  if (base.via === "totp") {
    const secret = tryDecrypt(security.secretEnc, key);
    if (!secret) return fail("decrypt_error", { ...base, decrypt: "failed" });
    base.decrypt = "ok";
    base.fingerprint = fingerprint(secret);
    const step = matchTotpStep(secret, code, now.getTime());
    if (step === null) return fail("wrong_code", base);
    base.matchedStep = step;
    if (step <= security.lastUsedStep) return fail("replay", base);
    security.lastUsedStep = step;
    return { ok: true, via: "totp", diag: base };
  }
  const remaining = consumeBackupCode(security.backupHashes, code);
  if (!remaining) return fail("backup_invalid", base);
  security.backupHashes = remaining;
  return { ok: true, via: "backup", diag: base };
}

/** Disable (or start over): needs the password AND a current code. */
export function disable(db: AdminDb, adminId: string, input: { passwordOk: boolean; code: string }, key: Buffer, now = new Date()): CodeResult | { ok: false; reason: "password"; error: string; diag: null } {
  if (!input.passwordOk) return { ok: false, reason: "password", error: "Password salah.", diag: null };
  const check = checkCode(db, adminId, input.code, key, now);
  if (!check.ok) return check;
  delete db.adminSecurity[adminId];
  delete db.pending2fa[adminId];
  return check;
}
