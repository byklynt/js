import type { Ticket } from "@/lib/tickets-data";
import { formatDateTime } from "@/lib/balance";
import { cn } from "@/lib/utils";
import { TicketStatusChip } from "./ticket-status-chip";

export function TicketCard({ ticket, onOpen }: { ticket: Ticket; onOpen: (id: string) => void }) {
  return (
    <li className="list-none">
      <button
        type="button"
        onClick={() => onOpen(ticket.id)}
        aria-label={`Buka tiket ${ticket.id}: ${ticket.title}${ticket.unread ? " (balasan baru)" : ""}`}
        className="block w-full rounded-2xl border border-slate-200/70 p-3 text-left transition hover:border-primary-200 hover:bg-slate-50/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-slate-800 dark:hover:border-slate-600 dark:hover:bg-white/[0.03]"
      >
        <p
          className={cn(
            "flex items-center gap-2 text-[11px] text-ink dark:text-white",
            ticket.unread ? "font-semibold" : "font-medium"
          )}
        >
          {ticket.unread ? (
            <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
          ) : null}
          {ticket.title}
        </p>
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="flex min-w-0 flex-wrap gap-x-2 text-[10px] text-ink dark:text-slate-100">
            <span className="font-medium">ID: {ticket.id}</span>
            <span>
              <span className="font-medium">Pembaruan terakhir:</span>{" "}
              <time dateTime={ticket.updatedAt} className="text-[#5B6B8C] dark:text-slate-400">
                {formatDateTime(ticket.updatedAt)}
              </time>
            </span>
          </p>
          <TicketStatusChip status={ticket.status} />
        </div>
      </button>
    </li>
  );
}
