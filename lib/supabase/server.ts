import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import type { Database } from "./database.types";
import { supabaseAnonKey, supabaseUrl } from "./env";
import { authCookieOptions, lifetimeFor, REMEMBER_COOKIE } from "./remember";

/**
 * Cookie-based client for server components, server actions and route handlers. It acts AS THE SIGNED-IN USER
 * (RLS applies). Use supabase.auth.getUser() (validated by the Auth server), never getSession(), to decide who someone is.
 */
export async function createClient(opts: { remember?: boolean } = {}) {
  // Supabase Auth reads the clock (Date.now). With Cache Components that is only allowed once the render is truly per-request.
  await connection();
  const cookieStore = await cookies();
  const remember = opts.remember ?? cookieStore.get(REMEMBER_COOKIE)?.value === "1";
  return createServerClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    cookieOptions: authCookieOptions(remember),
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(list) {
        try {
          for (const { name, value, options } of list) cookieStore.set(name, value, lifetimeFor(options, remember));
        } catch {
          // Called from a Server Component, which cannot set cookies. The proxy refreshes the session instead.
        }
      },
    },
  });
}
