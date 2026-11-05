import type { Metadata } from "next";
import { AdminData } from "@/components/admin/admin-fetch";
import { PagedList } from "@/components/admin/paged-list";
import { listLedger } from "@/lib/server/admin/lists";

export const metadata: Metadata = { title: "Buku Besar - Admin JagoanSosmed" };

export default function Page() {
  return <AdminData>{async () => <PagedList kind="ledger" initial={await listLedger()} />}</AdminData>;
}
