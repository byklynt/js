import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { InvoiceForm } from "@/components/settings/invoice-form";
import { getMySettings } from "@/lib/user-actions";

export const metadata: Metadata = { title: "Pengaturan - JagoanSosmed" };

export default function Page() {
  return (
    <Suspense fallback={<InvoiceForm />}>
      <Loaded />
    </Suspense>
  );
}

async function Loaded() {
  await connection();
  const saved = (await getMySettings("invoice")) as Record<string, string>;
  return <InvoiceForm initial={saved} />;
}
