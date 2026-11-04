"use server";

import QRCode from "qrcode";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-server";
import { findAdminById, getDb } from "@/lib/admin-db";
import { logAdminAction } from "@/lib/admin-audit";
import { verifyAdminPassword } from "@/lib/admin-password";
import { checkRateLimit, recordFailure, resetFailures } from "@/lib/rate-limit";
import { getEncKey } from "@/lib/server/crypto-at-rest";
import { persistAdminState } from "@/lib/server/store";
import { debug2fa, isDev } from "@/lib/server/debug2fa";
import { beginSetup, confirmSetup, disable, fingerprint, userMessage } from "@/lib/server/twofactor";
import { otpauthUrl } from "@/lib/server/totp";

/**
 * 2FA enrolment for the signed-in admin. These actions skip the 2FA gate on purpose: they are the only
 * thing an admin without 2FA can do. Everything else in /admin stays blocked until enrolment is finished.
 * State (pending secret, enabled flag, backup hashes) lives in the durable store, never only in memory.
 */
export type TotpBegin = { ok: true; secret: string; qr: string; expiresAt: string } | { ok: false; error: string; enabled?: boolean };
export type TotpConfirm = { ok: true; backupCodes: string[] } | { ok: false; error: string };
export type TotpDisable = { ok: true } | { ok: false; error: string };

export async function beginTotpSetup(): Promise<TotpBegin> {
  let admin;
  try {
    admin = await requireAdmin("action", { skipGate: true });
  } catch {
    return { ok: false, error: "Sesi berakhir. Masuk ulang." };
  }
  const db = getDb();
  // Same pending secret on every call until it expires, so a reload shows the same QR.
  const result = beginSetup(db, admin.sub, getEncKey());
  debug2fa("setup.begin", { admin: admin.sub, status: result.status, reused: result.status === "pending" ? result.reused : null, fingerprint: result.status === "pending" ? fingerprint(result.secret) : null });
  if (result.status === "already_enabled") return { ok: false, error: "Verifikasi dua langkah sudah aktif.", enabled: true };
  persistAdminState(db);
  const account = findAdminById(admin.sub)?.email ?? admin.username;
  const qr = await QRCode.toDataURL(otpauthUrl(result.secret, account), { margin: 1, width: 192 });
  return { ok: true, secret: result.secret, qr, expiresAt: result.expiresAt };
}

export async function confirmTotpSetup(input: unknown): Promise<TotpConfirm> {
  let admin;
  try {
    admin = await requireAdmin("action", { skipGate: true });
  } catch {
    return { ok: false, error: "Sesi berakhir. Masuk ulang." };
  }
  const parsed = z.object({ code: z.string().regex(/^\d{6}$/, "Masukkan 6 digit kode.") }).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Kode tidak valid." };
  const key = `2fa-setup:${admin.sub}`;
  const limit = checkRateLimit(key);
  if (!limit.allowed) return { ok: false, error: `Terlalu banyak percobaan. Coba lagi dalam ${limit.retryAfterMinutes} menit.` };

  const db = getDb();
  const result = confirmSetup(db, admin.sub, parsed.data.code, getEncKey());
  debug2fa("setup.confirm", { admin: admin.sub, ok: result.ok, fingerprint: result.ok ? result.fingerprint : null, error: result.ok ? null : result.error });
  if (!result.ok) {
    recordFailure(key);
    persistAdminState(db);
    return result;
  }
  resetFailures(key);
  persistAdminState(db);
  logAdminAction({ adminId: admin.sub, adminName: admin.username, action: "auth.2fa_enabled", targetType: "admin", targetId: admin.sub, before: { enabled: false }, after: { enabled: true } });
  return { ok: true, backupCodes: result.backupCodes };
}

/** Turning 2FA off (or starting over) needs the password AND a current code (or backup code). */
export async function disableTotp(input: unknown): Promise<TotpDisable> {
  let admin;
  try {
    admin = await requireAdmin("action");
  } catch {
    return { ok: false, error: "Sesi berakhir. Masuk ulang." };
  }
  const parsed = z.object({ password: z.string().min(1, "Password wajib diisi.").max(200), code: z.string().trim().min(6, "Masukkan kode verifikasi.").max(12) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  const key = `2fa-disable:${admin.sub}`;
  const limit = checkRateLimit(key);
  if (!limit.allowed) return { ok: false, error: `Terlalu banyak percobaan. Coba lagi dalam ${limit.retryAfterMinutes} menit.` };

  const db = getDb();
  const result = disable(db, admin.sub, { passwordOk: verifyAdminPassword(admin.sub, parsed.data.password), code: parsed.data.code }, getEncKey());
  persistAdminState(db);
  if (!result.ok) {
    recordFailure(key);
    return { ok: false, error: result.diag ? userMessage(result.reason as never, result.diag, isDev()) : result.error };
  }
  resetFailures(key);
  logAdminAction({ adminId: admin.sub, adminName: admin.username, action: "auth.2fa_disabled", targetType: "admin", targetId: admin.sub, before: { enabled: true }, after: { enabled: false } });
  return { ok: true };
}
