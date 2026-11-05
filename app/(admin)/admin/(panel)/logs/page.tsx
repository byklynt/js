import type { Metadata } from "next";
import { AdminData } from "@/components/admin/admin-fetch";
import { PagedList } from "@/components/admin/paged-list";
import { listLogs } from "@/lib/server/admin/lists";

export const metadata: Metadata = { title: "Log Aktivitas - Admin JagoanSosmed" };

export default function Page() {
  return <AdminData>{async () => <PagedList kind="logs" initial={await listLogs()} />}</AdminData>;
}
