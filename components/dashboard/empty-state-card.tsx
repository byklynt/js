import type { LucideIcon } from "lucide-react";
import { dashboardCopy } from "@/lib/dashboard-data";

export function EmptyStateCard({
  icon: Icon,
  title,
  description = dashboardCopy.placeholderBody,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
}) {
  return (
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
        {title}
      </h1>

      <div className="mt-6 flex flex-col items-center justify-center rounded-3xl border border-dashed border-primary-200 bg-primary-50/40 px-6 py-20 text-center dark:border-slate-700 dark:bg-slate-900/40">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-primary-500 shadow-sm dark:bg-slate-900">
          <Icon className="h-6 w-6" />
        </span>
        <p className="mt-5 text-sm font-semibold text-slate-700 dark:text-slate-200">
          Segera Hadir
        </p>
        <p className="mt-1.5 max-w-sm text-sm text-slate-500 dark:text-slate-400">
          {description}
        </p>
      </div>
    </div>
  );
}
