"use client";

import { useState } from "react";
import { Check, ChevronDown, Funnel } from "lucide-react";
import { useClickOutside } from "@/lib/use-click-outside";
import { cn } from "@/lib/utils";

export type FilterOption<T extends string> = { id: T; label: string };

/** Rounded-full pill with a tinted funnel circle that opens a single-select popover. */
export function FilterPill<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: FilterOption<T>[];
  value: T;
  onChange: (next: T) => void;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
  const current = options.find((o) => o.id === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-[38px] items-center gap-2 rounded-full border border-slate-200/70 bg-white py-1 pr-3 pl-1 text-[10.5px] font-medium text-ink transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-50 text-primary-accent dark:bg-primary-soft">
          <Funnel className="h-3.5 w-3.5" />
        </span>
        {current?.label}
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <ul
          role="listbox"
          aria-label={ariaLabel}
          className="absolute left-0 z-30 mt-2 w-52 rounded-xl border border-slate-200/70 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        >
          {options.map((o) => (
            <li key={o.id} role="option" aria-selected={o.id === value}>
              <button
                type="button"
                onClick={() => {
                  onChange(o.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[10.5px] transition",
                  o.id === value
                    ? "bg-primary-50 font-medium text-primary-accent dark:bg-primary-soft"
                    : "text-ink hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                )}
              >
                {o.label}
                {o.id === value ? <Check className="h-3.5 w-3.5" /> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
