import type { Metadata } from "next";
import { AdminData } from "@/components/admin/admin-fetch";
import { AdminRefundsView } from "@/components/admin/refills/admin-refunds-view";
import { buildRefundRows } from "@/lib/server/views";
import { getDb } from "@/lib/admin-db";

export const metadata: Metadata = { title: "Refund - Admin JagoanSosmed" };

export default function Page() {
  return <AdminData>{() => <AdminRefundsView refunds={buildRefundRows(getDb())} />}</AdminData>;
}
