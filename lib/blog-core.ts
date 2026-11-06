/** Blog helpers shared by the admin editor, the server actions and the public pages. Pure functions, no I/O. */

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_SLUG = 100;
export const SEO_TITLE_MAX = 60;
export const SEO_DESCRIPTION_MAX = 160;

/** "Panduan Order Followers Instagram!" -> "panduan-order-followers-instagram" (accents dropped, a-z 0-9 and single dashes, at most 100 characters). */
export function slugify(text: string): string {
  return String(text ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " dan ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG)
    .replace(/-+$/g, "");
}

export const isValidSlug = (slug: string) => slug.length > 0 && slug.length <= MAX_SLUG && SLUG_RE.test(slug);

/** The slug itself, or slug-2, slug-3 ... the first one that is not taken. */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  const root = slugify(base) || "artikel";
  if (!taken.has(root)) return root;
  for (let i = 2; i < 10_000; i++) {
    const suffix = `-${i}`;
    const candidate = `${root.slice(0, MAX_SLUG - suffix.length).replace(/-+$/g, "")}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${root.slice(0, 80)}-${Date.now()}`;
}

export type BlogStatus = "draf" | "terbit" | "terjadwal";

/** What the admin sees: a published post with a date in the future is "Terjadwal" (it turns visible by itself at that time). */
export function postStatus(p: { status: string; publishedAt: string | null }, now = new Date()): BlogStatus {
  if (p.status !== "terbit" || !p.publishedAt) return "draf";
  return new Date(p.publishedAt).getTime() > now.getTime() ? "terjadwal" : "terbit";
}

/** Visible to the public right now. Mirrors public.blog_post_is_public in the database. */
export const isPublic = (p: { status: string; publishedAt: string | null }, now = new Date()) => postStatus(p, now) === "terbit";

export const STATUS_LABEL: Record<BlogStatus, string> = { draf: "Draf", terbit: "Terbit", terjadwal: "Terjadwal" };

/** Markdown to plain text (for descriptions, reading time, search). */
export function plainText(md: string): string {
  return String(md ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/^[#>\-*\d.\s]+/gm, "")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Whole minutes at about 200 words a minute, at least 1. */
export function readingMinutes(md: string): number {
  const words = plainText(md).split(" ").filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);

/** SEO title / description with the fallbacks the page uses: seo fields, else title / excerpt, else the start of the article. */
export function seoOf(p: { title: string; excerpt: string; contentMd: string; seoTitle: string; seoDescription: string }) {
  return {
    title: clip(p.seoTitle.trim() || p.title.trim(), 70),
    description: clip(p.seoDescription.trim() || p.excerpt.trim() || plainText(p.contentMd), SEO_DESCRIPTION_MAX),
  };
}

/** Tags typed as "a, b, c" -> unique { name, slug } pairs (at most 10). */
export function parseTags(input: string): { name: string; slug: string }[] {
  const seen = new Set<string>();
  const out: { name: string; slug: string }[] = [];
  for (const raw of String(input ?? "").split(/[,\n]/)) {
    const name = raw.trim().slice(0, 40);
    const slug = slugify(name).slice(0, 60);
    if (!name || !slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push({ name, slug });
    if (out.length >= 10) break;
  }
  return out;
}

export const BLOG_TAG = "blog";
export const BLOG_PAGE_SIZE = 9;
