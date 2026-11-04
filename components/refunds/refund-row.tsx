"use client";

import Link from "next/link";
import { CalendarDays, ChartPie, X } from "lucide-react";
import { motion } from "framer-motion";
import { formatDateTime, formatIdr } from "@/lib/balance";
import { refundStatusLabels, type Refund } from "@/lib/refunds-data";
import { StatusChip, type ChipTone } from "@/components/ui/status-chip";

const tones: Record<Refund["status"], ChipTone> = { dibatalkan: "red", sebagian: "amber" };

export function RefundRow({ refund, index }: { refund: Refund; index: number }) {
  const Icon = refund.status === "dibatalkan" ? X : ChartPie;
  return (
    <motion.li
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index, 10) * 0.03, ease: "easeOut" }}
      className="flex list-none flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-2xl border border-slate-200/70 bg-white px-3 py-2.5 md:h-[54px] md:flex-nowrap md:py-0 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href={`/dashboard/orders?search=${refund.orderId}`}
          aria-label={`Lihat pesanan ${refund.orderId}`}
          className="shrink-0 rounded text-[11px] font-medium text-primary-600 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:text-primary-300"
        >
          {refund.orderId}
        </Link>
        <time
          dateTime={refund.createdAt}
          className="flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-ink dark:text-slate-100"
        >
          <CalendarDays className="h-3.5 w-3.5" aria-hidden />
          {formatDateTime(refund.createdAt)}
        </time>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-flex h-8 items-center rounded-full bg-primary-soft px-3 text-[10px] font-semibold text-primary-600 dark:text-primary-accent">
          +{formatIdr(refund.amount)}
        </span>
        <StatusChip label={refundStatusLabels[refund.status]} tone={tones[refund.status]}>
          <Icon aria-hidden className="h-3.5 w-3.5" />
        </StatusChip>
      </div>
    </motion.li>
  );
}
