import Link from "next/link";
import type { LucideIcon } from "lucide-react";

/** Shimmering placeholder rows shown while a list loads. */
export function RowsSkeleton({ label, tall = false }: { label: string; tall?: boolean }) {
  return (
    <ul aria-busy="true" aria-label={label} className="space-y-3">
      {Array.from({ length: tall ? 4 : 6 }).map((_, i) => (
        <li
          key={i}
          className="list-none overflow-hidden rounded-2xl border border-slate-200/70 dark:border-slate-800"
        >
          <div className="flex h-[54px] items-center gap-3 px-3">
            <div className="animate-shimmer h-9 w-9 rounded-full" />
            <div className="animate-shimmer h-7 w-24 rounded-full" />
            <div className="animate-shimmer h-4 w-1/3 rounded-md" />
          </div>
          {tall ? (
            <div className="flex gap-2 border-t border-slate-200/70 px-3 py-3 dark:border-slate-800">
              <div className="animate-shimmer h-9 w-36 rounded-full" />
              <div className="animate-shimmer h-9 w-48 rounded-full" />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** Dashed empty state with an optional call-to-action link. */
export function EmptyList({
  icon: Icon,
  title,
  actionHref,
  actionLabel,
}: {
  icon: LucideIcon;
  title: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-primary-200 bg-primary-50/40 px-6 py-20 text-center dark:border-slate-700 dark:bg-slate-900/40">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-primary-accent shadow-sm dark:bg-slate-900">
        <Icon className="h-6 w-6" />
      </span>
      <p className="mt-5 text-[11px] font-semibold text-ink dark:text-slate-200">{title}</p>
      {actionHref && actionLabel ? (
        <Link
          href={actionHref}
          className="mt-4 rounded-xl bg-gradient-to-b from-primary-from to-primary-to px-4 py-2.5 text-[10.5px] font-semibold text-white shadow-[0_2px_0_var(--primary-pressed)] transition hover:brightness-105"
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}

export function ShowMoreButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="mt-5 flex justify-center">
      <button
        type="button"
        onClick={onClick}
        className="h-9 rounded-xl border border-slate-200 px-5 text-[10px] font-medium text-ink transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
      >
        Tampilkan lebih banyak
      </button>
    </div>
  );
}
