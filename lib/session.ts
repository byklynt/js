/**
 * Session shape used by the app. Sessions themselves are Supabase Auth cookies (lib/supabase/*).
 * This payload is BUILT on the server from supabase.auth.getUser() + the profiles row; nothing here is signed or
 * accepted from the client. The role always comes from the profiles table.
 */
export type Role = "user" | "admin";

export type SessionPayload = {
  /** Supabase auth user id (= profiles.id). */
  sub: string;
  username: string;
  email: string;
  role: Role;
  kind: "session";
  /** Supabase session id (JWT `session_id`): lets an admin revoke a panel session on the server. */
  sid?: string;
  /** Authenticator assurance level of this session ("aal2" = MFA verified). */
  aal: "aal1" | "aal2";
};
