"use client";

import { useMemo, useState } from "react";
import { Inbox } from "lucide-react";
import type { AdminTicket } from "@/lib/admin-data";
import { ticketStatusLabels, type TicketStatus } from "@/lib/tickets-data";
import { addTicketNote, assignTicket, setTicketStatus } from "@/lib/admin-actions";
import { formatDateTime } from "@/lib/balance";
import { PageHeader } from "@/components/shell/page-header";
import { SearchPill } from "@/components/ui/search-pill";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TicketStatusChip } from "@/components/tickets/ticket-status-chip";
import { TicketComposer } from "@/components/tickets/ticket-composer";
import { TicketThread } from "@/components/tickets/ticket-thread";
import { replyAdminTicketForm } from "@/lib/admin-ticket-actions";
import { useListState, useParamFilter } from "@/lib/use-list-state";
import { cn } from "@/lib/utils";
import { useAdminRunner } from "../use-admin-runner";

type Filter = TicketStatus | "semua";
const filterItems: { value: Filter; label: string }[] = [
  { value: "semua", label: "Semua" },
  { value: "menunggu", label: "Menunggu" },
  { value: "dibalas", label: "Dibalas" },
  { value: "ditutup", label: "Ditutup" },
];
const statusItems: { value: TicketStatus; label: string }[] = [
  { value: "dibalas", label: "Dibalas" },
  { value: "menunggu", label: "Menunggu" },
  { value: "ditutup", label: "Ditutup" },
];

const cannedReplies = [
  { id: "salam", label: "Salam pembuka", text: "Halo, terima kasih sudah menghubungi support JagoanSosmed. Kami sedang mengecek kendalamu." },
  { id: "refill", label: "Refill diproses", text: "Refill untuk pesananmu sudah kami ajukan ke provider. Hasilnya akan terlihat dalam 24 jam." },
  { id: "deposit", label: "Deposit dicek", text: "Kami sedang memeriksa deposit-mu. Mohon lampirkan bukti transfer jika belum ada." },
  { id: "tutup", label: "Penutup", text: "Semoga kendalamu sudah teratasi. Tiket ini kami tutup, silakan buat tiket baru jika masih butuh bantuan." },
];

const admins = ["admin", "owner"];

const selectClass =
  "h-9 rounded-xl border border-slate-200 bg-white px-3 text-[10px] text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary dark:border-slate-700 dark:bg-slate-900 dark:text-white";

