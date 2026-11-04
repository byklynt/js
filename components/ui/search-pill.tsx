"use client";

import { Search } from "lucide-react";

/** Rounded-full search input with a blue circular submit button. */
export function SearchPill({
  value,
  onChange,
  ariaLabel,
  placeholder = "Cari",
}: {
  value: string;
  onChange: (next: string) => void;
  ariaLabel: string;
  placeholder?: string;
}) {
  return (
    <form
      role="search"
      onSubmit={(e) => e.preventDefault()}
      className="flex h-[38px] w-full max-w-[200px] items-center rounded-full border border-slate-200/70 bg-white pr-1 pl-4 dark:border-slate-700 dark:bg-slate-900"
    >
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="min-w-0 flex-1 bg-transparent text-[10px] text-ink outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-600"
      />
      <button
        type="submit"
        aria-label="Cari"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-accent transition hover:bg-primary-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:bg-primary-soft dark:hover:bg-primary-border"
      >
        <Search className="h-3.5 w-3.5" />
      </button>
    </form>
  );
}
