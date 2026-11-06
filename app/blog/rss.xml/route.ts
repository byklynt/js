import { seoOf } from "@/lib/blog-core";
import { brand } from "@/lib/brand";
import { listPublicPostsForFeed } from "@/lib/server/blog";

const ENTITIES: Record<string, string> = { "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" };
const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ENTITIES[c]);

/** RSS 2.0 of the newest public posts (drafts and future posts never appear: the list comes through the anon key and RLS). */
export async function GET() {
  const posts = await listPublicPostsForFeed(30);
  const items = posts
    .map((p) => {
      const url = `${brand.domain}/blog/${p.slug}`;
      const desc = seoOf({ title: p.title, excerpt: p.excerpt, contentMd: p.contentMd, seoTitle: "", seoDescription: "" }).description;
      return `<item><title>${esc(p.title)}</title><link>${esc(url)}</link><guid isPermaLink="true">${esc(url)}</guid><pubDate>${new Date(p.publishedAt).toUTCString()}</pubDate><description>${esc(desc)}</description>${p.category ? `<category>${esc(p.category.name)}</category>` : ""}</item>`;
    })
    .join("");
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>` +
    `<title>${esc(`Blog ${brand.name}`)}</title><link>${esc(`${brand.domain}/blog`)}</link><description>${esc("Artikel dan panduan dari JagoanSosmed.")}</description>` +
    `<language>id-ID</language><atom:link href="${esc(`${brand.domain}/blog/rss.xml`)}" rel="self" type="application/rss+xml"/>${items}</channel></rss>`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=300" } });
}
