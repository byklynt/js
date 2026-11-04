import type { Metadata } from "next";
import { UserLedgerPage } from "@/components/ledger/user-ledger-page";

export const metadata: Metadata = { title: "Mutasi Saldo - JagoanSosmed" };

export default function Page() {
  return <UserLedgerPage />;
}
