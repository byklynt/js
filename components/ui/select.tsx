"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { canAutoFocusSearch, useVisualViewportMaxHeight } from "@/lib/use-touch";

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
  searchable,
  getSearchText,
  onSearch,
  loading,
  maxRendered = 60,
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
  /** Shows a search box. Without onSearch the loaded options are filtered locally (needs getSearchText). */
  searchable?: boolean;
  getSearchText?: (item: T) => string;
  /** Server-side search: called (debounced 300 ms) with the typed text; the parent passes the matching options. */
  onSearch?: (query: string) => void;
  loading?: boolean;
  /** Never mount more than this many options (long lists stay light). */
  maxRendered?: number;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (!onSearch || !open) return;
    const t = setTimeout(() => onSearch(query.trim()), 300);
    return () => clearTimeout(t);
    // onSearch identity is the parent's concern; the typed text decides.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open]);
  const needle = query.trim().toLowerCase();
  const filteredOptions =
    searchable && !onSearch && needle && getSearchText ? options.filter((o) => getSearchText(o).toLowerCase().includes(needle)) : options;
  const shownOptions = filteredOptions.slice(0, maxRendered);
  const hiddenCount = filteredOptions.length - shownOptions.length;
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listMaxHeight = useVisualViewportMaxHeight(open, triggerRef, 256);
  const buttonId = useId();
  const listId = useId();

  // Desktop: the search field takes focus when the list opens. Touch: no, the keyboard would cover the list (tap the field to type).
  useEffect(() => {
    if (open && searchable && canAutoFocusSearch()) searchRef.current?.focus();
  }, [open, searchable]);

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
        ref={triggerRef}
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
            style={{ maxHeight: listMaxHeight }}
            className="absolute z-30 mt-2 w-full overflow-auto overscroll-contain rounded-xl border border-primary-100 bg-white p-1.5 shadow-xl shadow-primary-100/70 dark:border-slate-700 dark:bg-slate-900 dark:shadow-none"
          >
            {searchable ? (
              <li role="presentation" className="sticky top-0 z-10 bg-white p-1 dark:bg-slate-900">
                <input
                  type="text"
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Cari..."
                  aria-label={`Cari ${label}`}
                  className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-[10.5px] text-ink outline-none focus:border-primary-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </li>
            ) : null}
            {loading && options.length === 0 ? (
              <li role="status" className="px-3 py-4 text-center text-[10.5px] text-slate-400">
                Memuat...
              </li>
            ) : filteredOptions.length === 0 ? (
              <li className="px-3 py-4 text-center text-[10.5px] text-slate-400">
                {emptyMessage}
              </li>
            ) : (
              shownOptions.map((item) => {
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
            {hiddenCount > 0 ? (
              <li role="presentation" className="px-3 py-2 text-center text-[10px] text-slate-400">
                +{hiddenCount.toLocaleString("id-ID")} lainnya. Ketik untuk mencari.
              </li>
            ) : null}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** Alias used by newer code. */
export { CustomSelect as Select };
