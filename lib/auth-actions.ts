"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { getDb } from "@/lib/admin-db";
import { getClientIp } from "@/lib/auth-server";
import { checkRateLimit, recordFailure, resetFailures } from "@/lib/rate-limit";
import { sessionCookieOptions, signToken, USER_COOKIE, verifyToken } from "@/lib/session";
import { sharedLimiter } from "@/lib/server/limits";
import { persistAdminState } from "@/lib/server/store";
import { registerUser, verifyUserLogin } from "@/lib/server/user-auth";
import { loadCreds, saveCreds } from "@/lib/server/user-store";
import { ServiceError } from "@/lib/server/tx";

export type AuthResult = { success: true } | { success: false; message: string };

export type LoginPayload = { username: string; password: string; rememberMe: boolean };
export type RegisterPayload = { username: string; email: string; password: string };
export type CurrentUser = { id: string; username: string; email: string };

const GENERIC = "Username atau password salah.";
const DAY = 24 * 3600;

const loginSchema = z.object({ username: z.string().trim().min(1).max(120), password: z.string().min(1).max(200), rememberMe: z.boolean().optional() });
const registerSchema = z.object({ username: z.string().trim().min(1).max(40), email: z.string().trim().min(1).max(160), password: z.string().min(1).max(200) });

async function startUserSession(user: { id: string; username: string; email: string }, remember: boolean) {
  const seconds = (remember ? 30 : 1) * DAY;
  const token = await signToken({ sub: user.id, username: user.username, email: user.email, role: "user", kind: "session", exp: Math.floor(Date.now() / 1000) + seconds });
  (await cookies()).set(USER_COOKIE, token, sessionCookieOptions(seconds));
}

export async function register(payload: RegisterPayload): Promise<AuthResult> {
  const parsed = registerSchema.safeParse(payload);
  if (!parsed.success) return { success: false, message: "Data pendaftaran tidak valid." };
  const ip = await getClientIp();
  const limit = sharedLimiter.hit(`signup:${ip}`, 10, 60 * 60 * 1000, Date.now());
  if (!limit.allowed) return { success: false, message: "Terlalu banyak pendaftaran dari jaringan ini. Coba lagi nanti." };
  try {
    const db = getDb();
    const creds = loadCreds();
    const user = registerUser(db, creds, parsed.data);
    saveCreds(creds);
    persistAdminState(db);
    await startUserSession(user, false);
    return { success: true };
  } catch (e) {
    if (e instanceof ServiceError) return { success: false, message: e.message };
    return { success: false, message: "Terjadi kesalahan di server. Coba lagi." };
  }
}

export async function login(payload: LoginPayload): Promise<AuthResult> {
  const parsed = loginSchema.safeParse(payload);
  if (!parsed.success) return { success: false, message: GENERIC };
  const { username, password, rememberMe } = parsed.data;
  const key = `user:${await getClientIp()}:${username.toLowerCase()}`;
  const limit = checkRateLimit(key);
  if (!limit.allowed) return { success: false, message: `Terlalu banyak percobaan. Coba lagi dalam ${limit.retryAfterMinutes} menit.` };
  const user = verifyUserLogin(getDb(), loadCreds(), username, password);
  if (!user) {
    recordFailure(key);
    return { success: false, message: GENERIC };
  }
  if (user.status !== "aktif") return { success: false, message: "Akunmu sedang diblokir. Hubungi support." };
  resetFailures(key);
  await startUserSession(user, Boolean(rememberMe));
  return { success: true };
}

/** Google sign-in needs an OAuth app that is not configured yet. */
export async function loginWithGoogle(): Promise<AuthResult> {
  return { success: false, message: "Masuk dengan Google belum tersedia." };
}

export async function logout(): Promise<void> {
  (await cookies()).delete(USER_COOKIE);
}

/** The signed-in user, resolved from the signed cookie and the store. Null when signed out, blocked or deleted. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await verifyToken((await cookies()).get(USER_COOKIE)?.value);
  if (!session || session.kind !== "session" || session.role !== "user") return null;
  const user = getDb().users.find((u) => u.id === session.sub);
  if (!user || user.status !== "aktif") return null;
  return { id: user.id, username: user.username, email: user.email };
}
