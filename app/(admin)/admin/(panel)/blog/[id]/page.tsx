import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminData } from "@/components/admin/admin-fetch";
import { BlogEditor } from "@/components/admin/blog/blog-editor";
import { getAdminPost, listAdminCategories } from "@/lib/server/blog-admin";

export const metadata: Metadata = { title: "Ubah Artikel - Admin JagoanSosmed" };

export default function Page({ params }: PageProps<"/admin/blog/[id]">) {
  return (
    <AdminData>
      {async () => {
        const { id } = await params;
        const [post, categories] = await Promise.all([getAdminPost(id), listAdminCategories()]);
        if (!post) notFound();
        return <BlogEditor key={post.id + post.updatedAt} post={post} categories={categories} />;
      }}
    </AdminData>
  );
}
