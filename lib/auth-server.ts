import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { SessionPayload } from "@/lib/session";
import { getDb } from "@/lib/admin-db";
import { ipAllowed } from "@/lib/server/access";
import { checkAdminSession } from "@/lib/server/admin-sessions";
import { createClient } from "@/lib/supabase/server";

/** Thrown by requireAdmin("action") so server actions can return a clean error. */
export class UnauthorizedError extends Error {
  constructor(message = "UNAUTHORIZED") {
    super(message);
  }
}

export async function getClientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "127.0.0.1";
}

export type Identity = {
  id: string;
  username: string;
  email: string;
  profileRole: "user" | "reseller" | "admin";
  status: "aktif" | "diblokir";
  /** Assurance level of THIS session, and whether the account has a verified factor (nextLevel aal2). */
  aal: "aal1" | "aal2";
  mfaEnrolled: boolean;
  sid?: string;
};

/**
 * Who is signed in, validated by the Auth server (getUser, NOT getSession) plus the profiles row (the only source of
 * the role). Cached per request. Null when signed out or the profile is gone.
 */
export const loadIdentity = cache(async (): Promise<Identity | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const { data: profile } = await supabase.from("profiles").select("id,username,email,role,status").eq("id", data.user.id).maybeSingle();
  if (!profile) return null;
  const [{ data: aal }, { data: claims }] = await Promise.all([supabase.auth.mfa.getAuthenticatorAssuranceLevel(), supabase.auth.getClaims()]);
  return {
    id: profile.id,
    username: profile.username,
    email: profile.email,
    profileRole: profile.role as Identity["profileRole"],
    status: profile.status as Identity["status"],
    aal: aal?.currentLevel === "aal2" ? "aal2" : "aal1",
    mfaEnrolled: aal?.nextLevel === "aal2",
    sid: (claims?.claims as { session_id?: string } | undefined)?.session_id,
  };
});

/**
 * The signed-in session as the app uses it. Blocked accounts get no session (and are signed out of Supabase on the next
 * action that can write cookies). Admin sessions must also still be active in admin_sessions (revocable).
 */
export async function getSession(): Promise<SessionPayload | null> {
  const who = await loadIdentity();
  if (!who || who.status !== "aktif") return null;
  const role = who.profileRole === "admin" ? "admin" : "user";
  if (role === "admin" && !(await checkAdminSession(who.sid, who.id))) return null;
  return { sub: who.id, username: who.username, email: who.email, role, kind: "session", sid: who.sid, aal: who.aal };
}

/**
 * Guard for admin pages, layouts, server actions, and route handlers. Do not rely on proxy.ts alone:
 * every admin entry point calls this itself. It checks, in order: valid session + admin role from the profiles table,
 * IP allowlist, MFA (AAL2 once a factor is enrolled), and the 2FA gate (admins without 2FA can only reach the setup
 * page and its actions: `skipGate`).
 *
 * - mode "page" (default): redirects (/admin/login when signed out or MFA is pending, /dashboard for non-admins, setup page for 2FA)
 * - mode "action": throws UnauthorizedError so callers can return `{ ok: false }`
 */
export async function requireAdmin(mode: "page" | "action" = "page", opts: { skipGate?: boolean } = {}): Promise<SessionPayload> {
  const session = await getSession();
  if (session?.role !== "admin") {
    if (mode === "action") throw new UnauthorizedError();
    redirect(session ? "/dashboard" : "/admin/login");
  }
  const db = getDb();
  if (!ipAllowed(db.settings.security.ipAllowlist, await getClientIp())) {
    if (mode === "action") throw new UnauthorizedError("IP_BLOCKED");
    notFound();
  }
  const who = (await loadIdentity())!;
  // A password-only (aal1) session of an account that has 2FA is NOT an admin session: it must finish the second step.
  if (who.mfaEnrolled && session.aal !== "aal2") {
    if (mode === "action") throw new UnauthorizedError("MFA_REQUIRED");
    redirect("/admin/login");
  }
  if (!opts.skipGate && !who.mfaEnrolled && db.settings.security.requireAdmin2fa) {
    if (mode === "action") throw new UnauthorizedError("TWO_FACTOR_REQUIRED");
    redirect("/admin/setup-2fa");
  }
  return session;
}
