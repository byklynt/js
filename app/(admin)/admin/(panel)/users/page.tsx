import type { Metadata } from "next";
import { AdminData } from "@/components/admin/admin-fetch";
import { UsersView } from "@/components/admin/users/users-view";
import { getDb } from "@/lib/admin-db";
import { flaggedUsers } from "@/lib/server/risk";

export const metadata: Metadata = { title: "Pengguna - Admin JagoanSosmed" };

export default function Page() {
  return (
    <AdminData>
      {() => {
        const db = getDb();
        return <UsersView users={db.users} orders={db.orders} deposits={db.deposits} ledger={db.ledger.slice(0, 400)} flaggedIds={flaggedUsers(db).map((r) => r.userId)} />;
      }}
    </AdminData>
  );
}
