import type { Metadata } from "next";
import { AdminData } from "@/components/admin/admin-fetch";
import { AdminRefillsView } from "@/components/admin/refills/admin-refills-view";
import { getDb } from "@/lib/admin-db";
import { adminRefillRows } from "@/lib/server/views";

export const metadata: Metadata = { title: "Refill - Admin JagoanSosmed" };

export default function Page() {
  return <AdminData>{() => <AdminRefillsView refills={adminRefillRows(getDb())} />}</AdminData>;
}
