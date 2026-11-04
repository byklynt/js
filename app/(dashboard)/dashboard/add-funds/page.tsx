import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { AddFundsPage } from "@/components/funds/add-funds-page";
import { getDepositConfig } from "@/lib/user-actions";

export const metadata: Metadata = { title: "Tambah Saldo - JagoanSosmed" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <AddFundsContent />
    </Suspense>
  );
}

async function AddFundsContent() {
  await connection();
  return <AddFundsPage config={await getDepositConfig()} />;
}
