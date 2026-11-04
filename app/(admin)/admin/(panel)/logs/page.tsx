import type { Metadata } from "next";
import { AdminData } from "@/components/admin/admin-fetch";
import { LogsView } from "@/components/admin/logs/logs-view";
import { getDb } from "@/lib/admin-db";

export const metadata: Metadata = { title: "Log Aktivitas - Admin JagoanSosmed" };

export default function Page() {
  return <AdminData>{() => <LogsView logs={getDb().auditLogs} />}</AdminData>;
}
