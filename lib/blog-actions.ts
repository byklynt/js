"use server";

import { revalidatePath, updateTag } from "next/cache";
import { logAdminAction } from "@/lib/admin-audit";
import { requireAdmin } from "@/lib/auth-server";
import { BLOG_TAG, isValidSlug, parseTags, postStatus, slugify, uniqueSlug } from "@/lib/blog-core";
import { blogIdSchema, blogImagePrefix, blogPostSchema, blogPublishSchema } from "@/lib/blog-schemas";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { supabaseUrl } from "@/lib/supabase/env";

export type BlogResult = { ok: true; message: string; id?: string; slug?: string } | { ok: false; error: string };

const fail = (error: string): BlogResult => ({ ok: false, error });

async function admin() {
  try {
    return await requireAdmin("action");
  } catch {
    return null;
  }
}

/** Drop the public caches and the pages that list posts. */
function refresh(slug?: string) {
  updateTag(BLOG_TAG);
  revalidatePath("/blog");
  revalidatePath("/blog/rss.xml");
  revalidatePath("/sitemap.xml");
  if (slug) revalidatePath(`/blog/${slug}`);
  revalidatePath("/admin/blog");
}

/**
 * Create or update a post (admin only, the same session + 2FA check as every admin action). Slug: generated from the title when empty, validated
 * and unique. Publishing with a future date schedules it: the post becomes public by itself when published_at <= now() (enforced by RLS).
 */
export async function saveBlogPost(input: unknown): Promise<BlogResult> {
  const who = await admin();
  if (!who) return fail("Kamu tidak punya akses untuk tindakan ini.");
  const parsed = blogPostSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Data tidak valid.");
  const d = parsed.data;
  const db = supabaseAdmin();

  if (d.coverImageUrl && !d.coverImageUrl.startsWith(blogImagePrefix(supabaseUrl()))) return fail("Gambar sampul harus diunggah lewat editor.");
  if (d.intent === "terbit" && !d.contentMd.trim()) return fail("Isi artikel masih kosong.");

  // slug: typed (validated by the schema) or generated; unique among the OTHER posts
  const { data: others } = await db.from("blog_posts").select("id,slug");
  const taken = new Set((others ?? []).filter((p) => p.id !== d.id).map((p) => p.slug));
  let slug = d.slug;
  if (slug) {
    if (!isValidSlug(slug)) return fail("Slug tidak valid.");
    if (taken.has(slug)) return fail(`Slug "${slug}" sudah dipakai artikel lain. Ubah slug-nya.`);
  } else {
    slug = uniqueSlug(d.title, taken);
  }

  // category (an existing one, or a new name)
  let categoryId = d.categoryId;
  if (d.newCategory) {
    const cslug = slugify(d.newCategory);
    if (!cslug) return fail("Nama kategori tidak valid.");
    const { data: cat, error } = await db.from("blog_categories").upsert({ slug: cslug, name: d.newCategory }, { onConflict: "slug" }).select("id").single();
    if (error || !cat) return fail("Kategori tidak bisa dibuat.");
    categoryId = cat.id;
  }

  const existing = d.id ? (await db.from("blog_posts").select("id,status,published_at,slug").eq("id", d.id).maybeSingle()).data : null;
  if (d.id && !existing) return fail("Artikel tidak ditemukan.");

  // status and date
  const now = new Date();
  const publishedAt = d.intent === "terbit" ? (d.publishedAt ?? existing?.published_at ?? now.toISOString()) : d.publishedAt;
  const status = d.intent;

  const fields = {
    slug, title: d.title, excerpt: d.excerpt, content_md: d.contentMd, cover_image_url: d.coverImageUrl, cover_alt: d.coverAlt, category_id: categoryId,
    status, published_at: publishedAt, seo_title: d.seoTitle, seo_description: d.seoDescription,
  };
  let id = d.id;
  if (id) {
    const { error } = await db.from("blog_posts").update(fields).eq("id", id);
    if (error) return fail(error.code === "23505" ? `Slug "${slug}" sudah dipakai artikel lain.` : "Artikel tidak bisa disimpan. Coba lagi.");
  } else {
    const { data, error } = await db.from("blog_posts").insert({ ...fields, author_id: who.sub }).select("id").single();
    if (error || !data) return fail(error?.code === "23505" ? `Slug "${slug}" sudah dipakai artikel lain.` : "Artikel tidak bisa disimpan. Coba lagi.");
    id = data.id;
  }

  // tags: upsert by slug, then replace the links
  const tags = parseTags(d.tags);
  await db.from("blog_post_tags").delete().eq("post_id", id!);
  if (tags.length) {
    const { data: rows } = await db.from("blog_tags").upsert(tags, { onConflict: "slug" }).select("id");
    if (rows?.length) await db.from("blog_post_tags").insert(rows.map((t) => ({ post_id: id!, tag_id: t.id })));
  }

  const before = existing ? { status: existing.status, publishedAt: existing.published_at, slug: existing.slug } : null;
  const after = { status, publishedAt, slug, state: postStatus({ status, publishedAt }, now) };
  const wasPublished = existing?.status === "terbit";
  const action = !existing ? (status === "terbit" ? "blog.publish" : "blog.create") : status === "terbit" && !wasPublished ? "blog.publish" : status === "draf" && wasPublished ? "blog.unpublish" : "blog.update";
  await logAdminAction({ adminId: who.sub, adminName: who.username, action, targetType: "blog", targetId: id!, before, after: { ...after, title: d.title } });
  refresh(slug);
  if (existing && existing.slug !== slug) revalidatePath(`/blog/${existing.slug}`);
  const msg = status === "draf" ? "Draf disimpan." : after.state === "terjadwal" ? "Artikel dijadwalkan." : "Artikel diterbitkan.";
  return { ok: true, message: msg, id: id!, slug };
}

