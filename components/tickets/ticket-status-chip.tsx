"use client";

import { Check, Clock, Lock } from "lucide-react";
import { type TicketStatus } from "@/lib/tickets-data";
import { useLanguage } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

const styles: Record<TicketStatus, string> = {
  dibalas: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  menunggu: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  ditutup: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300",
};

const icons = { dibalas: Check, menunggu: Clock, ditutup: Lock } as const;

export function TicketStatusChip({ status }: { status: TicketStatus }) {
  const Icon = icons[status];
  const { t } = useLanguage();
  return (
    <span
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-2 rounded-full px-3 text-[10px] font-medium whitespace-nowrap",
        styles[status]
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {t(`ticketStatus.${status}` as const)}
    </span>
  );
}
