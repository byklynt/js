"use client";

import { cn } from "@/lib/utils";

export type SegmentedItem<T extends string | number> = { value: T; label: string };

/** Light blue-grey bar with equal segments; the selected segment is a white pill. */
export function SegmentedControl<T extends string | number>({
  items,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  items: SegmentedItem<T>[];
  value: T | null;
  onChange: (next: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      className={cn(
        "grid h-12 items-center gap-1 rounded-xl bg-[#F1F6FB] p-1 dark:bg-[#161b20]",
        className
      )}
    >
      {items.map((item) => {
        const active = value === item.value;
        return (
          <button
            key={String(item.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(item.value)}
            className={cn(
              "flex h-full items-center justify-center rounded-[10px] border px-1 text-center text-[9.5px] leading-tight font-medium transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary",
              active
                ? "border-slate-200/80 bg-white text-ink shadow-sm dark:border-transparent dark:bg-[#1B2733] dark:text-white"
                : "border-transparent text-ink hover:bg-white/60 dark:text-slate-100 dark:hover:bg-white/5"
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
