import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { MassOrderPage } from "@/components/massorder/mass-order-page";
import { getDb } from "@/lib/admin-db";
import { countServices } from "@/lib/server/services";

export const metadata: Metadata = { title: "Order Massal - JagoanSosmed" };

export default function Page() {
  return (
    <Suspense fallback={<MassOrderPage hasServices />}>
      <MassOrderContent />
    </Suspense>
  );
}

async function MassOrderContent() {
  await connection();
  return <MassOrderPage hasServices={(await countServices()) > 0} />;
}
