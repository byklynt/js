import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

/**
 * Next.js 16 renamed `middleware.ts` to `proxy.ts` (same behaviour).
 * It refreshes the Supabase session and does COARSE gating only:
 *  - /dashboard/*: not signed in -> /login
 *  - /admin/*: not signed in -> /admin/login (the login page itself stays open)
 * Role and AAL2 (MFA) are enforced by requireAdmin() in the admin layout, every admin page, server action and route
 * handler: it reads the profiles table, which a JWT claim cannot replace. Maintenance mode is applied by MaintenanceGate.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await updateSession(request);
  const signedIn = Boolean(session.claims);

  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
    const res = signedIn ? session.response() : session.redirect(new URL("/login", request.url));
    res.headers.set("Cache-Control", "no-store");
    return res;
  }

  const isLogin = pathname === "/admin/login" || pathname.startsWith("/admin/login/");
  const res = isLogin || signedIn ? session.response() : session.redirect(new URL("/admin/login", request.url));
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export const config = {
  matcher: ["/admin/:path*", "/dashboard/:path*", "/dashboard"],
};
