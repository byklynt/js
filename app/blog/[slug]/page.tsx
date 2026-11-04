import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicPage } from "@/components/landing/public-page";
import { Markdown } from "@/components/landing/markdown";
import { getPost, getPosts } from "@/lib/blog";

type Props = { params: Promise<{ slug: string }> };

// Posts are files; unknown slugs 404. At least one param is required for static generation, so with no posts
// the route is rendered on demand and returns 404.
export function generateStaticParams() {
  const posts = getPosts();
  return posts.length > 0 ? posts.map((p) => ({ slug: p.slug })) : [{ slug: "_" }];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = getPost((await params).slug);
  return post ? { title: `${post.title} - JagoanSosmed`, description: post.excerpt } : { title: "Artikel tidak ditemukan" };
}

export default async function Page({ params }: Props) {
  const post = getPost((await params).slug);
  if (!post) notFound();
  const date = new Date(`${post.date}T00:00:00Z`);
  return (
    <PublicPage title={post.title} subtitle={Number.isNaN(date.getTime()) ? undefined : date.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })} narrow>
      <Markdown source={post.body} />
      <p className="mt-10">
        <Link href="/blog" className="text-sm font-semibold text-primary-600 hover:underline dark:text-primary-300">
          &larr; Kembali ke Blog
        </Link>
      </p>
    </PublicPage>
  );
}
