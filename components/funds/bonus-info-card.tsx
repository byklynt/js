import { Info } from "lucide-react";
import { formatIdr } from "@/lib/balance";

/** Bonus tiers come from the admin settings. No tiers = no card (no invented promos). */
export function BonusInfoCard({ tiers }: { tiers: { min: number; percent: number }[] }) {
  if (tiers.length === 0) return null;
  return (
    <section aria-labelledby="bonus-title" className="mt-4 rounded-3xl border border-slate-200/70 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <Info className="h-[18px] w-[18px] text-ink dark:text-white" aria-hidden />
      <h2 id="bonus-title" className="mt-3.5 text-[13px] font-semibold text-ink dark:text-white">
        Bonus deposit
      </h2>
      <ul className="mt-2 space-y-1 text-[10px] leading-[1.9] text-[#5B6B8C] dark:text-slate-400">
        {[...tiers].sort((a, b) => a.min - b.min).map((t) => (
          <li key={t.min} className="list-none">
            Deposit {formatIdr(t.min)} atau lebih: bonus {t.percent}%
          </li>
        ))}
      </ul>
    </section>
  );
}