function ReplyForm({ ticket }: { ticket: AdminTicket }) {
  const run = useAdminRunner();
  const [status, setStatus] = useState<TicketStatus>("dibalas");
  const [draft, setDraft] = useState({ text: "", nonce: 0 });

  // The composer is shared with the user's ticket page. A reply always sets "Dibalas" for the user unless an
  // explicit status is chosen below.
  async function send(text: string, files: File[]): Promise<boolean> {
    const form = new FormData();
    form.set("ticketId", ticket.id);
    form.set("message", text);
    form.set("status", status);
    for (const f of files) form.append("files", f);
    const result = await run(replyAdminTicketForm(form));
    return result.ok;
  }

  return (
    <div className="space-y-2 border-t border-slate-200/70 py-3 dark:border-slate-800">
      <div className="mx-auto flex w-full max-w-[560px] flex-wrap items-center gap-2 px-4">
        <label htmlFor="canned" className="sr-only">
          Balasan cepat
        </label>
        <select
          id="canned"
          value=""
          onChange={(e) => {
            const reply = cannedReplies.find((c) => c.id === e.target.value);
            if (reply) setDraft((d) => ({ text: reply.text, nonce: d.nonce + 1 }));
          }}
          className={selectClass}
        >
          <option value="">Balasan cepat...</option>
          {cannedReplies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <label htmlFor="after-status" className="text-[10px] text-[#5B6B8C] dark:text-slate-400">
          Setelah dikirim:
        </label>
        <select id="after-status" value={status} onChange={(e) => setStatus(e.target.value as TicketStatus)} className={selectClass}>
          {statusItems.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <TicketComposer key={draft.nonce} initialText={draft.text} onSend={send} />
    </div>
  );
}

function NotesTab({ ticket }: { ticket: AdminTicket }) {
  const run = useAdminRunner();
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
      <ul aria-label="Catatan internal" className="thin-scroll flex-1 space-y-2 overflow-y-auto">
        {ticket.internalNotes.length === 0 ? (
          <li className="list-none text-[10px] text-[#5B6B8C] dark:text-slate-400">Belum ada catatan internal.</li>
        ) : (
          ticket.internalNotes.map((n) => (
            <li key={n.id} className="list-none rounded-xl bg-amber-50 px-3 py-2 text-[10.5px] text-ink dark:bg-amber-500/10 dark:text-slate-100">
              <p>{n.text}</p>
              <p className="mt-1 text-[9px] text-[#5B6B8C] dark:text-slate-400">
                {n.by} - <time dateTime={n.at}>{formatDateTime(n.at)}</time>
              </p>
            </li>
          ))
        )}
      </ul>
      <form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          if (text.trim().length < 2) { setError("Catatan terlalu pendek."); return; }
          setError("");
          setBusy(true);
          const result = await run(addTicketNote({ ticketId: ticket.id, text }));
          setBusy(false);
          if (result.ok) setText("");
        }}
        className="mt-3 space-y-2"
      >
        <Textarea label="Catatan internal baru" value={text} onChange={(e) => setText(e.target.value)} error={error} hint="Hanya terlihat oleh admin." className="min-h-[64px]" />
        <Button type="submit" loading={busy}>
          Simpan catatan
        </Button>
      </form>
    </div>
  );
}

