import type { Metadata } from "next";
import { AdminData } from "@/components/admin/admin-fetch";
import { BlogEditor } from "@/components/admin/blog/blog-editor";
import { listAdminCategories } from "@/lib/server/blog-admin";

export const metadata: Metadata = { title: "Artikel Baru - Admin JagoanSosmed" };

export default function Page() {
  return (
    <AdminData>
      {async () => <BlogEditor post={null} categories={await listAdminCategories()} />}
    </AdminData>
  );
}
