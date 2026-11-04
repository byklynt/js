"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { History, Inbox, X } from "lucide-react";
import { useDialogA11y } from "@/lib/use-dialog-a11y";
import { getMyTicketsAction } from "@/lib/ticket-actions";
import type { UserTicket } from "@/lib/server/tickets";
import { DashboardPortal } from "@/components/shared/portal";
import { TicketCard } from "./ticket-card";

export function TicketHistoryModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const ref = useDialogA11y<HTMLDivElement>(open, onClose);
  const titleId = useId();
  const [tickets, setTickets] = useState<UserTicket[] | null>(null);

  // The list comes from the server store, so a ticket created a moment ago is already in it.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void getMyTicketsAction().then((list) => alive && setTickets(list)).catch(() => alive && setTickets([]));
    return () => {
      alive = false;
    };
  }, [open]);

  // Clicking a ticket closes the modal and opens its detail page.
  function openTicket(id: string) {
    onClose();
    router.push(`/dashboard/tickets/${id}`);
  }

  return (
    <DashboardPortal>
      <AnimatePresence>
        {open ? (
          <motion.div
            key="tickets-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) onClose();
            }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,27,61,0.45)] p-2 backdrop-blur-sm"
          >
            <motion.div
              ref={ref}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              tabIndex={-1}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="flex max-h-[calc(100vh-16px)] min-h-[min(560px,calc(100vh-16px))] w-full max-w-[520px] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl outline-none dark:border dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex items-center justify-between gap-3 px-5 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-accent">
                    <History className="h-4 w-4" aria-hidden />
                  </span>
                  <h2 id={titleId} className="truncate text-[12px] font-medium text-ink dark:text-white">
                    Tiket
                  </h2>
                </div>
                <button
                  type="button"
                  aria-label="Tutup riwayat tiket"
                  onClick={onClose}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-ink transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-slate-700 dark:text-white dark:hover:bg-slate-800"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="h-px bg-slate-200/70 dark:bg-slate-800" />

              {tickets === null ? (
                <ul aria-busy="true" aria-label="Memuat tiket" className="flex-1 space-y-2 p-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <li key={i} className="animate-shimmer h-[72px] list-none rounded-2xl" />
                  ))}
                </ul>
              ) : tickets.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-accent dark:bg-primary-soft">
                    <Inbox className="h-5 w-5" />
                  </span>
                  <p className="text-[11px] font-semibold text-ink dark:text-slate-200">Belum ada tiket</p>
                </div>
              ) : (
                <ul className="thin-scroll flex-1 space-y-2 overflow-y-auto p-4">
                  {tickets.map((t) => (
                    <TicketCard key={t.id} ticket={t} onOpen={openTicket} />
                  ))}
                </ul>
              )}

              <div className="border-t border-slate-200/70 p-4 dark:border-slate-800">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-[38px] w-full rounded-xl bg-[#0b0f14] text-[10px] font-semibold text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] transition hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border dark:border-slate-600 dark:bg-transparent dark:hover:bg-white/5"
                >
                  Tutup
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </DashboardPortal>
  );
}
