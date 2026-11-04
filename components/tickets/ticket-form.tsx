"use client";

import { useId, useState } from "react";
import { History, Inbox, Loader2, Send } from "lucide-react";
import {
  maxMessageLength,
  orderIdRequiredSubcategories,
  ticketCategories,
  ticketSubcategories,
  type TicketCategory,
} from "@/lib/tickets-data";
import { createTicket } from "@/lib/dashboard-actions";
import { useRouter } from "next/navigation";
import { refreshTicketBadge } from "@/lib/tickets-store";
import { useToast } from "@/components/shared/toast";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";
import { FileAttach } from "./file-attach";
import { TicketHistoryModal } from "./ticket-history-modal";

const MIN_MESSAGE = 10;
const orderIdPattern = /^\d+(\s*,\s*\d+)*$/;

const inputClass =
  "w-full rounded-xl border bg-white px-3.5 text-[10px] text-ink outline-none transition placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary-ring focus:shadow-[0_0_0_5px_var(--primary-soft)] dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-600";

export function TicketForm() {
  const toast = useToast();
  const router = useRouter();
  const orderId = useId();
  const orderErrorId = useId();
  const messageId = useId();
  const messageErrorId = useId();

  const [category, setCategory] = useState<TicketCategory>("pesanan");
  const [subcategory, setSubcategory] = useState(ticketSubcategories.pesanan[0]);
  const [orderIdsText, setOrderIdsText] = useState("");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const categoryLabel = ticketCategories.find((c) => c.value === category)?.label ?? "";
  const showOrderId = category === "pesanan";
  const orderIdRequired = showOrderId && orderIdRequiredSubcategories.includes(subcategory);

  const trimmedOrderIds = orderIdsText.trim();
  let orderError = "";
  if (showOrderId) {
    if (orderIdRequired && !trimmedOrderIds) orderError = "ID pesanan wajib diisi.";
    else if (trimmedOrderIds && !orderIdPattern.test(trimmedOrderIds))
      orderError = "Gunakan angka dipisah koma, contoh: 7112481, 7025157.";
  }
  const messageTooShort = message.trim().length < MIN_MESSAGE;
  const messageError =
    submitted && messageTooShort ? `Pesan minimal ${MIN_MESSAGE} karakter.` : "";
  const shownOrderError = submitted ? orderError : "";

  function handleCategory(next: TicketCategory) {
    setCategory(next);
    setSubcategory(ticketSubcategories[next][0]);
    setSubmitted(false);
    if (next !== "pesanan") setOrderIdsText("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (messageTooShort || orderError || submitting) return;
    setSubmitting(true);
    try {
      const orderIds = trimmedOrderIds ? trimmedOrderIds.split(/\s*,\s*/) : [];
      const result = await createTicket({
        category: categoryLabel,
        subcategory,
        orderIds,
        message: message.trim(),
        files,
      });
      if (result.success) {
        toast("Tiket berhasil dikirim");
        setMessage("");
        setOrderIdsText("");
        setFiles([]);
        setSubmitted(false);
        refreshTicketBadge();
        // The user does not stay on the form: go straight to the new ticket.
        router.push(result.redirectTo);
      } else {
        toast(result.message, "error");
      }
    } catch {
      toast("Gagal mengirim tiket. Coba lagi.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <section
        aria-labelledby="ticket-form-title"
        className="relative z-10 mx-auto w-full max-w-[524px] rounded-3xl border border-slate-200/70 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary-accent">
              <Inbox className="h-4 w-4" aria-hidden />
            </span>
            <h2 id="ticket-form-title" className="text-[13px] font-semibold text-ink dark:text-white">
              Tiket
            </h2>
          </div>
          <button
            type="button"
            aria-label="Riwayat tiket"
            aria-haspopup="dialog"
            onClick={() => setHistoryOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-ink transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-slate-700 dark:text-white dark:hover:bg-slate-800"
          >
            <History className="h-4 w-4" />
          </button>
        </div>

        <form noValidate onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <p id="ticket-category-label" className="mb-1.5 text-[10.5px] font-semibold text-ink dark:text-slate-200">
              Kategori
            </p>
            <SegmentedControl<TicketCategory>
              items={ticketCategories.map((c) => ({ value: c.value, label: c.label }))}
              value={category}
              onChange={handleCategory}
              ariaLabel="Kategori tiket"
            />
          </div>

          <div>
            <p className="mb-1.5 text-[10.5px] font-semibold text-ink dark:text-slate-200">
              Subkategori
            </p>
            <SegmentedControl<string>
              items={ticketSubcategories[category].map((s) => ({ value: s, label: s }))}
              value={subcategory}
              onChange={setSubcategory}
              ariaLabel="Subkategori tiket"
            />
          </div>

          {showOrderId ? (
            <div>
              <label htmlFor={orderId} className="mb-1.5 block text-[10.5px] font-semibold text-ink dark:text-slate-200">
                ID Pesanan{orderIdRequired ? "" : " (opsional)"}
              </label>
              <input
                id={orderId}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={orderIdsText}
                onChange={(e) => setOrderIdsText(e.target.value.replace(/[^\d,\s]/g, ""))}
                placeholder="Contoh: 7112481"
                aria-invalid={Boolean(shownOrderError)}
                aria-describedby={shownOrderError ? orderErrorId : undefined}
                className={cn(
                  inputClass,
                  "h-[38px]",
                  shownOrderError ? "border-red-300 dark:border-red-900" : "border-slate-200 dark:border-slate-700"
                )}
              />
              {shownOrderError ? (
                <p id={orderErrorId} className="mt-1.5 text-[9.5px] font-medium text-red-500">
                  {shownOrderError}
                </p>
              ) : null}
            </div>
          ) : null}

          <div>
            <label htmlFor={messageId} className="mb-1.5 block text-[10.5px] font-semibold text-ink dark:text-slate-200">
              Pesan
            </label>
            <textarea
              id={messageId}
              value={message}
              maxLength={maxMessageLength}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Jelaskan kendalamu sedetail mungkin"
              aria-invalid={Boolean(messageError)}
              aria-describedby={messageError ? messageErrorId : undefined}
              className={cn(
                inputClass,
                "min-h-[135px] resize-y py-3",
                messageError ? "border-red-300 dark:border-red-900" : "border-slate-200 dark:border-slate-700"
              )}
            />
            <div className="mt-1.5 flex items-start justify-between gap-3">
              {messageError ? (
                <p id={messageErrorId} className="text-[9.5px] font-medium text-red-500">
                  {messageError}
                </p>
              ) : (
                <span />
              )}
              <span className="text-[9.5px] text-[#5B6B8C] dark:text-slate-400" aria-live="off">
                {message.length}/{maxMessageLength.toLocaleString("id-ID")}
              </span>
            </div>
          </div>

          <FileAttach files={files} onChange={setFiles} />

          <button
            type="submit"
            disabled={messageTooShort || submitting}
            className="flex h-[38px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-primary-from to-primary-to text-[10px] font-semibold text-white shadow-[0_2px_0_var(--primary-pressed)] transition hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60 dark:border dark:border-white/25 dark:shadow-[0_2px_0_var(--primary-pressed)]"
          >
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Mengirim...
              </>
            ) : (
              <>
                Kirim tiket
                <Send className="h-3.5 w-3.5" />
              </>
            )}
          </button>
        </form>
      </section>

      <TicketHistoryModal open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </>
  );
}
