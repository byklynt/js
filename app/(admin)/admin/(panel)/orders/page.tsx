import type { Metadata } from "next";
import { AdminData } from "@/components/admin/admin-fetch";
import { PagedList } from "@/components/admin/paged-list";
import { listOrders } from "@/lib/server/admin/lists";
import { loadSyncIndicator } from "@/lib/server/admin/sync-health";

export const metadata: Metadata = { title: "Pesanan - Admin JagoanSosmed" };

export default function Page() {
  return <AdminData>{async () => {
        const [initial, sync] = await Promise.all([listOrders(), loadSyncIndicator()]);
        return <PagedList kind="orders" initial={initial} sync={sync} />;
      }}</AdminData>;
}
