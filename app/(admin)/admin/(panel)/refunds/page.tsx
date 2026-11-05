import type { Metadata } from "next";
import { AdminData } from "@/components/admin/admin-fetch";
import { PagedList } from "@/components/admin/paged-list";
import { listRefunds } from "@/lib/server/admin/lists";

export const metadata: Metadata = { title: "Refund - Admin JagoanSosmed" };

export default function Page() {
  return <AdminData>{async () => <PagedList kind="refunds" initial={await listRefunds()} />}</AdminData>;
}
