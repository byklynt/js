"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function CustomSelect<T>({
  label,
  options,
  value,
  onChange,
  getKey,
  renderOption,
  renderValue,
  placeholder,
  disabled,
  emptyMessage = "Tidak ada pilihan tersedia",
  triggerClassName,
}: {
  label: string;
  options: T[];
  value: T | null;
  onChange: (item: T) => void;
  getKey: (item: T) => string;
  renderOption: (item: T) => React.ReactNode;
  renderValue: (item: T) => React.ReactNode;
  placeholder: string;
  disabled?: boolean;
  emptyMessage?: string;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonId = useId();
  const listId = useId();

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <label
        htmlFor={buttonId}
        className="mb-1.5 block text-[10.5px] font-semibold text-ink dark:text-slate-200"
      >
        {label}
      </label>
      <button
        id={buttonId}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-[34px] w-full items-center gap-2 rounded-[10px] border bg-white px-3 text-left text-[10px] text-ink outline-none dark:text-slate-100 transition focus:border-primary-400 focus:ring-4 focus:ring-primary-100 dark:bg-slate-900 dark:focus:ring-primary-900/40",
          disabled
            ? "cursor-not-allowed border-slate-200 opacity-60 dark:border-slate-700"
            : "border-slate-200 hover:border-primary-300 dark:border-slate-700 dark:hover:border-primary-700",
          triggerClassName
        )}
      >
        <span className="min-w-0 flex-1 truncate">
          {value ? (
            renderValue(value)
          ) : (
            <span className="text-slate-400 dark:text-slate-500">{placeholder}</span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-slate-400 transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.ul
            id={listId}
            role="listbox"
            aria-label={label}
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute z-30 mt-2 max-h-64 w-full overflow-auto rounded-xl border border-primary-100 bg-white p-1.5 shadow-xl shadow-primary-100/70 dark:border-slate-700 dark:bg-slate-900 dark:shadow-none"
          >
            {options.length === 0 ? (
              <li className="px-3 py-4 text-center text-[10.5px] text-slate-400">
                {emptyMessage}
              </li>
            ) : (
              options.map((item) => {
                const key = getKey(item);
                const selected = value ? getKey(value) === key : false;
                return (
                  <li key={key} role="option" aria-selected={selected}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(item);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[10.5px] transition",
                        selected
                          ? "bg-primary-50 text-primary-accent dark:bg-primary-950/60 dark:text-primary-300"
                          : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                      )}
                    >
                      {renderOption(item)}
                    </button>
                  </li>
                );
              })
            )}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** Alias used by newer code. */
export { CustomSelect as Select };
