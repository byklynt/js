import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BlogCard } from "@/components/blog/post-card";
import { PublicPage } from "@/components/landing/public-page";
import { brand } from "@/lib/brand";
import { listPublicCategories, listPublicPosts } from "@/lib/server/blog";

export const metadata: Metadata = {
  title: "Blog - JagoanSosmed",
  description: "Artikel dan panduan dari JagoanSosmed.",
  alternates: { canonical: `${brand.domain}/blog`, types: { "application/rss+xml": `${brand.domain}/blog/rss.xml` } },
};

type Query = { page?: string | string[]; kategori?: string | string[]; q?: string | string[] };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default function Page({ searchParams }: PageProps<"/blog">) {
  return (
    <PublicPage title="Blog" subtitle="Artikel dan panduan.">
      <Suspense fallback={<p className="text-sm text-slate-500">Memuat artikel...</p>}>
        <List searchParams={searchParams} />
      </Suspense>
    </PublicPage>
  );
}

function href(params: { page?: number; kategori?: string; q?: string }) {
  const p = new URLSearchParams();
  if (params.kategori) p.set("kategori", params.kategori);
  if (params.q) p.set("q", params.q);
  if (params.page && params.page > 1) p.set("page", String(params.page));
  const s = p.toString();
  return s ? `/blog?${s}` : "/blog";
}

async function List({ searchParams }: { searchParams: Promise<Query> }) {
  const sp = await searchParams;
  const kategori = one(sp.kategori).slice(0, 80);
  const q = one(sp.q).trim().slice(0, 60);
  const [{ posts, total, page, pages }, categories] = await Promise.all([listPublicPosts({ page: Number(one(sp.page)) || 1, category: kategori || undefined, q: q || undefined }), listPublicCategories()]);
  const chip = (active: boolean) =>
    `rounded-full border px-4 py-1.5 text-xs font-semibold transition ${active ? "border-primary-500 bg-primary-50 text-primary-600 dark:bg-primary-500/15 dark:text-primary-300" : "border-slate-200 text-slate-600 hover:border-primary-300 dark:border-slate-700 dark:text-slate-300"}`;
  return (
    <>
      <form action="/blog" role="search" className="mb-5 flex gap-2">
        {kategori ? <input type="hidden" name="kategori" value={kategori} /> : null}
        <input type="search" name="q" defaultValue={q} placeholder="Cari artikel..." aria-label="Cari artikel" maxLength={60} className="h-10 min-w-0 flex-1 rounded-full border border-slate-200 bg-white px-4 text-sm outline-none focus:border-primary-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
        <button type="submit" className="h-10 rounded-full bg-gradient-to-b from-primary-from to-primary-to px-5 text-sm font-semibold text-white">Cari</button>
      </form>
      {categories.length > 0 ? (
        <nav aria-label="Kategori" className="mb-6 flex flex-wrap gap-2">
          <Link href={href({ q })} className={chip(!kategori)}>Semua</Link>
          {categories.map((c) => (
            <Link key={c.slug} href={href({ kategori: c.slug, q })} aria-current={kategori === c.slug ? "page" : undefined} className={chip(kategori === c.slug)}>{c.name}</Link>
          ))}
        </nav>
      ) : null}
      {posts.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-primary-200 px-6 py-16 text-center dark:border-slate-700">
          <p className="text-base font-semibold text-slate-900 dark:text-white">{q || kategori ? "Tidak ada hasil" : "Belum ada artikel"}</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{q || kategori ? "Coba kata kunci atau kategori lain." : "Artikel akan tampil di sini setelah dipublikasikan."}</p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">{posts.map((p) => <BlogCard key={p.slug} post={p} />)}</ul>
      )}
      {pages > 1 ? (
        <nav aria-label="Halaman" className="mt-8 flex items-center justify-between text-sm">
          {page > 1 ? <Link href={href({ page: page - 1, kategori, q })} rel="prev" className="font-semibold text-primary-600 hover:underline dark:text-primary-300">&larr; Sebelumnya</Link> : <span />}
          <span className="text-slate-500 dark:text-slate-400">Halaman {page} dari {pages} ({total} artikel)</span>
          {page < pages ? <Link href={href({ page: page + 1, kategori, q })} rel="next" className="font-semibold text-primary-600 hover:underline dark:text-primary-300">Berikutnya &rarr;</Link> : <span />}
        </nav>
      ) : null}
    </>
  );
}
