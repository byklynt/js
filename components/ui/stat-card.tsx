import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";
import type { StatTone } from "@/lib/dashboard-data";

const toneClasses: Record<StatTone, { icon: string; strip: string }> = {
  sky: {
    icon: "text-primary-500 dark:text-primary-accent",
    strip:
      "bg-primary-soft text-primary-600 hover:bg-primary-border dark:text-primary-accent dark:hover:bg-primary-border",
  },
  amber: {
    icon: "text-orange-500 dark:text-primary-accent",
    strip:
      "bg-[#FEF1E7] text-orange-600 hover:bg-[#FCE7D6] dark:bg-primary-soft dark:text-primary-accent dark:hover:bg-primary-border",
  },
  emerald: {
    icon: "text-emerald-500 dark:text-primary-accent",
    strip:
      "bg-[#E8F7EE] text-emerald-600 hover:bg-[#D8F0E2] dark:bg-primary-soft dark:text-primary-accent dark:hover:bg-primary-border",
  },
  /** Neutral: used by "Perlu Tindakan" cards whose count is 0. */
  slate: {
    icon: "text-slate-400 dark:text-slate-500",
    strip: "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700",
  },
  rose: {
    icon: "text-red-500 dark:text-primary-accent",
    strip:
      "bg-[#FDECEC] text-red-500 hover:bg-[#FBDCDC] dark:bg-primary-soft dark:text-primary-accent dark:hover:bg-primary-border",
  },
};

export function StatCard({
  label,
  value,
  icon: Icon,
  tone,
  actionLabel,
  actionHref,
  delta,
  compact,
}: {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  tone: StatTone;
  actionLabel: string;
  actionHref: string;
  /** Change versus the previous period. `good` decides the colour (costs going up are bad). */
  delta?: { text: string; good: boolean } | null;
  /** Hide the icon below the sm breakpoint so two cards fit side by side on phones. */
  compact?: boolean;
}) {
  const classes = toneClasses[tone];

  return (
    <div className="relative z-10 flex h-[115px] flex-col gap-2 rounded-2xl border border-slate-200/80 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-1 items-center gap-3 px-1.5">
        <span
          className={`${compact ? "max-sm:hidden " : ""}flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary-100 bg-gradient-to-br from-white to-primary-50 dark:border-primary-border dark:from-primary-soft dark:to-primary-soft ${classes.icon}`}
        >
          <Icon className="h-5 w-5 stroke-[1.75]" />
        </span>
        <span className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[10px] text-[#5B6B8C] dark:text-slate-400">
            <span className="truncate">{label}</span>
            {delta ? (
              <span
                className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${delta.good ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-red-50 text-red-500 dark:bg-red-500/15 dark:text-red-300"}`}
              >
                {delta.text}
              </span>
            ) : null}
          </p>
          <p className="truncate text-[22px] leading-tight font-medium tracking-[-0.015em] text-ink dark:text-white">
            {value}
          </p>
        </span>
      </div>
      <Link
        href={actionHref}
        className={`flex h-[34px] shrink-0 items-center justify-between rounded-[10px] px-3 text-[9.5px] font-medium transition ${classes.strip}`}
      >
        {actionLabel}
        <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}
