import "server-only";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/** Blog posts live in /content/blog/<slug>.md with frontmatter: title, date (YYYY-MM-DD), excerpt. */
const DIR = join(process.cwd(), "content", "blog");
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type PostMeta = { slug: string; title: string; date: string; excerpt: string };
export type Post = PostMeta & { body: string };

function parse(slug: string, raw: string): Post | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!m) return null;
  const meta: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  if (!meta.title) return null;
  return { slug, title: meta.title, date: meta.date ?? "", excerpt: meta.excerpt ?? "", body: m[2].trim() };
}

export function getPost(slug: string): Post | null {
  if (!SLUG.test(slug)) return null; // also blocks path traversal
  const file = join(DIR, `${slug}.md`);
  if (!existsSync(file)) return null;
  return parse(slug, readFileSync(file, "utf8"));
}

export function getPosts(): PostMeta[] {
  if (!existsSync(DIR)) return [];
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.slice(0, -3))
    .filter((s) => SLUG.test(s))
    .map(getPost)
    .filter((p): p is Post => p !== null)
    .map((p): PostMeta => ({ slug: p.slug, title: p.title, date: p.date, excerpt: p.excerpt }))
    .sort((a, b) => b.date.localeCompare(a.date));
}
