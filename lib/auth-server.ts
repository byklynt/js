import "server-only";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { SESSION_COOKIE, verifyToken, type SessionPayload } from "@/lib/session";
import { getDb } from "@/lib/admin-db";
import { ipAllowed, isSessionActive, twoFactorGate } from "@/lib/server/access";

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

/**
 * Reads and verifies the session cookie. Returns null when missing, invalid, expired, or (for admins)
 * revoked on the server. TODO: user sessions need the same server-side revocation once real auth exists.
 */
export async function getSession(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await verifyToken(token);
  if (session?.kind !== "session") return null;
  if (session.role === "admin") {
    const record = getDb().sessions.find((s) => s.id === session.sid);
    if (!isSessionActive(record)) return null;
    const now = Date.now();
    if (record && now - new Date(record.lastSeenAt).getTime() > 60_000) record.lastSeenAt = new Date(now).toISOString();
  }
  return session;
}

/**
 * Guard for admin pages, layouts, server actions, and route handlers. Do not rely on proxy.ts alone:
 * every admin entry point calls this itself. It checks, in order: valid server-side session, IP allowlist,
 * and the 2FA gate (admins without 2FA can only reach the setup page and its actions: `skipGate`).
 *
 * - mode "page" (default): redirects (/admin/login when signed out, /dashboard for non-admins, setup page for 2FA)
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
  if (!opts.skipGate && twoFactorGate(db.settings.security.requireAdmin2fa, db.adminSecurity[session.sub]) === "setup_required") {
    if (mode === "action") throw new UnauthorizedError("TWO_FACTOR_REQUIRED");
    redirect("/admin/setup-2fa");
  }
  return session;
}