/** Publish now (or at the given date) without opening the editor. */
export async function publishBlogPost(input: unknown): Promise<BlogResult> {
  const who = await admin();
  if (!who) return fail("Kamu tidak punya akses untuk tindakan ini.");
  const p = blogPublishSchema.safeParse(input);
  if (!p.success) return fail("Data tidak valid.");
  const db = supabaseAdmin();
  const { data: post } = await db.from("blog_posts").select("id,slug,title,status,published_at,content_md").eq("id", p.data.id).maybeSingle();
  if (!post) return fail("Artikel tidak ditemukan.");
  if (!post.content_md.trim()) return fail("Isi artikel masih kosong.");
  const publishedAt = p.data.publishedAt ?? post.published_at ?? new Date().toISOString();
  if (post.status === "terbit" && post.published_at === publishedAt) return { ok: true, message: "Artikel sudah terbit.", id: post.id, slug: post.slug };
  const { error } = await db.from("blog_posts").update({ status: "terbit", published_at: publishedAt }).eq("id", post.id);
  if (error) return fail("Artikel tidak bisa diterbitkan. Coba lagi.");
  const state = postStatus({ status: "terbit", publishedAt });
  await logAdminAction({ adminId: who.sub, adminName: who.username, action: "blog.publish", targetType: "blog", targetId: post.id, before: { status: post.status }, after: { status: "terbit", publishedAt, title: post.title, state } });
  refresh(post.slug);
  return { ok: true, message: state === "terjadwal" ? "Artikel dijadwalkan." : "Artikel diterbitkan.", id: post.id, slug: post.slug };
}

export async function unpublishBlogPost(input: unknown): Promise<BlogResult> {
  const who = await admin();
  if (!who) return fail("Kamu tidak punya akses untuk tindakan ini.");
  const p = blogIdSchema.safeParse(input);
  if (!p.success) return fail("Data tidak valid.");
  const db = supabaseAdmin();
  const { data: post } = await db.from("blog_posts").select("id,slug,title,status").eq("id", p.data.id).maybeSingle();
  if (!post) return fail("Artikel tidak ditemukan.");
  if (post.status === "draf") return { ok: true, message: "Artikel sudah berstatus draf.", id: post.id, slug: post.slug };
  const { error } = await db.from("blog_posts").update({ status: "draf" }).eq("id", post.id);
  if (error) return fail("Artikel tidak bisa ditarik. Coba lagi.");
  await logAdminAction({ adminId: who.sub, adminName: who.username, action: "blog.unpublish", targetType: "blog", targetId: post.id, before: { status: "terbit" }, after: { status: "draf", title: post.title } });
  refresh(post.slug);
  return { ok: true, message: "Artikel ditarik kembali menjadi draf.", id: post.id, slug: post.slug };
}

export async function deleteBlogPost(input: unknown): Promise<BlogResult> {
  const who = await admin();
  if (!who) return fail("Kamu tidak punya akses untuk tindakan ini.");
  const p = blogIdSchema.safeParse(input);
  if (!p.success) return fail("Data tidak valid.");
  const db = supabaseAdmin();
  const { data: post } = await db.from("blog_posts").select("id,slug,title,status").eq("id", p.data.id).maybeSingle();
  if (!post) return { ok: true, message: "Artikel sudah dihapus." };
  const { error } = await db.from("blog_posts").delete().eq("id", post.id);
  if (error) return fail("Artikel tidak bisa dihapus. Coba lagi.");
  await logAdminAction({ adminId: who.sub, adminName: who.username, action: "blog.delete", targetType: "blog", targetId: post.id, before: { status: post.status, slug: post.slug, title: post.title }, after: null });
  refresh(post.slug);
  return { ok: true, message: "Artikel dihapus." };
}
