import type { Metadata } from "next";
import { AddFundsPage } from "@/components/funds/add-funds-page";

export const metadata: Metadata = { title: "Tambah Saldo - JagoanSosmed" };

export default function Page() {
  return <AddFundsPage />;
}
