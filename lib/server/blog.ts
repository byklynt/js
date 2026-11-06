import "server-only";
import { createClient } from "@supabase/supabase-js";
import { cacheLife, cacheTag } from "next/cache";
import { BLOG_PAGE_SIZE, BLOG_TAG } from "@/lib/blog-core";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

/**
 * Public blog reads. They go through the ANON key, so the database itself (RLS) decides what is visible: only posts with status "terbit" and
 * published_at <= now(), and only the categories / tags of such posts. A draft or a future post can never come out of here, whatever the code asks.
 * Results are cached for a minute and dropped at once when an admin changes a post (updateTag on BLOG_TAG): a scheduled post therefore appears
 * within a minute of its time, with no cron.
 */
const anon = () => createClient(supabaseUrl(), supabaseAnonKey(), { auth: { persistSession: false, autoRefreshToken: false } });

export type PublicPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  contentMd: string;
  coverImageUrl: string | null;
  coverAlt: string;
  category: { slug: string; name: string } | null;
  tags: { slug: string; name: string }[];
  publishedAt: string;
  updatedAt: string;
  seoTitle: string;
  seoDescription: string;
};
export type PostCard = Omit<PublicPost, "contentMd" | "tags" | "seoTitle" | "seoDescription" | "id" | "updatedAt">;

type Row = {
  id: string; slug: string; title: string; excerpt: string; content_md: string; cover_image_url: string | null; cover_alt: string;
  published_at: string | null; updated_at: string; seo_title: string; seo_description: string;
  category: { slug: string; name: string } | null;
  blog_post_tags?: { tag: { slug: string; name: string } | null }[];
};

const COLS = "id,slug,title,excerpt,content_md,cover_image_url,cover_alt,published_at,updated_at,seo_title,seo_description,category:blog_categories(slug,name)";

const COLS_INNER = COLS.replace("category:blog_categories(slug,name)", "category:blog_categories!inner(slug,name)");

const toPost = (r: Row): PublicPost => ({
  id: r.id, slug: r.slug, title: r.title, excerpt: r.excerpt, contentMd: r.content_md, coverImageUrl: r.cover_image_url, coverAlt: r.cover_alt,
  category: r.category, tags: (r.blog_post_tags ?? []).flatMap((t) => (t.tag ? [t.tag] : [])), publishedAt: r.published_at ?? "", updatedAt: r.updated_at,
  seoTitle: r.seo_title, seoDescription: r.seo_description,
});
const toCard = (r: Row): PostCard => ({
  slug: r.slug, title: r.title, excerpt: r.excerpt, coverImageUrl: r.cover_image_url, coverAlt: r.cover_alt, category: r.category, publishedAt: r.published_at ?? "",
});

/** Search text for a PostgREST filter: no characters that could change the filter itself. */
const cleanQuery = (q: string) => q.replace(/[%_,()*\\"'`]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);

export async function listPublicPosts(opts: { page?: number; category?: string; q?: string } = {}): Promise<{ posts: PostCard[]; total: number; page: number; pages: number }> {
  "use cache";
  cacheTag(BLOG_TAG);
  cacheLife({ stale: 30, revalidate: 60, expire: 3600 });
  const page = Math.max(1, Math.floor(opts.page ?? 1) || 1);
  const from = (page - 1) * BLOG_PAGE_SIZE;
  // a category filter needs an inner join so posts of other categories drop out
  let q = anon().from("blog_posts").select(opts.category ? COLS_INNER : COLS, { count: "exact" });
  if (opts.category) q = q.eq("category.slug", opts.category);
  const text = cleanQuery(opts.q ?? "");
  if (text) q = q.or(`title.ilike.%${text}%,excerpt.ilike.%${text}%`);
  const { data, count, error } = await q.order("published_at", { ascending: false }).range(from, from + BLOG_PAGE_SIZE - 1);
  if (error) return { posts: [], total: 0, page, pages: 1 };
  const total = count ?? 0;
  return { posts: ((data ?? []) as unknown as Row[]).map(toCard), total, page, pages: Math.max(1, Math.ceil(total / BLOG_PAGE_SIZE)) };
}

export async function listPublicCategories(): Promise<{ slug: string; name: string }[]> {
  "use cache";
  cacheTag(BLOG_TAG);
  cacheLife({ stale: 30, revalidate: 60, expire: 3600 });
  const { data } = await anon().from("blog_categories").select("slug,name").order("name");
  return data ?? [];
}

export async function getPublicPost(slug: string): Promise<{ post: PublicPost; related: PostCard[] } | null> {
  "use cache";
  cacheTag(BLOG_TAG);
  cacheLife({ stale: 30, revalidate: 60, expire: 3600 });
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 100) return null;
  const db = anon();
  const { data } = await db.from("blog_posts").select(`${COLS},blog_post_tags(tag:blog_tags(slug,name))`).eq("slug", slug).maybeSingle();
  if (!data) return null;
  const post = toPost(data as unknown as Row);
  let related: PostCard[] = [];
  if (post.category) {
    const { data: rel } = await db.from("blog_posts").select(COLS_INNER)
      .eq("category.slug", post.category.slug).neq("slug", slug).order("published_at", { ascending: false }).limit(3);
    related = ((rel ?? []) as unknown as Row[]).map(toCard);
  }
  if (related.length < 3) {
    const { data: more } = await db.from("blog_posts").select(COLS).neq("slug", slug).order("published_at", { ascending: false }).limit(6);
    const have = new Set(related.map((r) => r.slug));
    for (const r of (more ?? []) as unknown as Row[]) if (related.length < 3 && !have.has(r.slug)) related.push(toCard(r));
  }
  return { post, related };
}

/** Slugs and dates of every public post (sitemap, RSS). */
export async function listPublicSlugs(): Promise<{ slug: string; updatedAt: string; publishedAt: string }[]> {
  "use cache";
  cacheTag(BLOG_TAG);
  cacheLife({ stale: 30, revalidate: 60, expire: 3600 });
  const { data } = await anon().from("blog_posts").select("slug,updated_at,published_at").order("published_at", { ascending: false }).limit(1000);
  return (data ?? []).map((r) => ({ slug: r.slug, updatedAt: r.updated_at, publishedAt: r.published_at ?? r.updated_at }));
}

/** The newest public posts with their text (RSS). */
export async function listPublicPostsForFeed(limit = 30): Promise<(PostCard & { contentMd: string })[]> {
  "use cache";
  cacheTag(BLOG_TAG);
  cacheLife({ stale: 30, revalidate: 60, expire: 3600 });
  const { data } = await anon().from("blog_posts").select(COLS).order("published_at", { ascending: false }).limit(limit);
  return ((data ?? []) as unknown as Row[]).map((r) => ({ ...toCard(r), contentMd: r.content_md }));
}