export function AdminTicketsView({ tickets }: { tickets: AdminTicket[] }) {
  const run = useAdminRunner();
  const list = useListState<Filter>(useParamFilter<Filter>(filterItems.map((f) => f.value), "semua"), { pageSize: 50 });
  const [activeId, setActiveId] = useState<string | null>(tickets[0]?.id ?? null);
  const [tab, setTab] = useState<"chat" | "notes">("chat");

  const filtered = useMemo(
    () =>
      tickets.filter((t) => {
        if (list.filter !== "semua" && t.status !== list.filter) return false;
        if (!list.debounced) return true;
        return t.id.includes(list.debounced) || t.username.toLowerCase().includes(list.debounced) || t.title.toLowerCase().includes(list.debounced);
      }),
    [tickets, list.filter, list.debounced]
  );
  const active = tickets.find((t) => t.id === activeId) ?? null;

  return (
    <div>
      <PageHeader title="Tiket" subtitle="Balas dan kelola tiket bantuan pengguna." />

      <div className="mt-8 grid gap-4 lg:h-[calc(100vh-300px)] lg:min-h-[520px] lg:grid-cols-[340px_1fr]">
        <section aria-label="Daftar tiket" className="flex min-h-0 flex-col rounded-2xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="space-y-2.5 border-b border-slate-200/70 p-3 dark:border-slate-800">
            <SegmentedControl<Filter> items={filterItems} value={list.filter} onChange={list.setFilter} ariaLabel="Filter status tiket" className="h-10" />
            <SearchPill value={list.query} onChange={list.setQuery} ariaLabel="Cari tiket berdasarkan ID, pengguna, atau judul" />
          </div>
          <ul className="thin-scroll max-h-[360px] flex-1 space-y-1.5 overflow-y-auto p-2 lg:max-h-none">
            {filtered.length === 0 ? (
              <li className="list-none p-4">
                <EmptyState icon={Inbox} title="Tiket tidak ditemukan" />
              </li>
            ) : (
              filtered.map((t) => (
                <li key={t.id} className="list-none">
                  <button
                    type="button"
                    onClick={() => setActiveId(t.id)}
                    aria-current={t.id === activeId ? "true" : undefined}
                    className={cn(
                      "block w-full rounded-xl border p-2.5 text-left transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary",
                      t.id === activeId
                        ? "border-primary-300 bg-primary-50/60 dark:border-primary-border dark:bg-primary-soft"
                        : "border-transparent hover:bg-slate-50 dark:hover:bg-white/5"
                    )}
                  >
                    <p className={cn("flex items-center gap-2 text-[11px] text-ink dark:text-white", t.status === "menunggu" ? "font-semibold" : "font-medium")}>
                      {t.status === "menunggu" ? <span aria-label="Perlu dibalas" className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" /> : null}
                      <span className="truncate">{t.title}</span>
                    </p>
                    <p className="mt-1 text-[9.5px] text-[#5B6B8C] dark:text-slate-400">
                      #{t.id} - {t.username}
                    </p>
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <time dateTime={t.updatedAt} className="text-[9px] text-[#5B6B8C] dark:text-slate-400">
                        {formatDateTime(t.updatedAt)}
                      </time>
                      <TicketStatusChip status={t.status} />
                    </div>
                  </button>
                </li>
              ))
            )}
          </ul>
        </section>

        <section aria-label="Percakapan tiket" className="flex min-h-[420px] min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900">
          {!active ? (
            <div className="flex flex-1 items-center justify-center p-6">
              <EmptyState icon={Inbox} title="Pilih tiket untuk melihat percakapan" />
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 px-4 py-3 dark:border-slate-800">
                <div className="min-w-0">
                  <h2 className="truncate text-[12px] font-semibold text-ink dark:text-white">{active.title}</h2>
                  <p className="text-[9.5px] text-[#5B6B8C] dark:text-slate-400">
                    #{active.id} - {active.username}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <TicketStatusChip status={active.status} />
                  <label htmlFor="assignee" className="sr-only">
                    Ditugaskan ke
                  </label>
                  <select
                    id="assignee"
                    value={active.assignee ?? ""}
                    onChange={(e) => void run(assignTicket({ ticketId: active.id, assignee: e.target.value || null }))}
                    className={selectClass}
                  >
                    <option value="">Belum ditugaskan</option>
                    {admins.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3">
                <div role="tablist" aria-label="Tampilan tiket" className="inline-flex rounded-xl bg-[#F1F6FB] p-1 dark:bg-[#161b20]">
                  {(["chat", "notes"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      role="tab"
                      aria-selected={tab === t}
                      onClick={() => setTab(t)}
                      className={cn(
                        "h-8 rounded-[9px] px-4 text-[10px] font-medium transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary",
                        tab === t ? "bg-white text-ink shadow-sm dark:bg-[#1B2733] dark:text-white" : "text-[#5B6B8C] dark:text-slate-400"
                      )}
                    >
                      {t === "chat" ? "Percakapan" : "Catatan internal"}
                    </button>
                  ))}
                </div>
                <SegmentedControl<TicketStatus>
                  items={statusItems}
                  value={active.status}
                  onChange={(next) => void run(setTicketStatus({ ticketId: active.id, status: next }))}
                  ariaLabel="Ubah status tiket"
                  className="h-9 w-[270px] max-w-full"
                />
              </div>

              {tab === "chat" ? (
                <>
                  <div className="flex min-h-0 flex-1 flex-col">
                    <TicketThread messages={active.messages} username={active.username} />
                  </div>
                  {active.status === "ditutup" ? (
                    <p className="border-t border-slate-200/70 px-4 py-3 text-center text-[10px] text-[#5B6B8C] dark:border-slate-800 dark:text-slate-400">
                      Tiket ditutup ({ticketStatusLabels.ditutup}). Ubah status untuk membalas lagi.
                    </p>
                  ) : (
                    <ReplyForm key={active.id} ticket={active} />
                  )}
                </>
              ) : (
                <NotesTab key={active.id} ticket={active} />
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
