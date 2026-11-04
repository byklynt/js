import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import type { LedgerEntry, LedgerType } from "@/lib/server/types";
import { formatDateTime, formatIdr } from "@/lib/balance";
import { StatusChip, type ChipTone } from "@/components/ui/status-chip";

export const ledgerTypeLabels: Record<LedgerType, string> = {
  deposit: "Deposit",
  order: "Pesanan",
  refund: "Refund",
  adjustment: "Penyesuaian",
  bonus: "Bonus",
};

export const ledgerFilterOptions: { id: LedgerType | "semua"; label: string }[] = [
  { id: "semua", label: "Semua" },
  { id: "deposit", label: "Deposit" },
  { id: "order", label: "Pesanan" },
  { id: "refund", label: "Refund" },
  { id: "bonus", label: "Bonus" },
  { id: "adjustment", label: "Penyesuaian" },
];

const tone: Record<LedgerType, ChipTone> = { deposit: "emerald", order: "slate", refund: "sky", adjustment: "amber", bonus: "purple" };

/** Compact list of balance mutations. Used by /admin/ledger, the admin user drawer and /dashboard/ledger. */
export function LedgerList({ entries, showUser, userNames }: { entries: LedgerEntry[]; showUser?: boolean; userNames?: Record<string, string> }) {
  return (
    <ul className="space-y-2">
      {entries.map((l) => {
        const credit = l.amount > 0;
        const Icon = credit ? ArrowDownLeft : ArrowUpRight;
        return (
          <li key={l.id} className="flex flex-col gap-2 rounded-2xl border border-slate-200/70 bg-white px-3 py-2.5 md:flex-row md:items-center md:justify-between dark:border-slate-800 dark:bg-slate-900">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] font-medium text-ink dark:text-white">
                <StatusChip label={ledgerTypeLabels[l.type]} tone={tone[l.type]} />
                {showUser ? <span>{userNames?.[l.userId] ?? l.userId}</span> : null}
              </p>
              <p className="mt-1 truncate text-[10px] text-[#5B6B8C] dark:text-slate-400" title={l.note}>
                {l.note} <span aria-hidden>&bull;</span> <time dateTime={l.createdAt}>{formatDateTime(l.createdAt)}</time>
              </p>
            </div>
            <div className="flex items-center gap-3 md:text-right">
              <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${credit ? "text-emerald-600 dark:text-emerald-300" : "text-ink dark:text-white"}`}>
                <Icon className="h-3.5 w-3.5" aria-hidden />
                <span className="sr-only">{credit ? "Masuk" : "Keluar"}</span>
                {credit ? "+" : "-"}
                {formatIdr(Math.abs(l.amount))}
              </span>
              <span className="text-[10px] text-[#5B6B8C] dark:text-slate-400">Saldo {formatIdr(l.balanceAfter)}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
