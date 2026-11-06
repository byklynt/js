import { NextResponse, type NextRequest } from "next/server";
import { isValidSlug } from "@/lib/blog-core";
import { updateSession } from "@/lib/supabase/proxy";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

/**
 * A blog article that is not public (unknown slug, draft, or a post whose time has not come) must answer a REAL 404. Inside the page that is not
 * possible: the route streams from a prerendered shell, so by the time the page could call notFound() the status is already 200. The anon key plus
 * RLS answer "is this post visible?" here, before anything renders; a miss is rewritten to a path that does not exist, which Next serves as its 404.
 */
async function blogPostIsPublic(slug: string): Promise<boolean> {
  try {
    const res = await fetch(`${supabaseUrl()}/rest/v1/blog_posts?select=id&slug=eq.${encodeURIComponent(slug)}&limit=1`, {
      headers: { apikey: supabaseAnonKey(), Authorization: `Bearer ${supabaseAnonKey()}` },
      cache: "no-store",
    });
    if (!res.ok) return true; // the database is unreachable: let the page decide instead of hiding real posts
    return ((await res.json()) as unknown[]).length > 0;
  } catch {
    return true;
  }
}

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
  const article = /^\/blog\/([^/]+)$/.exec(pathname);
  if (article) {
    const slug = decodeURIComponent(article[1]);
    if (slug === "rss.xml") return NextResponse.next();
    if (!isValidSlug(slug) || !(await blogPostIsPublic(slug))) return NextResponse.rewrite(new URL("/blog/-/-/tidak-ditemukan", request.url));
    return NextResponse.next();
  }
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
  matcher: ["/admin/:path*", "/dashboard/:path*", "/dashboard", "/blog/:slug"],
};
