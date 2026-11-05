"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { logAdminAction } from "@/lib/admin-audit";
import { loadSettings } from "@/lib/server/repo/settings";
import { supabaseAdmin as sbAdmin } from "@/lib/server/supabase-admin";
import { getClientIp, loadIdentity } from "@/lib/auth-server";
import { hitRateLimit, LOGIN_LIMIT, minutes, resetRateLimit } from "@/lib/rate-limit";
import { ipAllowed } from "@/lib/server/access";
import { recordAdminSession, revokeAdminSession } from "@/lib/server/admin-sessions";
import { BACKUP_CODE_RE, clearBackupCodes, consumeBackupCode } from "@/lib/server/backup-codes";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { resolveLoginEmail } from "@/lib/server/user-auth";
import { createClient } from "@/lib/supabase/server";

export type AdminLoginResult =
  | { status: "ok"; message?: string }
  | { status: "needs_2fa" }
  /** A backup code was entered: the admin must confirm (in Indonesian) that this REMOVES the authenticator before anything is changed. */
  | { status: "confirm_backup"; message: string }
  | { status: "error"; message: string };

const GENERIC_ERROR = "Username atau password salah";
const WRONG_CODE = "Kode salah atau sudah kedaluwarsa. Coba kode terbaru dari aplikasi autentikator.";

const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Username atau email wajib diisi.").max(120),
  password: z.string().min(1, "Password wajib diisi.").max(200),
});

const codeSchema = z.object({ code: z.string().trim().regex(/^(\d{6}|[a-z0-9]{4}-[a-z0-9]{4})$/i, "Masukkan 6 digit kode atau kode cadangan."), confirmBackup: z.boolean().optional() });

const BACKUP_CONFIRM_MESSAGE =
  "Kode cadangan akan MENONAKTIFKAN verifikasi dua langkah di akunmu. Setelah masuk, kamu wajib mengatur ulang aplikasi autentikator (memindai kode QR baru) dan menyimpan kode cadangan baru. Kode cadangan ini hanya bisa dipakai sekali. Lanjutkan?";

/** The session is fully authenticated: record it, alert, audit. */
async function finishLogin(admin: { id: string; username: string }, sid: string | undefined, ip: string) {
  const h = await headers();
  if (sid) await recordAdminSession(sid, admin.id, ip, h.get("user-agent") ?? "tidak diketahui");
  if ((await loadSettings()).notifications.toggles.new_admin_login) await sbAdmin().from("admin_alerts").insert({ kind: "new_admin_login", message: `Login admin baru: ${admin.username} dari ${ip}.` });
  await logAdminAction({ adminId: admin.id, adminName: admin.username, action: "auth.login", targetType: "admin", targetId: admin.id, before: null, after: { at: new Date().toISOString() } });
}

/** Step 1: username/email + password. Never reveals which part was wrong, or whether the account is an admin. */
export async function adminLogin(input: unknown): Promise<AdminLoginResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? GENERIC_ERROR };
  const { identifier, password } = parsed.data;
  const ip = await getClientIp();
  if (!ipAllowed((await loadSettings()).security.ipAllowlist, ip)) return { status: "error", message: "Akses dari alamat IP ini tidak diizinkan." };

  const key = `admin-login:${ip}:${identifier.toLowerCase()}`;
  const limit = await hitRateLimit(key, LOGIN_LIMIT.limit, LOGIN_LIMIT.windowSeconds);
  if (!limit.allowed) return { status: "error", message: `Terlalu banyak percobaan. Coba lagi dalam ${minutes(limit.retryAfterSeconds)} menit.` };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: await resolveLoginEmail(identifier), password });
  if (error || !data.user) return { status: "error", message: GENERIC_ERROR };

  const { data: profile } = await supabaseAdmin().from("profiles").select("id,username,role,status").eq("id", data.user.id).maybeSingle();
  if (!profile || profile.role !== "admin" || profile.status !== "aktif") {
    await supabase.auth.signOut({ scope: "local" }); // a normal user must not keep a session from the admin door
    return { status: "error", message: GENERIC_ERROR };
  }

  const { data: claims } = await supabase.auth.getClaims();
  const sid = (claims?.claims as { session_id?: string } | undefined)?.session_id;
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
    // Password accepted; the session stays aal1 (requireAdmin refuses it) until the code is verified.
    if (sid) await recordAdminSession(sid, profile.id, ip, (await headers()).get("user-agent") ?? "tidak diketahui");
    return { status: "needs_2fa" };
  }
  await resetRateLimit(key);
  await finishLogin(profile, sid, ip);
  return { status: "ok" };
}

/**
 * Step 2: a 6-digit TOTP code (Supabase MFA, upgrades the session to aal2) or a one-time backup code.
 * Supabase cannot raise a session to aal2 with anything but a factor, so a backup code works as recovery instead:
 * it signs the admin in at aal1 and REMOVES the TOTP factor, which sends them through /admin/setup-2fa to enrol again.
 */
export async function adminVerify2fa(input: unknown): Promise<AdminLoginResult> {
  const parsed = codeSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Kode tidak valid." };
  const who = await loadIdentity();
  if (!who || who.profileRole !== "admin" || who.status !== "aktif") return { status: "error", message: "Sesi verifikasi berakhir. Masuk ulang." };

  const ip = await getClientIp();
  const key = `admin-2fa:${ip}:${who.id}`;
  const limit = await hitRateLimit(key, LOGIN_LIMIT.limit, LOGIN_LIMIT.windowSeconds);
  if (!limit.allowed) return { status: "error", message: `Terlalu banyak percobaan. Coba lagi dalam ${minutes(limit.retryAfterSeconds)} menit.` };

  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const totp = factors?.totp?.[0];

  if (BACKUP_CODE_RE.test(parsed.data.code)) {
    // Nothing is consumed or removed until the admin has confirmed what a backup code does.
    if (!parsed.data.confirmBackup) return { status: "confirm_backup", message: BACKUP_CONFIRM_MESSAGE };
    if (!(await consumeBackupCode(who.id, parsed.data.code))) return { status: "error", message: WRONG_CODE };
    for (const f of factors?.all ?? []) await supabaseAdmin().auth.admin.mfa.deleteFactor({ id: f.id, userId: who.id });
    await clearBackupCodes(who.id);
    await resetRateLimit(key);
    await logAdminAction({ adminId: who.id, adminName: who.username, action: "auth.2fa_backup_used", targetType: "admin", targetId: who.id, before: { enabled: true }, after: { enabled: false } });
    await finishLogin(who, who.sid, ip);
    // Removing the factor also ends this session on the Auth side: say so, and send the admin back to the password step.
    await supabase.auth.signOut({ scope: "local" });
    return { status: "ok", message: "Kode cadangan dipakai dan verifikasi dua langkah dinonaktifkan. Masuk lagi dengan password, lalu atur ulang aplikasi autentikator (pindai kode QR baru) dan simpan kode cadangan yang baru." };
  }

  if (!totp) return { status: "error", message: "Verifikasi dua langkah belum diatur untuk akun ini." };
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: totp.id, code: parsed.data.code });
  if (error) return { status: "error", message: WRONG_CODE };
  await resetRateLimit(key);
  await finishLogin(who, who.sid, ip);
  return { status: "ok" };
}

export async function adminLogout(): Promise<void> {
  const who = await loadIdentity();
  if (who?.sid) await revokeAdminSession(who.sid, who.id);
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  if (who?.profileRole === "admin") {
    await logAdminAction({ adminId: who.id, adminName: who.username, action: "auth.logout", targetType: "admin", targetId: who.id, before: null, after: null });
  }
}
