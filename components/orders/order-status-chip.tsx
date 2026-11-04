"use client";

import { Check, Clock, ChartPie, LoaderCircle, Loader, X } from "lucide-react";
import { type OrderStatus } from "@/lib/orders-data";
import { useLanguage } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

const styles: Record<OrderStatus, string> = {
  berjalan: "bg-primary-50 text-primary-600 dark:bg-primary-500/15 dark:text-primary-300",
  diproses: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300",
  selesai: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
  dibatalkan: "bg-red-50 text-red-500 dark:bg-red-500/15 dark:text-red-300",
  menunggu: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
  sebagian: "bg-purple-50 text-purple-600 dark:bg-purple-500/15 dark:text-purple-300",
  gagal_kirim: "bg-red-50 text-red-500 dark:bg-red-500/15 dark:text-red-300",
};

function StatusIcon({ status }: { status: OrderStatus }) {
  const cls = "h-3.5 w-3.5";
  switch (status) {
    case "berjalan":
      return (
        <LoaderCircle
          aria-hidden
          className={cn(cls, "animate-spin [animation-duration:1.6s]")}
          strokeDasharray="3 3"
        />
      );
    case "diproses":
      return <Loader aria-hidden className={cn(cls, "animate-spin [animation-duration:2.4s]")} />;
    case "selesai":
      return <Check aria-hidden className={cls} />;
    case "dibatalkan":
    case "gagal_kirim":
      return <X aria-hidden className={cls} />;
    case "menunggu":
      return <Clock aria-hidden className={cls} />;
    case "sebagian":
      return <ChartPie aria-hidden className={cls} />;
  }
}

export function OrderStatusChip({ status }: { status: OrderStatus }) {
  const { t } = useLanguage();
  return (
    <span
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[10px] font-medium whitespace-nowrap",
        styles[status]
      )}
    >
      {t(`orderStatus.${status}` as const)}
      <StatusIcon status={status} />
    </span>
  );
}
