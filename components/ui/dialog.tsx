"use client";

import { useId } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useDialogA11y } from "@/lib/use-dialog-a11y";
import { DashboardPortal } from "@/components/shared/portal";

/** Centered modal: overlay, focus trap, Escape/overlay close, focus return, aria-modal. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  maxWidth = "max-w-md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  const ref = useDialogA11y<HTMLDivElement>(open, onClose);
  const titleId = useId();
  const descId = useId();

  return (
    <DashboardPortal>
      <AnimatePresence>
        {open ? (
          <motion.div
            key="dialog-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) onClose();
            }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,27,61,0.45)] p-4 backdrop-blur-sm"
          >
            <motion.div
              ref={ref}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              aria-describedby={description ? descId : undefined}
              tabIndex={-1}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className={`max-h-[calc(var(--app-h)-32px)] w-full ${maxWidth} overflow-y-auto overscroll-contain rounded-2xl border border-slate-200/70 bg-white p-5 shadow-xl outline-none dark:border-slate-700 dark:bg-slate-900`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 id={titleId} className="text-[13px] font-semibold text-ink dark:text-white">
                    {title}
                  </h2>
                  {description ? (
                    <p id={descId} className="mt-1 text-[10px] leading-relaxed text-[#5B6B8C] dark:text-slate-400">
                      {description}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  aria-label="Tutup"
                  onClick={onClose}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-ink transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-4">{children}</div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </DashboardPortal>
  );
}
