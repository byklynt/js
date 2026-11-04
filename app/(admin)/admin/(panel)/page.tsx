import type { Metadata } from "next";
import { AdminData } from "@/components/admin/admin-fetch";
import { AdminDashboard } from "@/components/admin/dashboard/admin-dashboard";
import { getDashboardData, getDb } from "@/lib/admin-db";
import { ensureFreshBalance } from "@/lib/server/providers/ensure";

export const metadata: Metadata = { title: "Dasbor Admin - JagoanSosmed" };

export default function Page() {
  return (
    <AdminData>
      {async () => {
        // Real provider balance (cached 60 seconds) before the numbers are read.
        await ensureFreshBalance(getDb());
        return <AdminDashboard data={getDashboardData()} />;
      }}
    </AdminData>
  );
}
