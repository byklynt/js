import type { Metadata } from "next";
import { AdminData } from "@/components/admin/admin-fetch";
import { AdminTicketsView } from "@/components/admin/tickets/admin-tickets-view";
import { getDb } from "@/lib/admin-db";

export const metadata: Metadata = { title: "Tiket - Admin JagoanSosmed" };

export default function Page() {
  return <AdminData>{() => <AdminTicketsView tickets={getDb().tickets} />}</AdminData>;
}
