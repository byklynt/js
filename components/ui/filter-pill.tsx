"use client";

import { createElement, useRef, useState, type ComponentType } from "react";
import { Check, ChevronDown, Funnel } from "lucide-react";

/** Options mounted at once; a long list is reached through the search box. */
const RENDER_LIMIT = 60;
import { useClickOutside } from "@/lib/use-click-outside";
import { useVisualViewportMaxHeight } from "@/lib/use-touch";
import { cn } from "@/lib/utils";

export type FilterOption<T extends string> = { id: T; label: string; /** Optional glyph before the label (platform / category icon). */ icon?: ComponentType<{ className?: string }> };

/** Rounded-full pill with a tinted funnel circle that opens a single-select popover. */
export function FilterPill<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  searchable,
}: {
  options: FilterOption<T>[];
  value: T;
  onChange: (next: T) => void;
  ariaLabel: string;
  /** Adds a search box (for long lists). */
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const matching = needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;
  const shown = matching.slice(0, RENDER_LIMIT);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
  const current = options.find((o) => o.id === value);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listMaxHeight = useVisualViewportMaxHeight(open, triggerRef, 320);

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-[38px] items-center gap-2 rounded-full border border-slate-200/70 bg-white py-1 pr-3 pl-1 text-[10.5px] font-medium text-ink transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-50 text-primary-accent dark:bg-primary-soft">
          <Funnel className="h-3.5 w-3.5" />
        </span>
        {current?.icon ? createElement(current.icon, { className: "h-3.5 w-3.5 shrink-0" }) : null}
        {current?.label}
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <ul
          role="listbox"
          aria-label={ariaLabel}
          style={{ maxHeight: listMaxHeight }}
          className={cn(
            "absolute left-0 z-30 mt-2 w-52 max-w-[calc(100vw-2rem)] overflow-auto overscroll-contain rounded-xl border border-slate-200/70 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900",
            options.length > RENDER_LIMIT && "w-72"
          )}
        >
          {searchable ? (
            <li role="presentation" className="sticky top-0 z-10 bg-white p-1 dark:bg-slate-900">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari..."
                aria-label={`Cari ${ariaLabel}`}
                className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-[10.5px] text-ink outline-none focus:border-primary-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </li>
          ) : null}
          {shown.map((o) => (
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
                <span className="flex min-w-0 items-center gap-2">
                  {o.icon ? createElement(o.icon, { className: "h-3.5 w-3.5 shrink-0" }) : null}
                  <span className="truncate">{o.label}</span>
                </span>
                {o.id === value ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
              </button>
            </li>
          ))}
          {matching.length > shown.length ? (
            <li role="presentation" className="px-2.5 py-2 text-center text-[10px] text-slate-400">
              +{(matching.length - shown.length).toLocaleString("id-ID")} lainnya. Ketik untuk mencari.
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
