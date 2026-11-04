"use client";

import { useState } from "react";
import { SlidersHorizontal, ChevronDown, Heart } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useClickOutside } from "@/lib/use-click-outside";
import { cn } from "@/lib/utils";

export type SortOrder = "termurah" | "termahal" | "tercepat" | "id-asc";
export type GuaranteeFilter = "semua" | "ada-garansi" | "tanpa-garansi";

export type AdvancedFilterValues = {
  sortOrder: SortOrder;
  priceMin: string;
  priceMax: string;
  guarantee: GuaranteeFilter;
};

const sortOptions: { id: SortOrder; label: string }[] = [
  { id: "termurah", label: "Termurah" },
  { id: "termahal", label: "Termahal" },
  { id: "tercepat", label: "Tercepat" },
  { id: "id-asc", label: "ID Terkecil" },
];

const guaranteeOptions: { id: GuaranteeFilter; label: string }[] = [
  { id: "semua", label: "Semua" },
  { id: "ada-garansi", label: "Ada Garansi" },
  { id: "tanpa-garansi", label: "Tanpa Garansi" },
];

export const defaultAdvancedFilters: AdvancedFilterValues = {
  sortOrder: "termurah",
  priceMin: "",
  priceMax: "",
  guarantee: "semua",
};

export function AdvancedFilters({
  values,
  onApply,
  onReset,
  active,
  favoritesOnly,
  onToggleFavoritesOnly,
}: {
  values: AdvancedFilterValues;
  onApply: (next: AdvancedFilterValues) => void;
  onReset: () => void;
  active: boolean;
  favoritesOnly: boolean;
  onToggleFavoritesOnly: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<AdvancedFilterValues>(values);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));

  function openPopover() {
    setDraft(values);
    setOpen((v) => !v);
  }

  function handleApply() {
    onApply(draft);
    setOpen(false);
  }

  function handleReset() {
    setDraft(defaultAdvancedFilters);
    onReset();
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={openPopover}
        className="flex items-center gap-2 rounded-full border border-slate-200/70 bg-white py-2 pl-2 pr-3 text-[10.5px] font-semibold text-slate-600 transition hover:border-primary-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-50 text-primary-accent dark:bg-primary-950/60 dark:text-primary-300">
          <SlidersHorizontal className="h-3.5 w-3.5" />
        </span>
        Filter Lanjutan
        {active ? <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden /> : null}
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
            role="dialog"
            aria-label="Filter lanjutan"
            className="absolute left-0 z-30 mt-2 w-72 rounded-xl border border-primary-100 bg-white p-4 shadow-xl shadow-primary-100/70 dark:border-slate-700 dark:bg-slate-900 dark:shadow-none"
          >
            <div>
              <label
                htmlFor="sort-order"
                className="mb-1.5 block text-[10.5px] font-semibold text-ink dark:text-slate-300"
              >
                Urutan
              </label>
              <select
                id="sort-order"
                value={draft.sortOrder}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, sortOrder: e.target.value as SortOrder }))
                }
                className="h-[34px] w-full rounded-xl border border-slate-200 bg-white px-3 text-[10.5px] text-slate-800 shadow-sm outline-none transition focus:border-primary-400 focus:ring-4 focus:ring-primary-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-primary-900/40"
              >
                {sortOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-3">
              <span className="mb-1.5 block text-[10.5px] font-semibold text-ink dark:text-slate-300">
                Rentang Harga (Rp)
              </span>
              <div className="flex items-center gap-2">
                <label className="sr-only" htmlFor="price-min">
                  Harga minimum
                </label>
                <input
                  id="price-min"
                  type="text"
                  inputMode="numeric"
                  placeholder="Min"
                  value={draft.priceMin}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, priceMin: e.target.value.replace(/[^\d]/g, "") }))
                  }
                  className="h-[34px] w-full rounded-xl border border-slate-200 bg-white px-3 text-[10.5px] text-slate-800 shadow-sm outline-none transition placeholder:text-slate-300 focus:border-primary-400 focus:ring-4 focus:ring-primary-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-primary-900/40"
                />
                <span className="text-slate-300">-</span>
                <label className="sr-only" htmlFor="price-max">
                  Harga maksimum
                </label>
                <input
                  id="price-max"
                  type="text"
                  inputMode="numeric"
                  placeholder="Maks"
                  value={draft.priceMax}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, priceMax: e.target.value.replace(/[^\d]/g, "") }))
                  }
                  className="h-[34px] w-full rounded-xl border border-slate-200 bg-white px-3 text-[10.5px] text-slate-800 shadow-sm outline-none transition placeholder:text-slate-300 focus:border-primary-400 focus:ring-4 focus:ring-primary-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-primary-900/40"
                />
              </div>
            </div>

            <div className="mt-3">
              <label
                htmlFor="guarantee-filter"
                className="mb-1.5 block text-[10.5px] font-semibold text-ink dark:text-slate-300"
              >
                Garansi / Refill
              </label>
              <select
                id="guarantee-filter"
                value={draft.guarantee}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, guarantee: e.target.value as GuaranteeFilter }))
                }
                className="h-[34px] w-full rounded-xl border border-slate-200 bg-white px-3 text-[10.5px] text-slate-800 shadow-sm outline-none transition focus:border-primary-400 focus:ring-4 focus:ring-primary-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-primary-900/40"
              >
                {guaranteeOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <span className="flex items-center gap-2 text-[10.5px] font-semibold text-ink dark:text-slate-300">
                <Heart className="h-3.5 w-3.5 text-primary-accent" />
                Hanya Favorit
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={favoritesOnly}
                onClick={onToggleFavoritesOnly}
                className={cn(
                  "flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition",
                  favoritesOnly ? "justify-end bg-primary" : "justify-start bg-slate-200 dark:bg-slate-700"
                )}
              >
                <span className="h-4 w-4 rounded-full bg-white shadow-sm" />
              </button>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={handleReset}
                className="flex-1 rounded-xl border border-slate-200 py-2 text-[10.5px] font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={handleApply}
                className="flex-1 rounded-xl bg-gradient-to-b from-primary-from to-primary-to py-2 text-[10.5px] font-semibold text-white shadow-[0_2px_0_var(--primary-pressed)] transition hover:brightness-105"
              >
                Terapkan
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
