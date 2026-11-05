import type { Metadata } from "next";
import { AdminData } from "@/components/admin/admin-fetch";
import { PagedList } from "@/components/admin/paged-list";
import { listOrders } from "@/lib/server/admin/lists";

export const metadata: Metadata = { title: "Pesanan - Admin JagoanSosmed" };

export default function Page() {
  return <AdminData>{async () => <PagedList kind="orders" initial={await listOrders()} />}</AdminData>;
}
