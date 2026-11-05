"use server";

import QRCode from "qrcode";
import { z } from "zod";
import { logAdminAction } from "@/lib/admin-audit";
import { verifyAdminPassword } from "@/lib/admin-password";
import { requireAdmin } from "@/lib/auth-server";
import { hitRateLimit, LOGIN_LIMIT, minutes, resetRateLimit } from "@/lib/rate-limit";
import { BACKUP_CODE_RE, clearBackupCodes, consumeBackupCode, issueBackupCodes } from "@/lib/server/backup-codes";
import { createClient } from "@/lib/supabase/server";

/**
 * 2FA enrolment for the signed-in admin, on Supabase Auth MFA (TOTP). These actions skip the 2FA gate on purpose: they are
 * the only thing an admin without 2FA can do. Everything else in /admin stays blocked until enrolment is finished.
 * Backup codes are ours (admin_backup_codes, hashed) because Supabase MFA has none.
 */
export type TotpBegin = { ok: true; secret: string; qr: string; expiresAt: string } | { ok: false; error: string; enabled?: boolean };
export type TotpConfirm = { ok: true; backupCodes: string[] } | { ok: false; error: string };
export type TotpDisable = { ok: true } | { ok: false; error: string };

const EXPIRED = "Sesi berakhir. Masuk ulang.";
const SETUP_TTL_MS = 10 * 60 * 1000;

export async function beginTotpSetup(): Promise<TotpBegin> {
  try {
    await requireAdmin("action", { skipGate: true });
  } catch {
    return { ok: false, error: EXPIRED };
  }
  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  if (factors?.totp?.length) return { ok: false, error: "Verifikasi dua langkah sudah aktif.", enabled: true };
  // A half-finished earlier attempt is replaced, so a reload never piles up factors.
  for (const f of factors?.all ?? []) if (f.factor_type === "totp" && f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", issuer: "JagoanSosmed", friendlyName: `JagoanSosmed ${new Date().toISOString().slice(0, 10)}` });
  if (error || !data) return { ok: false, error: "Tidak bisa memulai pengaturan. Coba lagi." };
  const qr = await QRCode.toDataURL(data.totp.uri, { margin: 1, width: 192 });
  return { ok: true, secret: data.totp.secret, qr, expiresAt: new Date(Date.now() + SETUP_TTL_MS).toISOString() };
}

export async function confirmTotpSetup(input: unknown): Promise<TotpConfirm> {
  let admin;
  try {
    admin = await requireAdmin("action", { skipGate: true });
  } catch {
    return { ok: false, error: EXPIRED };
  }
  const parsed = z.object({ code: z.string().regex(/^\d{6}$/, "Masukkan 6 digit kode.") }).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Kode tidak valid." };
  const key = `2fa-setup:${admin.sub}`;
  const limit = await hitRateLimit(key, LOGIN_LIMIT.limit, LOGIN_LIMIT.windowSeconds);
  if (!limit.allowed) return { ok: false, error: `Terlalu banyak percobaan. Coba lagi dalam ${minutes(limit.retryAfterSeconds)} menit.` };

  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const pending = factors?.all?.find((f) => f.factor_type === "totp" && f.status === "unverified");
  if (!pending) return { ok: false, error: "Sesi pengaturan berakhir. Muat ulang halaman untuk memulai lagi." };
  // Verifying also upgrades this session to aal2, so the admin stays signed in.
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: pending.id, code: parsed.data.code });
  if (error) return { ok: false, error: "Kode salah. Cek jam di ponselmu lalu coba lagi." };
  await resetRateLimit(key);
  const backupCodes = await issueBackupCodes(admin.sub);
  await logAdminAction({ adminId: admin.sub, adminName: admin.username, action: "auth.2fa_enabled", targetType: "admin", targetId: admin.sub, before: { enabled: false }, after: { enabled: true } });
  return { ok: true, backupCodes };
}

/** Turning 2FA off (or starting over) needs the password AND a current code (or backup code). */
export async function disableTotp(input: unknown): Promise<TotpDisable> {
  let admin;
  try {
    admin = await requireAdmin("action");
  } catch {
    return { ok: false, error: EXPIRED };
  }
  const parsed = z.object({ password: z.string().min(1, "Password wajib diisi.").max(200), code: z.string().trim().min(6, "Masukkan kode verifikasi.").max(12) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  const key = `2fa-disable:${admin.sub}`;
  const limit = await hitRateLimit(key, LOGIN_LIMIT.limit, LOGIN_LIMIT.windowSeconds);
  if (!limit.allowed) return { ok: false, error: `Terlalu banyak percobaan. Coba lagi dalam ${minutes(limit.retryAfterSeconds)} menit.` };

  if (!(await verifyAdminPassword(admin.sub, parsed.data.password))) return { ok: false, error: "Password salah." };
  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const totp = factors?.totp?.[0];
  if (!totp) return { ok: false, error: "Verifikasi dua langkah belum aktif." };

  const code = parsed.data.code;
  const valid = BACKUP_CODE_RE.test(code)
    ? await consumeBackupCode(admin.sub, code)
    : !(await supabase.auth.mfa.challengeAndVerify({ factorId: totp.id, code })).error;
  if (!valid) return { ok: false, error: "Kode salah atau sudah kedaluwarsa." };

  const { error } = await supabase.auth.mfa.unenroll({ factorId: totp.id });
  if (error) return { ok: false, error: "Tidak bisa menonaktifkan. Coba lagi." };
  await clearBackupCodes(admin.sub);
  await resetRateLimit(key);
  await logAdminAction({ adminId: admin.sub, adminName: admin.username, action: "auth.2fa_disabled", targetType: "admin", targetId: admin.sub, before: { enabled: true }, after: { enabled: false } });
  return { ok: true };
}
