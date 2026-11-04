/**
 * Signed session cookies (HMAC-SHA256 via Web Crypto, so it works in proxy.ts and server code).
 * TODO: swap for the real auth/session provider (e.g. Supabase / iron-session). The role MUST come
 * from a server-side source of truth (a `profiles` table + RLS), never from anything the client sends.
 */
export const SESSION_COOKIE = "sg_session";
/** Separate cookie for regular users, so an admin can browse the user site in the same browser. */
export const USER_COOKIE = "sg_user";
export const PENDING_2FA_COOKIE = "sg_2fa_pending";

export type Role = "user" | "admin";

export type SessionPayload = {
  sub: string;
  username: string;
  email: string;
  role: Role;
  /** "pending2fa" tokens are only valid for the second login step. */
  kind: "session" | "pending2fa";
  /** Expiry, seconds since epoch. */
  exp: number;
  /** Admin session ID: lets an admin revoke a session from the server side. */
  sid?: string;
};

const encoder = new TextEncoder();

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET wajib diatur di production.");
  }
  // Development fallback only. Never used in production (the branch above throws).
  return "dev-only-insecure-secret-change-me";
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function sign(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return toBase64Url(new Uint8Array(signature));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signToken(payload: SessionPayload): Promise<string> {
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  return `${body}.${await sign(body)}`;
}

export async function verifyToken(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  try {
    if (!safeEqual(signature, await sign(body))) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (payload.role !== "user" && payload.role !== "admin") return null;
    return payload;
  } catch {
    return null;
  }
}

export function sessionCookieOptions(maxAgeSeconds: number, path = "/") {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path,
    maxAge: maxAgeSeconds,
  };
}
