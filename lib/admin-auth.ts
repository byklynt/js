"use server";

import { cookies, headers } from "next/headers";
import { z } from "zod";
import { PENDING_2FA_COOKIE, SESSION_COOKIE, sessionCookieOptions, signToken, verifyToken } from "@/lib/session";
import { checkRateLimit, recordFailure, resetFailures } from "@/lib/rate-limit";
import { findAdminByIdentifier, findAdminById } from "@/lib/admin-db";
import { verifyAdminPassword } from "@/lib/admin-password";
import { logAdminAction } from "@/lib/admin-audit";
import { getSession } from "@/lib/auth-server";
import { getDb } from "@/lib/admin-db";
import { ipAllowed } from "@/lib/server/access";
import { sendAlert } from "@/lib/server/notify";
import { getEncKey } from "@/lib/server/crypto-at-rest";
import { persistAdminState } from "@/lib/server/store";
import { debug2fa, isDev } from "@/lib/server/debug2fa";
import { checkCode, userMessage, type CodeResult, type Diag } from "@/lib/server/twofactor";

export type AdminLoginResult =
  | { status: "ok" }
  | { status: "needs_2fa" }
  | { status: "error"; message: string };

const GENERIC_ERROR = "Username atau password salah";
const NO_DIAG: Diag = { via: "totp", nowStep: 0, window: [0, 0], matchedStep: null, lastUsedStep: null, decrypt: "n/a", fingerprint: null };
const SESSION_SECONDS = 8 * 60 * 60;
const PENDING_SECONDS = 5 * 60;

const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Username atau email wajib diisi.").max(120),
  password: z.string().min(1, "Password wajib diisi.").max(200),
});

const codeSchema = z.object({ code: z.string().trim().regex(/^(\d{6}|[a-z0-9]{4}-[a-z0-9]{4})$/i, "Masukkan 6 digit kode atau kode cadangan.") });

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "127.0.0.1";
}

async function startSession(admin: { id: string; username: string; email: string }) {
  const db = getDb();
  const h = await headers();
  const ip = await clientIp();
  const sid = `ses_${crypto.randomUUID()}`;
  const nowIso = new Date().toISOString();
  db.sessions.unshift({ id: sid, adminId: admin.id, ip, userAgent: (h.get("user-agent") ?? "tidak diketahui").slice(0, 160), createdAt: nowIso, lastSeenAt: nowIso, revokedAt: null });
  persistAdminState(db);
  sendAlert(db, "new_admin_login", `Login admin baru: ${admin.username} dari ${ip}.`);
  const token = await signToken({
    sid,
    sub: admin.id,
    username: admin.username,
    email: admin.email,
    role: "admin",
    kind: "session",
    exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, sessionCookieOptions(SESSION_SECONDS));
  jar.delete(PENDING_2FA_COOKIE);
  logAdminAction({
    adminId: admin.id,
    adminName: admin.username,
    action: "auth.login",
    targetType: "admin",
    targetId: admin.id,
    before: null,
    after: { at: new Date().toISOString() },
  });
}

/** Step 1: username/email + password. Never reveals which part was wrong. */
export async function adminLogin(input: unknown): Promise<AdminLoginResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? GENERIC_ERROR };
  }
  const { identifier, password } = parsed.data;
  if (!ipAllowed(getDb().settings.security.ipAllowlist, await clientIp())) {
    return { status: "error", message: "Akses dari alamat IP ini tidak diizinkan." };
  }
  const key = `${await clientIp()}:${identifier.toLowerCase()}`;

  const limit = checkRateLimit(key);
  if (!limit.allowed) {
    return { status: "error", message: `Terlalu banyak percobaan. Coba lagi dalam ${limit.retryAfterMinutes} menit.` };
  }

  const admin = findAdminByIdentifier(identifier);
  const valid = verifyAdminPassword(admin?.id ?? null, password);
  if (!admin || !valid) {
    recordFailure(key);
    return { status: "error", message: GENERIC_ERROR };
  }

  if (getDb().adminSecurity[admin.id]?.enabled) {
    const token = await signToken({
      sub: admin.id,
      username: admin.username,
      email: admin.email,
      role: "admin",
      kind: "pending2fa",
      exp: Math.floor(Date.now() / 1000) + PENDING_SECONDS,
    });
    (await cookies()).set(PENDING_2FA_COOKIE, token, sessionCookieOptions(PENDING_SECONDS, "/admin"));
    return { status: "needs_2fa" };
  }

  resetFailures(key);
  await startSession(admin);
  return { status: "ok" };
}

/** Step 2 (accounts with 2FA): a 6-digit TOTP code from the authenticator app, or a one-time backup code. */
export async function adminVerify2fa(input: unknown): Promise<AdminLoginResult> {
  const parsed = codeSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Kode tidak valid." };
  }
  const pending = await verifyToken((await cookies()).get(PENDING_2FA_COOKIE)?.value);
  if (!pending || pending.kind !== "pending2fa" || pending.role !== "admin") {
    return { status: "error", message: "Sesi verifikasi berakhir. Masuk ulang." };
  }
  const key = `${await clientIp()}:2fa:${pending.sub}`;
  const limit = checkRateLimit(key);
  if (!limit.allowed) {
    return { status: "error", message: `Terlalu banyak percobaan. Coba lagi dalam ${limit.retryAfterMinutes} menit.` };
  }
  const admin = findAdminById(pending.sub);
  const db = getDb();
  // Replay-safe: a TOTP step that was already accepted is rejected; a backup code is consumed.
  if (!admin) {
    recordFailure(key);
    return { status: "error", message: userMessage("wrong_code", NO_DIAG, false) };
  }
  let check: CodeResult;
  try {
    check = checkCode(db, pending.sub, parsed.data.code, getEncKey());
  } catch (e) {
    // getEncKey() throws when ADMIN_2FA_ENC_KEY is missing: say so loudly in development.
    console.error("[2fa] ", e instanceof Error ? e.message : e);
    return { status: "error", message: isDev() ? `[dev] ${e instanceof Error ? e.message : "Konfigurasi 2FA tidak valid."}` : userMessage("wrong_code", NO_DIAG, false) };
  }
  debug2fa("login", { admin: pending.sub, ok: check.ok, reason: check.ok ? null : check.reason, ...check.diag });
  if (!check.ok) {
    if (check.reason === "decrypt_error") console.error(`[2fa] Dekripsi rahasia gagal untuk ${pending.sub}. ADMIN_2FA_ENC_KEY berubah?`);
    recordFailure(key);
    return { status: "error", message: userMessage(check.reason, check.diag, isDev()) };
  }
  persistAdminState(db);
  resetFailures(key);
  await startSession(admin);
  return { status: "ok" };
}

export async function adminLogout(): Promise<void> {
  const session = await getSession();
  if (session?.sid) {
    const record = getDb().sessions.find((s) => s.id === session.sid);
    if (record) record.revokedAt = new Date().toISOString();
    persistAdminState(getDb());
  }
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(PENDING_2FA_COOKIE);
  if (session?.role === "admin") {
    logAdminAction({
      adminId: session.sub,
      adminName: session.username,
      action: "auth.logout",
      targetType: "admin",
      targetId: session.sub,
      before: null,
      after: null,
    });
  }
}
