"use client";

import { orderStatusFilters, type OrderStatus } from "@/lib/orders-data";
import { FilterPill } from "@/components/ui/filter-pill";
import { SearchPill } from "@/components/ui/search-pill";

export type StatusFilter = OrderStatus | "semua";

export function OrdersToolbar({
  status,
  onStatusChange,
  query,
  onQueryChange,
}: {
  status: StatusFilter;
  onStatusChange: (next: StatusFilter) => void;
  query: string;
  onQueryChange: (next: string) => void;
}) {
  return (
    <div className="relative z-10 flex items-center justify-between gap-3">
      <FilterPill
        options={orderStatusFilters}
        value={status}
        onChange={onStatusChange}
        ariaLabel="Filter status pesanan"
      />
      <SearchPill
        value={query}
        onChange={onQueryChange}
        ariaLabel="Cari pesanan berdasarkan ID, layanan, atau link"
      />
    </div>
  );
}
