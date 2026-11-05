import type { Metadata } from "next";
import { AdminData } from "@/components/admin/admin-fetch";
import { AdminDashboard } from "@/components/admin/dashboard/admin-dashboard";
import { loadDashboardData } from "@/lib/server/admin/dashboard";
import { ensureFreshBalance } from "@/lib/server/providers/ensure";

export const metadata: Metadata = { title: "Dasbor Admin - JagoanSosmed" };

export default function Page() {
  return (
    <AdminData>
      {async () => {
        // Real provider balance (cached 60 seconds) before the numbers are read.
        await ensureFreshBalance();
        return <AdminDashboard data={await loadDashboardData()} />;
      }}
    </AdminData>
  );
}
