import type { Metadata } from "next";
import { Suspense } from "react";
import { CatalogBoundary } from "@/components/dashboard/catalog-boundary";
import { MassOrderPage } from "@/components/massorder/mass-order-page";

export const metadata: Metadata = { title: "Order Massal - JagoanSosmed" };

export default function Page() {
  return (
    <Suspense fallback={<MassOrderPage />}>
      <CatalogBoundary />
      <MassOrderPage />
    </Suspense>
  );
}
