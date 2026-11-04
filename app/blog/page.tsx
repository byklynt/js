import type { Metadata } from "next";
import Link from "next/link";
import { PublicPage } from "@/components/landing/public-page";
import { getPosts } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Blog - JagoanSosmed",
  description: "Artikel dan panduan dari JagoanSosmed.",
};

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export default function Page() {
  const posts = getPosts();
  return (
    <PublicPage title="Blog" subtitle="Artikel dan panduan." narrow>
      {posts.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-primary-200 px-6 py-16 text-center dark:border-slate-700">
          <p className="text-base font-semibold text-slate-900 dark:text-white">Belum ada artikel</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Artikel akan tampil di sini setelah dipublikasikan.</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {posts.map((p) => (
            <li key={p.slug}>
              <Link href={`/blog/${p.slug}`} className="block rounded-3xl border border-primary-100 bg-white p-5 shadow-sm transition hover:border-primary-300 dark:border-slate-800 dark:bg-slate-900">
                {p.date ? <p className="text-xs text-slate-400">{formatDate(p.date)}</p> : null}
                <h2 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{p.title}</h2>
                {p.excerpt ? <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{p.excerpt}</p> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PublicPage>
  );
}
