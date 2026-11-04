import type { Metadata } from "next";
import { TicketsPage } from "@/components/tickets/tickets-page";

export const metadata: Metadata = { title: "Tiket - JagoanSosmed" };

export default function Page() {
  return <TicketsPage />;
}
