import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { TicketDetail } from "@/components/tickets/ticket-detail";
import { getCurrentUser } from "@/lib/auth-actions";
import { currentUserId } from "@/lib/current-user";
import { findOwnTicket, toUserTicket } from "@/lib/server/tickets";

export const metadata: Metadata = { title: "Detail Tiket - JagoanSosmed" };

export default function Page(props: PageProps<"/dashboard/tickets/[id]">) {
  return (
    <Suspense fallback={<div aria-busy="true" className="animate-shimmer mt-10 h-64 rounded-2xl" />}>
      <Loaded params={props.params} />
    </Suspense>
  );
}

async function Loaded({ params }: { params: PageProps<"/dashboard/tickets/[id]">["params"] }) {
  await connection();
  const { id } = await params;
  const [me, userId] = await Promise.all([getCurrentUser(), currentUserId()]);
  // Server-side ownership check: someone else's ticket is passed on as "not found" and its content never leaves the server.
  const ticket = userId ? await findOwnTicket(userId, id) : null;
  return <TicketDetail key={id} ticketId={id} initial={ticket ? toUserTicket(ticket) : null} username={me?.username ?? "kamu"} />;
}
