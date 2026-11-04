import type { Metadata } from "next";
import { RefundsPage } from "@/components/refunds/refunds-page";

export const metadata: Metadata = { title: "Refund - JagoanSosmed" };

export default function Page() {
  return <RefundsPage />;
}
