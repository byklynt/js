import type { Metadata } from "next";
import { AdminData } from "@/components/admin/admin-fetch";
import { PagedList } from "@/components/admin/paged-list";
import { listTicketsPage } from "@/lib/server/admin/lists";

export const metadata: Metadata = { title: "Tiket - Admin JagoanSosmed" };

export default function Page() {
  return <AdminData>{async () => <PagedList kind="tickets" initial={await listTicketsPage()} />}</AdminData>;
}
