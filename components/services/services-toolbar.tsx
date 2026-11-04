"use client";

import { Search, X } from "lucide-react";
import { categories } from "@/lib/dashboard-data";
import { CategoryFilter } from "./category-filter";
import {
  AdvancedFilters,
  defaultAdvancedFilters,
  type AdvancedFilterValues,
} from "./advanced-filters";

const sortLabels: Record<AdvancedFilterValues["sortOrder"], string> = {
  termurah: "Termurah",
  termahal: "Termahal",
  tercepat: "Tercepat",
  "id-asc": "ID Terkecil",
};

const guaranteeLabels: Record<AdvancedFilterValues["guarantee"], string> = {
  semua: "Semua Garansi",
  "ada-garansi": "Ada Garansi",
  "tanpa-garansi": "Tanpa Garansi",
};

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-primary-200 bg-primary-50 py-1 pl-3 pr-1.5 text-[10.5px] font-semibold text-primary-accent dark:border-primary-900 dark:bg-primary-950/40 dark:text-primary-300">
      {label}
      <button
        type="button"
        aria-label={`Hapus filter ${label}`}
        onClick={onRemove}
        className="flex h-4 w-4 items-center justify-center rounded-full text-primary-accent transition hover:bg-primary-100 dark:hover:bg-primary-900"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

export function ServicesToolbar({
  selectedCategoryIds,
  onCategoryChange,
  advancedFilters,
  onAdvancedApply,
  onAdvancedReset,
  favoritesOnly,
  onToggleFavoritesOnly,
  searchQuery,
  onSearchChange,
  onClearAll,
}: {
  selectedCategoryIds: string[];
  onCategoryChange: (ids: string[]) => void;
  advancedFilters: AdvancedFilterValues;
  onAdvancedApply: (v: AdvancedFilterValues) => void;
  onAdvancedReset: () => void;
  favoritesOnly: boolean;
  onToggleFavoritesOnly: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onClearAll: () => void;
}) {
  const advancedActive =
    advancedFilters.sortOrder !== defaultAdvancedFilters.sortOrder ||
    advancedFilters.priceMin !== "" ||
    advancedFilters.priceMax !== "" ||
    advancedFilters.guarantee !== defaultAdvancedFilters.guarantee ||
    favoritesOnly;

  const chips: { key: string; label: string; onRemove: () => void }[] = [];

  for (const id of selectedCategoryIds) {
    const category = categories.find((c) => c.id === id);
    if (!category) continue;
    chips.push({
      key: `cat-${id}`,
      label: category.label,
      onRemove: () => onCategoryChange(selectedCategoryIds.filter((i) => i !== id)),
    });
  }

  if (advancedFilters.sortOrder !== defaultAdvancedFilters.sortOrder) {
    chips.push({
      key: "sort",
      label: `Urutan: ${sortLabels[advancedFilters.sortOrder]}`,
      onRemove: () =>
        onAdvancedApply({ ...advancedFilters, sortOrder: defaultAdvancedFilters.sortOrder }),
    });
  }

  if (advancedFilters.priceMin || advancedFilters.priceMax) {
    chips.push({
      key: "price",
      label: `Harga: ${advancedFilters.priceMin || "0"} - ${advancedFilters.priceMax || "∞"}`,
      onRemove: () => onAdvancedApply({ ...advancedFilters, priceMin: "", priceMax: "" }),
    });
  }

  if (advancedFilters.guarantee !== defaultAdvancedFilters.guarantee) {
    chips.push({
      key: "guarantee",
      label: guaranteeLabels[advancedFilters.guarantee],
      onRemove: () =>
        onAdvancedApply({ ...advancedFilters, guarantee: defaultAdvancedFilters.guarantee }),
    });
  }

  if (favoritesOnly) {
    chips.push({ key: "favorites", label: "Favorit", onRemove: onToggleFavoritesOnly });
  }

  if (searchQuery.trim()) {
    chips.push({
      key: "search",
      label: `Cari: "${searchQuery.trim()}"`,
      onRemove: () => onSearchChange(""),
    });
  }

  return (
    <div className="border-y border-slate-200/70 py-4 dark:border-slate-800">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <CategoryFilter selectedIds={selectedCategoryIds} onChange={onCategoryChange} />
          <AdvancedFilters
            values={advancedFilters}
            onApply={onAdvancedApply}
            onReset={onAdvancedReset}
            active={advancedActive}
            favoritesOnly={favoritesOnly}
            onToggleFavoritesOnly={onToggleFavoritesOnly}
          />
        </div>

        <div className="relative w-full sm:w-72">
          <label htmlFor="services-search" className="sr-only">
            Cari layanan
          </label>
          <input
            id="services-search"
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Cari layanan"
            className="h-[34px] w-full rounded-full border border-slate-200 bg-white pl-4 pr-11 text-[10.5px] text-slate-800 shadow-sm outline-none transition placeholder:text-slate-300 focus:border-primary-400 focus:ring-4 focus:ring-primary-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-primary-900/40"
          />
          <button
            type="button"
            aria-label="Cari layanan"
            className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-primary-solid text-white transition hover:brightness-95"
          >
            <Search className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {chips.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <Chip key={chip.key} label={chip.label} onRemove={chip.onRemove} />
          ))}
          <button
            type="button"
            onClick={onClearAll}
            className="text-[10.5px] font-semibold text-slate-400 underline-offset-2 transition hover:text-primary-accent hover:underline"
          >
            Hapus semua
          </button>
        </div>
      ) : null}
    </div>
  );
}
