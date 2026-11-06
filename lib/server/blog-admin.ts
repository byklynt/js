import "server-only";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

/** Admin-side blog reads (service role: drafts and scheduled posts included). Callers must have checked requireAdmin. */
export type AdminPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  contentMd: string;
  coverImageUrl: string | null;
  coverAlt: string;
  categoryId: string | null;
  categoryName: string | null;
  tags: string[];
  status: string;
  publishedAt: string | null;
  seoTitle: string;
  seoDescription: string;
  authorId: string | null;
  authorName: string;
  createdAt: string;
  updatedAt: string;
};

type Row = {
  id: string; slug: string; title: string; excerpt: string; content_md: string; cover_image_url: string | null; cover_alt: string; category_id: string | null;
  status: string; published_at: string | null; seo_title: string; seo_description: string; author_id: string | null; created_at: string; updated_at: string;
  category: { name: string } | null; author: { username: string } | null; blog_post_tags: { tag: { name: string } | null }[];
};

const SELECT = "id,slug,title,excerpt,content_md,cover_image_url,cover_alt,category_id,status,published_at,seo_title,seo_description,author_id,created_at,updated_at,category:blog_categories(name),author:profiles(username),blog_post_tags(tag:blog_tags(name))";

const toAdminPost = (r: Row): AdminPost => ({
  id: r.id, slug: r.slug, title: r.title, excerpt: r.excerpt, contentMd: r.content_md, coverImageUrl: r.cover_image_url, coverAlt: r.cover_alt, categoryId: r.category_id,
  categoryName: r.category?.name ?? null, tags: r.blog_post_tags.flatMap((t) => (t.tag ? [t.tag.name] : [])), status: r.status, publishedAt: r.published_at,
  seoTitle: r.seo_title, seoDescription: r.seo_description, authorId: r.author_id, authorName: r.author?.username ?? "-", createdAt: r.created_at, updatedAt: r.updated_at,
});

/** Newest first. The list page filters and searches in the browser, so this is capped. */
export const ADMIN_LIST_LIMIT = 300;

export async function listAdminPosts(): Promise<AdminPost[]> {
  const { data, error } = await supabaseAdmin().from("blog_posts").select(SELECT).order("created_at", { ascending: false }).limit(ADMIN_LIST_LIMIT);
  if (error) throw new Error(`blog_posts: ${error.message}`);
  return ((data ?? []) as unknown as Row[]).map(toAdminPost);
}

export async function getAdminPost(id: string): Promise<AdminPost | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await supabaseAdmin().from("blog_posts").select(SELECT).eq("id", id).maybeSingle();
  return data ? toAdminPost(data as unknown as Row) : null;
}

export async function listAdminCategories(): Promise<{ id: string; name: string; slug: string }[]> {
  const { data } = await supabaseAdmin().from("blog_categories").select("id,name,slug").order("name");
  return data ?? [];
}
