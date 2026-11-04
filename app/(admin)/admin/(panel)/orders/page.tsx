import type { Metadata } from "next";
import { AdminData } from "@/components/admin/admin-fetch";
import { AdminOrdersView } from "@/components/admin/orders/admin-orders-view";
import { getDb } from "@/lib/admin-db";
import { orderFlags } from "@/lib/server/views";

export const metadata: Metadata = { title: "Pesanan - Admin JagoanSosmed" };

export default function Page() {
  return <AdminData>{() => <AdminOrdersView orders={getDb().orders} stuckIds={orderFlags(getDb()).stuck} />}</AdminData>;
}
