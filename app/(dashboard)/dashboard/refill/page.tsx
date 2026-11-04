import type { Metadata } from "next";
import { RefillPage } from "@/components/refill/refill-page";

export const metadata: Metadata = { title: "Refill - JagoanSosmed" };

export default function Page() {
  return <RefillPage />;
}
