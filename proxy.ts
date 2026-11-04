import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifyToken } from "@/lib/session";

/**
 * Next.js 16 renamed `middleware.ts` to `proxy.ts` (same behaviour).
 * Gate for /admin/*: signed-out -> /admin/login, signed-in non-admin -> /dashboard.
 * This is only the first line of defence: every admin page, server action, and route handler
 * calls requireAdmin() itself.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await verifyToken(request.cookies.get(SESSION_COOKIE)?.value);
  const isLogin = pathname === "/admin/login" || pathname.startsWith("/admin/login/");

  let response: NextResponse;
  if (isLogin) {
    // The login page itself redirects admins that have a valid (not revoked) server-side session.
    response = NextResponse.next();
  } else if (!session || session.kind !== "session") {
    response = NextResponse.redirect(new URL("/admin/login", request.url));
  } else if (session.role !== "admin") {
    response = NextResponse.redirect(new URL("/dashboard", request.url));
  } else {
    response = NextResponse.next();
  }

  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
