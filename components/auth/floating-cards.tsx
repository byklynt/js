import { ArrowUpRight, ShoppingBag } from "lucide-react";
import { dashboardPreviewData } from "@/lib/auth-data";

export function FloatingCards({
  followerCard = dashboardPreviewData.floatingFollowerCard,
  storeCard = dashboardPreviewData.floatingStoreCard,
}: {
  followerCard?: { name: string; text: string };
  storeCard?: { label: string; metricLabel: string; value: string; growth: string };
} = {}) {
  const floatingFollowerCard = followerCard;
  const floatingStoreCard = storeCard;

  return (
    <>
      <div className="animate-float-slow absolute left-[6%] bottom-[18%] z-20 flex items-center gap-2.5 rounded-full border border-primary-100 bg-white/95 py-2 pl-2 pr-4 shadow-xl shadow-primary-200/50 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/95">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-300 to-primary-500 text-xs font-bold text-white">
          {floatingFollowerCard.name.charAt(0)}
        </span>
        <span className="whitespace-nowrap text-xs font-semibold text-slate-700 dark:text-slate-200">
          {floatingFollowerCard.text}
        </span>
      </div>

      <div className="animate-float-slower absolute left-[8%] bottom-[5%] z-20 w-52 rounded-2xl border border-primary-100 bg-white/95 p-4 shadow-xl shadow-primary-200/50 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/95">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
          <ShoppingBag className="h-3.5 w-3.5 text-primary-500" />
          {floatingStoreCard.label}
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          {floatingStoreCard.metricLabel}
        </p>
        <div className="mt-0.5 flex items-center justify-between">
          <span className="text-sm font-bold text-slate-900 dark:text-white">
            {floatingStoreCard.value}
          </span>
          <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300">
            <ArrowUpRight className="h-2.5 w-2.5" />
            {floatingStoreCard.growth}
          </span>
        </div>
      </div>
    </>
  );
}
