import type { Metadata } from "next";
import { AdminData } from "@/components/admin/admin-fetch";
import { BlogListView } from "@/components/admin/blog/blog-list-view";
import { ADMIN_LIST_LIMIT, listAdminPosts } from "@/lib/server/blog-admin";

export const metadata: Metadata = { title: "Blog - Admin JagoanSosmed" };

export default function Page() {
  return (
    <AdminData>
      {async () => <BlogListView posts={await listAdminPosts()} limit={ADMIN_LIST_LIMIT} />}
    </AdminData>
  );
}
