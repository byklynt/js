import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BlogCard, formatBlogDate } from "@/components/blog/post-card";
import { Markdown } from "@/components/landing/markdown";
import { PublicPage } from "@/components/landing/public-page";
import { readingMinutes, seoOf } from "@/lib/blog-core";
import { brand } from "@/lib/brand";
import { getPublicPost } from "@/lib/server/blog";

type Props = PageProps<"/blog/[slug]">;

// Posts live in the database. Static generation needs at least one param, so the placeholder keeps the route valid; real slugs are rendered on
// demand (cached for a minute) and unknown, draft or future posts answer 404.
export function generateStaticParams() {
  return [{ slug: "_" }];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await getPublicPost((await params).slug);
  if (!found) return { title: "Artikel tidak ditemukan", robots: { index: false } };
  const { post } = found;
  const seo = seoOf(post);
  const url = `${brand.domain}/blog/${post.slug}`;
  const image = post.coverImageUrl ?? `${brand.domain}/brand/og-image.png`;
  return {
    title: `${seo.title} - ${brand.name}`,
    description: seo.description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      title: seo.title,
      description: seo.description,
      siteName: brand.name,
      locale: "id_ID",
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
      images: [{ url: image, alt: post.coverAlt || post.title }],
    },
    twitter: { card: "summary_large_image", title: seo.title, description: seo.description, images: [image] },
  };
}

export default async function Page({ params }: Props) {
  const found = await getPublicPost((await params).slug);
  if (!found) notFound();
  const { post, related } = found;
  const seo = seoOf(post);
  const minutes = readingMinutes(post.contentMd);
  const url = `${brand.domain}/blog/${post.slug}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: seo.description,
    image: post.coverImageUrl ? [post.coverImageUrl] : [`${brand.domain}/brand/og-image.png`],
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    mainEntityOfPage: url,
    author: { "@type": "Organization", name: brand.name },
    publisher: { "@type": "Organization", name: brand.name, logo: { "@type": "ImageObject", url: `${brand.domain}/icon.png` } },
    ...(post.category ? { articleSection: post.category.name } : {}),
    ...(post.tags.length ? { keywords: post.tags.map((t) => t.name).join(", ") } : {}),
  };
  return (
    <PublicPage title={post.title} subtitle={`${formatBlogDate(post.publishedAt)} · ${minutes} menit baca${post.category ? ` · ${post.category.name}` : ""}`} narrow>
      {/* "<" is escaped so no string in the article can close the script tag */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <article>
        {post.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.coverImageUrl} alt={post.coverAlt} width={1200} height={630} decoding="async" fetchPriority="high" className="mb-8 aspect-[1200/630] w-full rounded-3xl object-cover" />
        ) : null}
        <Markdown source={post.contentMd} />
        {post.tags.length > 0 ? (
          <ul aria-label="Tag" className="mt-8 flex flex-wrap gap-2">
            {post.tags.map((t) => (
              <li key={t.slug} className="rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-600 dark:bg-primary-500/15 dark:text-primary-300">
                #{t.name}
              </li>
            ))}
          </ul>
        ) : null}
      </article>
      <aside aria-label="Ajakan" className="mt-10 rounded-3xl border border-primary-100 bg-primary-50/50 p-6 text-center dark:border-slate-800 dark:bg-slate-900">
        <p className="text-lg font-bold text-slate-900 dark:text-white">Siap mulai order?</p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Daftar gratis dan pesan layanan sosial media dalam hitungan menit.</p>
        <Link
          href="/signup"
          className="mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-gradient-to-b from-primary-from to-primary-to px-6 text-sm font-semibold text-white shadow-[0_2px_0_var(--primary-pressed)] transition hover:brightness-105"
        >
          Daftar dan mulai order
        </Link>
      </aside>
      {related.length > 0 ? (
        <section aria-labelledby="related" className="mt-12">
          <h2 id="related" className="text-xl font-bold text-slate-900 dark:text-white">
            Artikel terkait
          </h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {related.map((p) => (
              <BlogCard key={p.slug} post={p} />
            ))}
          </ul>
        </section>
      ) : null}
      <p className="mt-10">
        <Link href="/blog" className="text-sm font-semibold text-primary-600 hover:underline dark:text-primary-300">
          &larr; Kembali ke Blog
        </Link>
      </p>
    </PublicPage>
  );
}
