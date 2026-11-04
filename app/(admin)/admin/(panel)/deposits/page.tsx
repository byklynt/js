import type { Metadata } from "next";
import { AdminData } from "@/components/admin/admin-fetch";
import { DepositsView } from "@/components/admin/deposits/deposits-view";
import { getDb } from "@/lib/admin-db";

export const metadata: Metadata = { title: "Deposit - Admin JagoanSosmed" };

export default function Page() {
  return <AdminData>{() => <DepositsView deposits={getDb().deposits} />}</AdminData>;
}
