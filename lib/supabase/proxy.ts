import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";
import { supabaseAnonKey, supabaseUrl } from "./env";
import { authCookieOptions, lifetimeFor, REMEMBER_COOKIE } from "./remember";

/**
 * Refreshes the Supabase session on every matched request (rotates the cookies) and returns the verified JWT claims.
 * getClaims() verifies the token signature, so `claims` can be trusted for COARSE gating here (signed in? aal2?).
 * Role checks never use claims: they read the profiles table (requireAdmin in lib/auth-server.ts).
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const remember = request.cookies.get(REMEMBER_COOKIE)?.value === "1";
  const supabase = createServerClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    cookieOptions: authCookieOptions(remember),
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list) {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, lifetimeFor(options, remember));
      },
    },
  });
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;
  return {
    claims: claims ? { sub: String(claims.sub), aal: (claims as { aal?: string }).aal ?? "aal1" } : null,
    response: () => response,
    /** A redirect that keeps the refreshed session cookies. */
    redirect(url: URL) {
      const r = NextResponse.redirect(url);
      for (const c of response.cookies.getAll()) r.cookies.set(c);
      return r;
    },
  };
}
