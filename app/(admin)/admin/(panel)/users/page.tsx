import type { Metadata } from "next";
import { AdminData } from "@/components/admin/admin-fetch";
import { PagedList } from "@/components/admin/paged-list";
import { listUsers } from "@/lib/server/admin/lists";

export const metadata: Metadata = { title: "Pengguna - Admin JagoanSosmed" };

export default function Page() {
  return <AdminData>{async () => <PagedList kind="users" initial={await listUsers()} />}</AdminData>;
}
