"use client";

import { useId } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, type LucideIcon } from "lucide-react";
import { useDialogA11y } from "@/lib/use-dialog-a11y";
import { DashboardPortal } from "@/components/shared/portal";

/**
 * Right-side slide-over (500px, full width on mobile) with overlay, focus trap,
 * Escape/overlay close and focus return.
 */
export function Drawer({
  open,
  onClose,
  title,
  icon: Icon,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const ref = useDialogA11y<HTMLDivElement>(open, onClose);
  const titleId = useId();

  return (
    <DashboardPortal>
      <AnimatePresence>
        {open ? (
          <>
            <motion.div
              key="overlay"
              aria-hidden
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={onClose}
              className="fixed inset-0 z-50 bg-[rgba(15,27,61,0.45)] backdrop-blur-sm"
            />
            <motion.div
              key="drawer"
              ref={ref}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              tabIndex={-1}
              initial={{ x: "calc(100% + 16px)" }}
              animate={{ x: 0 }}
              exit={{ x: "calc(100% + 16px)" }}
              transition={{ duration: 0.28, ease: "easeOut" }}
              className="fixed inset-y-4 right-4 left-4 z-[60] flex flex-col overflow-hidden rounded-2xl bg-white shadow-2xl outline-none md:left-auto md:w-[500px] dark:border dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex items-center justify-between gap-3 px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary-accent">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <h2 id={titleId} className="text-[12px] font-medium text-ink dark:text-white">
                    {title}
                  </h2>
                </div>
                <button
                  type="button"
                  aria-label={`Tutup ${title.toLowerCase()}`}
                  onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-ink transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-slate-700 dark:text-white dark:hover:bg-slate-800"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="h-px bg-slate-200/70 dark:bg-slate-800" />
              <div className="thin-scroll flex-1 overflow-y-auto overscroll-contain p-4">{children}</div>
              {footer ? (
                <div className="border-t border-slate-200/70 p-4 dark:border-slate-800">{footer}</div>
              ) : null}
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </DashboardPortal>
  );
}
