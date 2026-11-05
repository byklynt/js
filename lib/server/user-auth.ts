import "server-only";
import { createClient as createStateless } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

/** Rules shared with the sign-up form (the database enforces the same username pattern). */
export const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const MIN_PASSWORD = 8;

/** Never-registered address used to spend the same Auth round trip for an unknown username. */
const DUMMY_EMAIL = "no-such-user@jagoansosmed-login.invalid";

/**
 * Username or e-mail -> the e-mail Supabase Auth signs in with. An unknown username resolves to a dummy address, so the
 * caller does the same work and returns the same generic error either way: the existence of a username never leaks.
 */
export async function resolveLoginEmail(identifier: string): Promise<string> {
  const id = identifier.trim();
  if (id.includes("@")) return id.toLowerCase();
  const { data } = await supabaseAdmin().from("profiles").select("email").eq("username", id).maybeSingle();
  return data?.email ?? DUMMY_EMAIL;
}

/** Checks a password WITHOUT touching the caller's session cookies (stateless client). Used for re-authentication. */
export async function verifyPasswordFor(email: string, password: string): Promise<boolean> {
  const client = createStateless(supabaseUrl(), supabaseAnonKey(), { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) return false;
  // scope "local": only this throw-away client session ends. The default (global) would revoke EVERY session of the user, including the one in use.
  await client.auth.signOut({ scope: "local" }).catch(() => undefined);
  return true;
}
