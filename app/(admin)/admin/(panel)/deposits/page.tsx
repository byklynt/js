import type { Metadata } from "next";
import { AdminData } from "@/components/admin/admin-fetch";
import { PagedList } from "@/components/admin/paged-list";
import { listDeposits } from "@/lib/server/admin/lists";

export const metadata: Metadata = { title: "Deposit - Admin JagoanSosmed" };

export default function Page() {
  return <AdminData>{async () => <PagedList kind="deposits" initial={await listDeposits()} />}</AdminData>;
}
