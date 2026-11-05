import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Service-role client: bypasses RLS. Server code ONLY (this file imports "server-only", so a client import fails the build).
 * Every money movement calls a SECURITY DEFINER Postgres function through this client. Never return its rows unfiltered
 * to a user, and never put SUPABASE_SERVICE_ROLE_KEY in a NEXT_PUBLIC_* variable.
 */
let admin: ReturnType<typeof createClient<Database>> | undefined;

export function supabaseAdmin() {
  if (admin) return admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY harus diatur di server.");
  admin = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}
