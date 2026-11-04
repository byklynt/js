import { brand } from "@/lib/brand";
import type { MetadataRoute } from "next";

/** Public pages only. /admin/* and /dashboard/* are intentionally excluded. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = brand.domain;
  return ["/", "/login", "/signup", "/terms", "/refund-policy", "/status"].map((path) => ({ url: `${base}${path}` }));
}
