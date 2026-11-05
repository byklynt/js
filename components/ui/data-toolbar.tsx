"use client";

import { HeaderLine } from "@/components/shell/header-zone";
import { FilterPill, type FilterOption } from "./filter-pill";
import { SearchPill } from "./search-pill";

/** Filter pill (left) + optional actions + search pill (right), centered on the full-width line. */
export function DataToolbar<T extends string>({
  filter,
  query,
  onQueryChange,
  searchLabel,
  actions,
}: {
  filter: {
    options: FilterOption<T>[];
    value: T;
    onChange: (next: T) => void;
    ariaLabel: string;
    searchable?: boolean;
  };
  query: string;
  onQueryChange: (next: string) => void;
  searchLabel: string;
  /** Extra buttons placed before the search pill (e.g. "Tambah layanan"). */
  actions?: React.ReactNode;
}) {
  return (
    <div className="relative mt-[46px]">
      <HeaderLine top="50%" />
      <div className="relative z-20 flex flex-wrap items-center justify-between gap-3">
        <FilterPill
          options={filter.options}
          value={filter.value}
          onChange={filter.onChange}
          ariaLabel={filter.ariaLabel}
          searchable={filter.searchable}
        />
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          {actions}
          <div className="w-[200px] max-w-full">
            <SearchPill value={query} onChange={onQueryChange} ariaLabel={searchLabel} />
          </div>
        </div>
      </div>
    </div>
  );
}
