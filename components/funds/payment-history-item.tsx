import { Download, WalletCards } from "lucide-react";
import type { Payment, PaymentStatus } from "@/lib/payments-data";
import { formatDateTime, formatIdr } from "@/lib/balance";
import { cn } from "@/lib/utils";

const statusStyles: Record<PaymentStatus, string> = {
  berhasil: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
  menunggu: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
  gagal: "bg-red-50 text-red-500 dark:bg-red-500/15 dark:text-red-300",
};

const statusLabels: Record<PaymentStatus, string> = {
  berhasil: "Berhasil",
  menunggu: "Menunggu",
  gagal: "Gagal",
};

export function PaymentHistoryItem({ payment }: { payment: Payment }) {
  return (
    <li className="list-none rounded-2xl border border-slate-200/70 p-3 dark:border-slate-800">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-ink dark:text-white">{payment.method}</p>
        <button
          type="button"
          aria-label={`Unduh invoice pembayaran ${payment.id}`}
          className="flex h-6 items-center gap-1 rounded-full border border-slate-200 px-2.5 text-[9px] font-medium text-ink transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
        >
          <Download className="h-3 w-3" aria-hidden />
          Unduh invoice
        </button>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-[10px] font-medium text-ink dark:text-slate-100">
          ID: {payment.id}
          <time dateTime={payment.createdAt} className="ml-2 text-[#5B6B8C] dark:text-slate-400">
            {formatDateTime(payment.createdAt)}
          </time>
        </p>
        <span
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[10px] font-semibold",
            statusStyles[payment.status]
          )}
          title={statusLabels[payment.status]}
        >
          <WalletCards className="h-3.5 w-3.5" aria-hidden />
          {formatIdr(payment.amount)}
          <span className="sr-only"> ({statusLabels[payment.status]})</span>
        </span>
      </div>
    </li>
  );
}
