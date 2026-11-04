"use client";

import { useId, useState } from "react";
import { Info } from "lucide-react";

/** Info icon button whose tooltip opens on hover and keyboard focus (Escape closes it). */
export function InfoTooltip({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        className="flex h-6 w-6 items-center justify-center rounded-full text-ink transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary dark:text-slate-100 dark:hover:bg-slate-800"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <span
          id={id}
          role="tooltip"
          className="pointer-events-none absolute right-0 bottom-full z-30 mb-2 w-max max-w-[240px] rounded-lg bg-[#0b0f14] px-2.5 py-1.5 text-[10px] leading-snug font-medium text-white shadow-lg dark:border dark:border-slate-600"
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}
