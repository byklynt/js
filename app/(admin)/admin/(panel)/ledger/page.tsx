import type { Metadata } from "next";
import { AdminData } from "@/components/admin/admin-fetch";
import { AdminLedgerView } from "@/components/admin/ledger/admin-ledger-view";
import { getDb } from "@/lib/admin-db";

export const metadata: Metadata = { title: "Buku Besar - Admin JagoanSosmed" };

export default function Page() {
  return (
    <AdminData>
      {() => {
        const db = getDb();
        return <AdminLedgerView entries={db.ledger} userNames={Object.fromEntries(db.users.map((u) => [u.id, u.username]))} />;
      }}
    </AdminData>
  );
}
