import type { Metadata } from "next";
import { AdminData } from "@/components/admin/admin-fetch";
import { PagedList } from "@/components/admin/paged-list";
import { listRefills } from "@/lib/server/admin/lists";

export const metadata: Metadata = { title: "Refill - Admin JagoanSosmed" };

export default function Page() {
  return <AdminData>{async () => <PagedList kind="refills" initial={await listRefills()} />}</AdminData>;
}
