import type { Metadata } from "next";
import { InvoiceForm } from "@/components/settings/invoice-form";

export const metadata: Metadata = { title: "Pengaturan - JagoanSosmed" };

export default function Page() {
  return <InvoiceForm />;
}
