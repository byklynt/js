import { brand } from "@/lib/brand";
import { getPosts } from "@/lib/blog";
import { LEGAL_PATHS } from "@/lib/legal-content";
import type { MetadataRoute } from "next";

/** Public pages only. /admin/* and /dashboard/* are intentionally excluded. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = brand.domain;
  const paths = ["/", "/services", "/blog", "/login", "/signup", ...Object.values(LEGAL_PATHS), "/status", ...getPosts().map((p) => `/blog/${p.slug}`)];
  return paths.map((path) => ({ url: `${base}${path}` }));
}
