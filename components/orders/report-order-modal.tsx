"use client";

import { useId, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, X } from "lucide-react";
import type { Order } from "@/lib/orders-data";
import { reportOrder } from "@/lib/dashboard-actions";
import { useDialogA11y } from "@/lib/use-dialog-a11y";
import { DashboardPortal } from "@/components/shared/portal";
import { useToast } from "@/components/shared/toast";

export function ReportOrderModal({
  order,
  onClose,
  noun = "Pesanan",
}: {
  order: Pick<Order, "id"> | null;
  onClose: () => void;
  /** What the ticket refers to, e.g. "Pesanan" or "Refill". */
  noun?: string;
}) {
  const ref = useDialogA11y<HTMLDivElement>(Boolean(order), onClose);
  const titleId = useId();
  const fieldId = useId();
  const errorId = useId();
  const toast = useToast();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!order) return;
    if (message.trim().length < 10) {
      setError("Jelaskan masalahnya minimal 10 karakter.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const result = await reportOrder({ orderId: order.id, message: message.trim() });
      if (result.success) {
        toast(`Laporan untuk ${noun.toLowerCase()} #${order.id} terkirim`);
        setMessage("");
        onClose();
      } else {
        setError(result.message);
      }
    } catch {
      setError("Gagal mengirim laporan. Coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DashboardPortal>
    <AnimatePresence>
      {order ? (
        <motion.div
          key="report"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,27,61,0.45)] p-4 backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="w-full max-w-md rounded-2xl border border-slate-200/70 bg-white p-5 shadow-xl outline-none dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id={titleId} className="text-[13px] font-semibold text-ink dark:text-white">
                  Laporkan masalah
                </h2>
                <p className="mt-1 text-[10px] text-[#5B6B8C] dark:text-slate-400">
                  {noun} #{order.id} akan dilampirkan ke tiket baru.
                </p>
              </div>
              <button
                type="button"
                aria-label="Tutup"
                onClick={onClose}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-ink transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form noValidate onSubmit={handleSubmit} className="mt-4">
              <label
                htmlFor={fieldId}
                className="mb-1.5 block text-[10.5px] font-semibold text-ink dark:text-slate-200"
              >
                Ceritakan masalahnya
              </label>
              <textarea
                id={fieldId}
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? errorId : undefined}
                placeholder="Contoh: jumlah yang masuk belum sesuai pesanan."
                className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2.5 text-[10px] text-ink outline-none transition placeholder:text-slate-400 focus:border-primary-400 focus:ring-4 focus:ring-primary-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-600 dark:focus:ring-primary-900/40"
              />
              {error ? (
                <p id={errorId} className="mt-1.5 text-[9.5px] font-medium text-red-500">
                  {error}
                </p>
              ) : null}
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-9 rounded-xl border border-slate-200 px-4 text-[10px] font-medium text-ink transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex h-9 items-center gap-2 rounded-xl bg-gradient-to-b from-primary-from to-primary-to px-4 text-[10px] font-semibold text-white shadow-[0_2px_0_var(--primary-pressed)] transition hover:brightness-105 disabled:opacity-60"
                >
                  {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Kirim laporan
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
    </DashboardPortal>
  );
}
