import { brand } from "@/lib/brand";
import { LEGAL_PATHS } from "@/lib/legal-content";
import { listPublicSlugs } from "@/lib/server/blog";
import type { MetadataRoute } from "next";

/** Public pages only (/admin/* and /dashboard/* are intentionally excluded) plus every PUBLISHED blog post. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = brand.domain;
  const paths = ["/", "/services", "/blog", "/login", "/signup", ...Object.values(LEGAL_PATHS)];
  const posts = await listPublicSlugs().catch(() => []);
  return [
    ...paths.map((path) => ({ url: `${base}${path}` })),
    ...posts.map((p) => ({ url: `${base}/blog/${p.slug}`, lastModified: new Date(p.updatedAt) })),
  ];
}
