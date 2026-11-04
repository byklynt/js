"use client";

import { updateTypeFilters, type UpdateType } from "@/lib/updates-data";
import { FilterPill } from "@/components/ui/filter-pill";
import { SearchPill } from "@/components/ui/search-pill";

export type TypeFilter = UpdateType | "semua";

export function UpdatesToolbar({
  type,
  onTypeChange,
  query,
  onQueryChange,
}: {
  type: TypeFilter;
  onTypeChange: (next: TypeFilter) => void;
  query: string;
  onQueryChange: (next: string) => void;
}) {
  return (
    <div className="relative z-10 flex items-center justify-between gap-3">
      <FilterPill
        options={updateTypeFilters}
        value={type}
        onChange={onTypeChange}
        ariaLabel="Filter jenis pembaruan"
      />
      <SearchPill
        value={query}
        onChange={onQueryChange}
        ariaLabel="Cari pembaruan berdasarkan ID atau nama layanan"
      />
    </div>
  );
}
