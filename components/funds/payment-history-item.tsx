import Link from "next/link";
import { WalletCards } from "lucide-react";
import type { PaymentStatus } from "@/lib/payments-data";
import type { MyDeposit } from "@/lib/user-actions";
import { formatDateTime, formatIdr } from "@/lib/balance";
import { cn } from "@/lib/utils";

const statusStyles: Record<PaymentStatus, string> = {
  berhasil: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
  menunggu: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
  gagal: "bg-red-50 text-red-500 dark:bg-red-500/15 dark:text-red-300",
  kedaluwarsa: "bg-slate-100 text-slate-500 dark:bg-slate-500/15 dark:text-slate-300",
  dibatalkan: "bg-slate-100 text-slate-500 dark:bg-slate-500/15 dark:text-slate-300",
};

const statusLabels: Record<PaymentStatus, string> = {
  berhasil: "Berhasil",
  menunggu: "Menunggu",
  gagal: "Gagal",
  kedaluwarsa: "Kedaluwarsa",
  dibatalkan: "Dibatalkan",
};

export function PaymentHistoryItem({ payment }: { payment: MyDeposit }) {
  return (
    <li className="list-none rounded-2xl border border-slate-200/70 p-3 dark:border-slate-800">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-ink dark:text-white">{payment.method}</p>
        {payment.gateway ? (
          <Link href={`/deposit/${payment.id}`} className="text-[10px] font-medium text-primary-accent underline-offset-2 hover:underline">
            {payment.status === "menunggu" ? "Lanjutkan pembayaran" : "Lihat detail"}
          </Link>
        ) : null}
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
