"use client";

import { CalendarDays, TriangleAlert } from "lucide-react";
import { motion } from "framer-motion";
import { platforms } from "@/lib/dashboard-data";
import { formatDateTime } from "@/lib/balance";
import { cn } from "@/lib/utils";

/**
 * Two-row card shared by orders and refills.
 * Top row: platform icon, checkbox, ID pill, name, date, status, report button.
 * Bottom row: free-form chips/actions (children).
 */
export function RecordCard({
  index,
  platform,
  idLabel,
  checkboxLabel,
  selected,
  onToggleSelect,
  name,
  dateIso,
  status,
  onReport,
  actions,
  children,
}: {
  index: number;
  platform: string;
  idLabel: string;
  checkboxLabel: string;
  selected: boolean;
  onToggleSelect: () => void;
  name: string;
  dateIso: string;
  status: React.ReactNode;
  onReport?: () => void;
  /** Replaces the report button (e.g. an admin action menu). */
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const platformInfo = platforms.find((p) => p.id === platform);

  return (
    <motion.li
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index, 8) * 0.04, ease: "easeOut" }}
      className={cn(
        "list-none overflow-hidden rounded-2xl border bg-white dark:bg-slate-900",
        selected
          ? "border-primary-300 dark:border-primary-border"
          : "border-slate-200/70 dark:border-slate-800"
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 md:flex-nowrap">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-50 text-ink dark:bg-slate-800 dark:text-white">
          {platformInfo ? <platformInfo.icon className="h-[18px] w-[18px]" /> : null}
        </span>

        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          aria-label={checkboxLabel}
          className="h-5 w-5 shrink-0 cursor-pointer appearance-none rounded-md border border-slate-300 bg-white transition checked:border-primary checked:bg-primary checked:bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20viewBox=%270%200%2016%2016%27%20fill=%27none%27%20stroke=%27white%27%20stroke-width=%272.2%27%20stroke-linecap=%27round%27%20stroke-linejoin=%27round%27%3E%3Cpath%20d=%27M3.5%208.5l3%203%206-6.5%27/%3E%3C/svg%3E')] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-slate-600 dark:bg-slate-900"
        />

        <span className="shrink-0 rounded-full bg-primary-solid px-3 py-1.5 text-[10px] font-semibold text-white">
          {idLabel}
        </span>

        <h3 className="order-last w-full min-w-0 text-[12px] font-medium text-ink md:order-none md:w-auto dark:text-white">
          {name}
        </h3>

        <time
          dateTime={dateIso}
          className="flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-ink dark:text-slate-100"
        >
          <CalendarDays className="h-3.5 w-3.5" aria-hidden />
          {formatDateTime(dateIso)}
        </time>

        <div className="order-last flex w-full items-center justify-between gap-2 md:order-none md:ml-auto md:w-auto md:justify-end">
          {status}
          {actions ?? (
          <button
            type="button"
            aria-label="Laporkan masalah"
            title="Laporkan masalah"
            onClick={onReport}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-ink transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
          >
            <TriangleAlert className="h-4 w-4" />
          </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-200/70 px-3 py-2.5 dark:border-slate-800">
        {children}
      </div>
    </motion.li>
  );
}
