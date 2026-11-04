"use client";

import { useState } from "react";
import { Filter, ChevronDown, Check } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { categories, getCategoryIcon } from "@/lib/dashboard-data";
import { useClickOutside } from "@/lib/use-click-outside";
import { cn } from "@/lib/utils";

export function CategoryFilter({
  selectedIds,
  onChange,
}: {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));

  const allSelected = selectedIds.length === 0;

  function toggleCategory(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((i) => i !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-slate-200/70 bg-white py-2 pl-2 pr-3 text-[10.5px] font-semibold text-slate-600 transition hover:border-primary-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-50 text-primary-accent dark:bg-primary-950/60 dark:text-primary-300">
          <Filter className="h-3.5 w-3.5" />
        </span>
        Kategori
        {selectedIds.length > 0 ? (
          <span className="rounded-full bg-primary-solid px-1.5 text-[9.5px] font-bold text-white">
            {selectedIds.length}
          </span>
        ) : null}
        <ChevronDown
          className={cn("h-3.5 w-3.5 text-slate-400 transition-transform", open && "rotate-180")}
        />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            role="menu"
            aria-label="Filter kategori"
            className="absolute left-0 z-30 mt-2 max-h-80 w-64 overflow-auto rounded-xl border border-primary-100 bg-white p-1.5 shadow-xl shadow-primary-100/70 dark:border-slate-700 dark:bg-slate-900 dark:shadow-none"
          >
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={allSelected}
              onClick={() => onChange([])}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[10.5px] transition",
                allSelected
                  ? "bg-primary-50 text-primary-accent dark:bg-primary-950/60 dark:text-primary-300"
                  : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
              )}
            >
              <span
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                  allSelected
                    ? "border-primary bg-primary-solid text-white"
                    : "border-slate-300 dark:border-slate-600"
                )}
              >
                {allSelected ? <Check className="h-3 w-3" /> : null}
              </span>
              Semua Kategori
            </button>

            <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

            {categories.map((category) => {
              const Icon = getCategoryIcon(category);
              const checked = selectedIds.includes(category.id);
              return (
                <button
                  key={category.id}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={checked}
                  onClick={() => toggleCategory(category.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[10.5px] transition",
                    checked
                      ? "bg-primary-50 text-primary-accent dark:bg-primary-950/60 dark:text-primary-300"
                      : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                      checked
                        ? "border-primary bg-primary-solid text-white"
                        : "border-slate-300 dark:border-slate-600"
                    )}
                  >
                    {checked ? <Check className="h-3 w-3" /> : null}
                  </span>
                  <Icon className="h-4 w-4 shrink-0 text-primary-accent" />
                  <span className="min-w-0 flex-1 truncate">{category.label}</span>
                </button>
              );
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
