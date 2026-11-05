import "server-only";
import { headers } from "next/headers";

/** Public origin for e-mail links and OAuth redirects. NEXT_PUBLIC_SITE_URL wins; otherwise the request's own origin. */
export async function siteUrl(): Promise<string> {
  const fixed = process.env.NEXT_PUBLIC_SITE_URL;
  if (fixed) return fixed.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
