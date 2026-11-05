"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getClientIp, loadIdentity } from "@/lib/auth-server";
import { features } from "@/lib/features";
import { hitRateLimit, LOGIN_LIMIT, minutes, resetRateLimit } from "@/lib/rate-limit";
import { siteUrl } from "@/lib/site-url";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { LEGAL_VERSION } from "@/lib/legal-content";
import { resolveLoginEmail } from "@/lib/server/user-auth";
import { createClient } from "@/lib/supabase/server";
import { REMEMBER_COOKIE, REMEMBER_MAX_AGE } from "@/lib/supabase/remember";
import { cookies } from "next/headers";

export type AuthResult = { success: true; message?: string } | { success: false; message: string };

export type LoginPayload = { username: string; password: string; rememberMe: boolean };
export type RegisterPayload = { username: string; email: string; password: string };
export type CurrentUser = { id: string; username: string; email: string };

const GENERIC = "Username atau password salah.";
const SERVER_ERROR = "Terjadi kesalahan di server. Coba lagi.";

const loginSchema = z.object({ username: z.string().trim().min(1).max(120), password: z.string().min(1).max(200), rememberMe: z.boolean().optional() });
const registerSchema = z.object({
  username: z.string().trim().regex(/^[A-Za-z0-9_]{3,20}$/, "Username 3-20 karakter: huruf, angka, atau garis bawah."),
  email: z.string().trim().email("Format email tidak valid.").max(160),
  password: z.string().min(8, "Password minimal 8 karakter.").max(200),
});

export async function register(payload: RegisterPayload): Promise<AuthResult> {
  const parsed = registerSchema.safeParse(payload);
  if (!parsed.success) return { success: false, message: parsed.error.issues[0]?.message ?? "Data pendaftaran tidak valid." };
  const { username, email, password } = parsed.data;
  const limit = await hitRateLimit(`signup:${await getClientIp()}`, 10, 60 * 60);
  if (!limit.allowed) return { success: false, message: "Terlalu banyak pendaftaran dari jaringan ini. Coba lagi nanti." };

  const taken = await supabaseAdmin().from("profiles").select("id").eq("username", username).maybeSingle();
  if (taken.data) return { success: false, message: "Username sudah dipakai." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username }, emailRedirectTo: `${await siteUrl()}/auth/callback?next=/dashboard` },
  });
  if (error) {
    if (error.code === "user_already_exists" || error.code === "email_exists") return { success: false, message: "Email sudah terdaftar." };
    if (error.code === "weak_password") return { success: false, message: "Password minimal 8 karakter." };
    if (error.code === "over_email_send_rate_limit") return { success: false, message: "Terlalu banyak email terkirim. Coba lagi nanti." };
    // The profile trigger rejected the username (a race with another sign-up) or Auth failed.
    return { success: false, message: /database error/i.test(error.message) ? "Username sudah dipakai." : SERVER_ERROR };
  }
  // Implied acceptance: remember which legal version was shown at signup (server-side; users cannot write these columns). A failure here must not fail the signup.
  if (data.user) {
    const { error: acceptError } = await supabaseAdmin().from("profiles").update({ terms_version: LEGAL_VERSION, terms_accepted_at: new Date().toISOString() }).eq("id", data.user.id);
    if (acceptError) console.error("[signup] could not store legal acceptance:", acceptError.message);
  }
  // With "Confirm email" switched on there is no session until the link is opened.
  if (!data.session) return { success: true, message: "Pendaftaran berhasil. Cek emailmu untuk konfirmasi, lalu masuk." };
  return { success: true };
}

export async function login(payload: LoginPayload): Promise<AuthResult> {
  const parsed = loginSchema.safeParse(payload);
  if (!parsed.success) return { success: false, message: GENERIC };
  const { username, password, rememberMe } = parsed.data;
  const key = `login:${await getClientIp()}:${username.toLowerCase()}`;
  const limit = await hitRateLimit(key, LOGIN_LIMIT.limit, LOGIN_LIMIT.windowSeconds);
  if (!limit.allowed) return { success: false, message: `Terlalu banyak percobaan. Coba lagi dalam ${minutes(limit.retryAfterSeconds)} menit.` };

  const email = await resolveLoginEmail(username);
  // "Ingat saya": persistent (30 day) session cookies when ticked, browser-session cookies otherwise (see lib/supabase/remember.ts).
  const supabase = await createClient({ remember: Boolean(rememberMe) });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    if (error?.code === "email_not_confirmed") return { success: false, message: "Email belum dikonfirmasi. Buka link konfirmasi di emailmu." };
    return { success: false, message: GENERIC };
  }
  const { data: profile } = await supabaseAdmin().from("profiles").select("status").eq("id", data.user.id).maybeSingle();
  if (!profile || profile.status !== "aktif") {
    await supabase.auth.signOut({ scope: "local" });
    return { success: false, message: "Akunmu sedang diblokir. Hubungi support." };
  }
  await resetRateLimit(key);
  (await cookies()).set(REMEMBER_COOKIE, rememberMe ? "1" : "0", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", ...(rememberMe ? { maxAge: REMEMBER_MAX_AGE } : {}) });
  await supabaseAdmin().from("profiles").update({ last_login_at: new Date().toISOString() }).eq("id", data.user.id);
  return { success: true };
}

/** Google sign-in via Supabase OAuth. Stays behind features.googleLogin until the Google provider is enabled in the dashboard. */
export async function loginWithGoogle(): Promise<AuthResult> {
  if (!features.googleLogin) return { success: false, message: "Masuk dengan Google belum tersedia." };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${await siteUrl()}/auth/callback?next=/dashboard` },
  });
  if (error || !data.url) return { success: false, message: "Masuk dengan Google gagal. Coba lagi." };
  redirect(data.url);
}

export async function logout(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  (await cookies()).delete(REMEMBER_COOKIE);
}

/** Password reset: always answers the same, whether or not the e-mail is registered. */
export async function requestPasswordReset(email: string): Promise<AuthResult> {
  const parsed = z.string().trim().email().max(160).safeParse(email);
  const done: AuthResult = { success: true, message: "Jika email terdaftar, link untuk mengatur ulang password sudah dikirim." };
  if (!parsed.success) return { success: false, message: "Format email tidak valid." };
  const limit = await hitRateLimit(`reset:${await getClientIp()}`, 5, 60 * 60);
  if (!limit.allowed) return { success: false, message: "Terlalu banyak permintaan. Coba lagi nanti." };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data, { redirectTo: `${await siteUrl()}/auth/callback?next=/reset-password` });
  return done;
}

/** Sets a new password for the user who opened the recovery link (the callback route created their session). */
export async function updatePassword(password: string): Promise<AuthResult> {
  if (typeof password !== "string" || password.length < 8 || password.length > 200) return { success: false, message: "Password minimal 8 karakter." };
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { success: false, message: "Link sudah kedaluwarsa. Minta link baru." };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { success: false, message: error.code === "same_password" ? "Password baru harus berbeda dari yang lama." : "Password tidak bisa diubah. Coba lagi." };
  return { success: true, message: "Password diperbarui." };
}

/** The signed-in user (validated by the Auth server). Null when signed out, blocked or deleted. Cached per request (loadIdentity). */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const who = await loadIdentity();
  if (!who || who.status !== "aktif") return null;
  return { id: who.id, username: who.username, email: who.email };
}
