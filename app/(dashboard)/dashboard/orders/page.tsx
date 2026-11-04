import type { Metadata } from "next";
import { Suspense } from "react";
import { OrdersPage } from "@/components/orders/orders-page";

export const metadata: Metadata = { title: "Pesanan - JagoanSosmed" };

export default function Page(props: PageProps<"/dashboard/orders">) {
  return (
    <Suspense fallback={<OrdersPage />}>
      <OrdersPageContent searchParams={props.searchParams} />
    </Suspense>
  );
}

async function OrdersPageContent({
  searchParams,
}: {
  searchParams: PageProps<"/dashboard/orders">["searchParams"];
}) {
  const params = await searchParams;
  const search = params.search;
  const initialSearch = (Array.isArray(search) ? search[0] : search) ?? "";
  return <OrdersPage initialSearch={initialSearch} />;
}
