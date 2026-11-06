import Link from "next/link";
import type { PostCard } from "@/lib/server/blog";

export const formatBlogDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" });
};

/** A post in the blog list and in "Artikel terkait". Same card look as the rest of the public pages. */
export function BlogCard({ post }: { post: PostCard }) {
  return (
    <li>
      <Link href={`/blog/${post.slug}`} className="block h-full overflow-hidden rounded-3xl border border-primary-100 bg-white shadow-sm transition hover:border-primary-300 dark:border-slate-800 dark:bg-slate-900">
        {post.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.coverImageUrl} alt={post.coverAlt} width={1200} height={630} loading="lazy" decoding="async" className="aspect-[1200/630] w-full object-cover" />
        ) : null}
        <div className="p-5">
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-slate-400">
            {post.category ? <span className="font-semibold text-primary-600 dark:text-primary-300">{post.category.name}</span> : null}
            <time dateTime={post.publishedAt}>{formatBlogDate(post.publishedAt)}</time>
          </p>
          <h2 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{post.title}</h2>
          {post.excerpt ? <p className="mt-1 line-clamp-3 text-sm text-slate-500 dark:text-slate-400">{post.excerpt}</p> : null}
        </div>
      </Link>
    </li>
  );
}
