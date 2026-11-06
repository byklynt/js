"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Shared list behaviour for dashboard/admin pages:
 * - filter with a 400ms skeleton on first load and whenever the filter changes
 * - search debounced by 200ms (trimmed + lowercased)
 * - "show more" pagination
 */
export function useListState<F extends string>(
  initialFilter: F,
  { pageSize = 10, initialQuery = "", debounceMs = 200 }: { pageSize?: number; initialQuery?: string; debounceMs?: number } = {}
) {
  const [filter, setFilterState] = useState<F>(initialFilter);
  const [query, setQuery] = useState(initialQuery);
  const [debounced, setDebounced] = useState(initialQuery.trim().toLowerCase());
  const [visible, setVisible] = useState(pageSize);

  const loading = false;

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim().toLowerCase()), debounceMs);
    return () => window.clearTimeout(timer);
  }, [query, debounceMs]);

  return {
    filter,
    setFilter: (next: F) => {
      setFilterState(next);
      setVisible(pageSize);
    },
    query,
    setQuery,
    debounced,
    loading,
    visible,
    showMore: () => setVisible((v) => v + pageSize),
  };
}

/** Initial list filter from the URL (?status=... or ?filter=...), so dashboard cards can link to a filtered list. */
export function useParamFilter<F extends string>(allowed: readonly F[], fallback: F): F {
  const params = useSearchParams();
  const value = (params.get("status") ?? params.get("filter")) as F | null;
  return value && allowed.includes(value) ? value : fallback;
}
