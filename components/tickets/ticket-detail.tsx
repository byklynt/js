"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Inbox } from "lucide-react";
import { replyTicket } from "@/lib/dashboard-actions";
import { closeTicketAction, getTicketAction, reopenTicketAction } from "@/lib/ticket-actions";
import { refreshTicketBadge } from "@/lib/tickets-store";
import type { TicketAttachment, TicketMessage } from "@/lib/tickets-data";
import type { UserTicket } from "@/lib/server/tickets";
import { useToast } from "@/components/shared/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TicketComposer } from "./ticket-composer";
import { TicketStatusChip } from "./ticket-status-chip";
import { TicketThread } from "./ticket-thread";

/** Light polling for new support replies. TODO(realtime): replace with a push channel (SSE / websocket). */
const POLL_MS = 15_000;

export function TicketDetail({ ticketId, initial, username }: { ticketId: string; initial: UserTicket | null; username: string }) {
  const toast = useToast();
  const [ticket, setTicket] = useState<UserTicket | null>(initial);
  const [closing, setClosing] = useState(false);
  const pending = useRef(0); // optimistic sends in flight: do not let polling overwrite them

  // Reading the ticket (now and on every poll) marks it read: its dot and the sidebar badge go away.
  const refresh = useCallback(async () => {
    const res = await getTicketAction(ticketId, true);
    if (res.ok && res.ticket && pending.current === 0) setTicket(res.ticket);
    refreshTicketBadge();
  }, [ticketId]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  if (!ticket) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center py-24 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-accent dark:bg-slate-900">
          <Inbox className="h-6 w-6" aria-hidden />
        </span>
        <h1 className="mt-5 text-[14px] font-semibold text-ink dark:text-white">Tiket tidak ditemukan</h1>
        <p className="mt-1.5 text-[10.5px] text-[#5B6B8C] dark:text-slate-400">Tiket ini tidak ada atau bukan milik akunmu.</p>
        <Link href="/dashboard/tickets" className="mt-5 flex h-[38px] items-center rounded-xl bg-gradient-to-b from-primary-from to-primary-to px-5 text-[10px] font-semibold text-white shadow-[0_2px_0_var(--primary-pressed)] transition hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          Kembali ke tiket
        </Link>
      </div>
    );
  }

  const closed = ticket.status === "ditutup";

  async function send(text: string, files: File[]): Promise<boolean> {
    const current = ticket as UserTicket;
    const tempId = `tmp-${Date.now()}`;
    const optimistic: TicketMessage = {
      id: tempId, from: "user", text, at: new Date().toISOString(),
      attachments: files.map<TicketAttachment>((f, i) => ({ id: `${tempId}-${i}`, name: f.name, size: f.size, type: f.type, url: URL.createObjectURL(f) })),
    };
    pending.current++;
    setTicket({ ...current, status: "menunggu", messages: [...current.messages, optimistic] });
    try {
      const res = await replyTicket(current.id, text, files);
      if (!res.ok) throw new Error(res.error);
      setTicket((t) => (t ? { ...t, status: res.status, messages: t.messages.map((m) => (m.id === tempId ? res.message : m)) } : t));
      return true;
    } catch (e) {
      setTicket((t) => (t ? { ...t, status: current.status, messages: t.messages.filter((m) => m.id !== tempId) } : t));
      toast(e instanceof Error && e.message ? e.message : "Gagal mengirim balasan. Coba lagi.", "error");
      return false;
    } finally {
      pending.current--;
    }
  }

  async function closeTicket() {
    const res = await closeTicketAction(ticket?.id);
    if (res.ok) {
      setTicket(res.ticket);
      setClosing(false);
      toast(`Tiket #${res.ticket.id} ditutup`);
    } else toast(res.error, "error");
  }

  async function reopen() {
    const res = await reopenTicketAction(ticket?.id);
    if (res.ok) {
      setTicket(res.ticket);
      toast("Tiket dibuka kembali");
    } else toast(res.error, "error");
  }

  const textButton =
    "h-8 rounded-lg px-2.5 text-[10.5px] font-medium text-[#5B6B8C] transition hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:text-slate-400 dark:hover:text-white";

  return (
    // Fills the area under the top bar: cancels the page padding, so there is no pattern zone here.
    <div className="-mx-4 -mt-6 -mb-10 flex h-[calc(100dvh-67px)] flex-col sm:-mx-6 lg:-mx-[53px] lg:-mt-[60px]">
      <header className="shrink-0 border-b border-slate-200/70 px-4 py-3 sm:px-6 lg:px-[53px] dark:border-slate-800">
        <Link href="/dashboard/tickets" className="mb-2 inline-flex items-center gap-1 rounded text-[10px] font-medium text-primary-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          <ArrowLeft className="h-3 w-3" aria-hidden /> Semua tiket
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <p className="text-[10px] text-[#5B6B8C] dark:text-slate-400">Tiket: #{ticket.id}</p>
            <h1 className="truncate text-[20px] leading-tight font-semibold text-[#0F1B3D] dark:text-white">{ticket.title}</h1>
            {ticket.orderIds?.length ? (
              <ul aria-label="ID pesanan" className="mt-1.5 flex flex-wrap gap-1.5">
                {ticket.orderIds.map((o) => (
                  <li key={o} className="list-none">
                    <Link href={`/dashboard/orders?search=${o}`} className="rounded-full border border-slate-200/80 bg-white px-2.5 py-0.5 text-[9.5px] font-medium text-ink hover:border-primary-300 focus-visible:outline-2 focus-visible:outline-primary dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                      Pesanan {o}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <TicketStatusChip status={ticket.status} />
            {closed ? (
              ticket.closedReopenable ? (
                <button type="button" onClick={() => void reopen()} className={textButton}>Buka kembali</button>
              ) : null
            ) : (
              <button type="button" onClick={() => setClosing(true)} className={textButton}>Tutup tiket</button>
            )}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        <section aria-label="Percakapan" className="flex min-h-0 flex-1 flex-col">
          <TicketThread messages={ticket.messages} username={username} />
        </section>
        <TicketComposer onSend={send} disabled={closed} disabledNote="Tiket ini sudah ditutup." />
      </div>

      <ConfirmDialog
        open={closing}
        onClose={() => setClosing(false)}
        title="Tutup tiket ini?"
        description="Kamu tidak bisa membalas lagi setelah tiket ditutup. Kamu bisa membukanya kembali dalam 7 hari setelah balasan terakhir tim support."
        confirmLabel="Tutup tiket"
        onConfirm={closeTicket}
      />
    </div>
  );
}
