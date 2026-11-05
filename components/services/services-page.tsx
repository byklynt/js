"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { PackageSearch } from "lucide-react";
import { readFavorites, writeFavorites } from "@/lib/favorites";
import { fetchCategoryList, fetchServices, isAbort, useCategories } from "@/lib/services-client";
import { MIN_SEARCH_LENGTH, type CategoryRow, type ServicesQuery } from "@/lib/services-types";
import { useMediaQuery } from "@/lib/use-media-query";
import { HeaderZone } from "@/components/shell/header-zone";
import { ServicesToolbar } from "./services-toolbar";
import { ServiceGroup, type GroupData } from "./service-group";
import { ServiceSkeleton } from "./service-skeleton";
import { defaultAdvancedFilters, type AdvancedFilterValues } from "./advanced-filters";

/** Rows fetched and shown per step in a category. */
const PAGE_SIZE = 20;
/** The most service cards mounted at once, over all open categories. */
const MAX_CARDS = 60;
/** Open categories at once (each starts with PAGE_SIZE cards, so this keeps the first view within MAX_CARDS). */
const MAX_OPEN = 3;
/** Category headers rendered per step. */
const GROUP_STEP = 30;
const SEARCH_DEBOUNCE_MS = 300;

export function ServicesPage({ initialSearch = "" }: { initialSearch?: string }) {
  const base = useCategories();
  const isMobile = useMediaQuery("(max-width: 767px)");

  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilterValues>(defaultAdvancedFilters);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favSnapshot, setFavSnapshot] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [debouncedQuery, setDebouncedQuery] = useState(initialSearch);
  const [, startTransition] = useTransition();
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set());
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);
  const [open, setOpen] = useState<string[]>([]);
  const [groups, setGroups] = useState<Record<string, GroupData>>({});
  const [groupLimit, setGroupLimit] = useState(GROUP_STEP);
  const [expandedServiceId, setExpandedServiceId] = useState<string | null>(null);
  const [filtered, setFiltered] = useState<{ key: string; categories: CategoryRow[] } | null>(null);
  const [filteredError, setFilteredError] = useState(false);

  useEffect(() => {
    // One-time sync from localStorage once mounted in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFavorites(new Set(readFavorites()));
    setFavoritesLoaded(true);
  }, []);
  useEffect(() => {
    if (favoritesLoaded) writeFavorites(Array.from(favorites));
  }, [favorites, favoritesLoaded]);

  // Debounced (300 ms), minimum 2 characters, applied inside a transition so typing is never blocked by the list update.
  useEffect(() => {
    const t = setTimeout(() => startTransition(() => setDebouncedQuery(searchQuery)), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const search = debouncedQuery.trim().length >= MIN_SEARCH_LENGTH ? debouncedQuery.trim() : "";
  const priceMin = advancedFilters.priceMin ? Number(advancedFilters.priceMin) : undefined;
  const priceMax = advancedFilters.priceMax ? Number(advancedFilters.priceMax) : undefined;
  const { sortOrder, guarantee } = advancedFilters;

  // Everything the server needs to filter and order (never includes the category: that is per group).
  const baseQuery = useMemo<ServicesQuery>(
    () => ({ search: search || undefined, sort: sortOrder, guarantee, priceMin, priceMax, favoritesOnly, favoriteIds: favoritesOnly ? favSnapshot : undefined }),
    [search, sortOrder, guarantee, priceMin, priceMax, favoritesOnly, favSnapshot]
  );
  const filtersKey = JSON.stringify([search, guarantee, priceMin, priceMax, favoritesOnly, favoritesOnly ? favSnapshot : null]);
  const orderKey = `${filtersKey}|${sortOrder}`;
  const hasFilters = Boolean(search) || guarantee !== "semua" || priceMin !== undefined || priceMax !== undefined || favoritesOnly;

  // Category counts for the active filters (the unfiltered list is the shared cached one).
  useEffect(() => {
    if (!hasFilters) return;
    const ctrl = new AbortController();
    fetchCategoryList(baseQuery, ctrl.signal)
      .then((r) => {
        setFiltered({ key: filtersKey, categories: r.categories });
        setFilteredError(false);
      })
      .catch((e) => {
        if (!isAbort(e)) setFilteredError(true);
      });
    return () => ctrl.abort();
    // baseQuery is derived from filtersKey + sort; the key is what decides a refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, hasFilters]);

  const categoryPool = useMemo<CategoryRow[] | null>(() => {
    if (!hasFilters) return base.loaded ? base.categories : null;
    return filtered?.key === filtersKey ? filtered.categories : null;
  }, [hasFilters, base.loaded, base.categories, filtered, filtersKey]);

  const visibleCategories = useMemo(
    () => (categoryPool ? (selectedCategoryIds.length ? categoryPool.filter((c) => selectedCategoryIds.includes(c.id)) : categoryPool) : []),
    [categoryPool, selectedCategoryIds]
  );

  // --- group data: one controller + epoch per category so stale answers are dropped ---
  const controllers = useRef(new Map<string, AbortController>());
  const orderKeyRef = useRef(orderKey);
  const queryRef = useRef(baseQuery);
  const groupsRef = useRef(groups);
  useEffect(() => {
    queryRef.current = baseQuery;
    groupsRef.current = groups;
  });

  const loadGroup = useCallback((categoryId: string, more: boolean) => {
    controllers.current.get(categoryId)?.abort();
    const ctrl = new AbortController();
    controllers.current.set(categoryId, ctrl);
    const key = orderKeyRef.current;
    const prev = more ? groupsRef.current[categoryId] : undefined;
    setGroups((g) => ({ ...g, [categoryId]: { items: prev?.items ?? [], total: prev?.total ?? 0, next: prev?.next ?? null, loading: true, error: false } }));
    fetchServices({ ...queryRef.current, category: categoryId, cursor: more ? prev?.next : undefined, limit: PAGE_SIZE }, ctrl.signal)
      .then((page) => {
        if (orderKeyRef.current !== key) return;
        setGroups((g) => ({ ...g, [categoryId]: { items: more ? [...(prev?.items ?? []), ...page.items] : page.items, total: page.total, next: page.nextCursor, loading: false, error: false } }));
      })
      .catch((e) => {
        if (isAbort(e) || orderKeyRef.current !== key) return;
        setGroups((g) => ({ ...g, [categoryId]: { items: prev?.items ?? [], total: prev?.total ?? 0, next: prev?.next ?? null, loading: false, error: true } }));
      });
  }, []);

  // Filters or sort changed: drop what is loaded, cancel in-flight requests, reload only the groups that are open.
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  });
  const firstRun = useRef(true);
  useEffect(() => {
    orderKeyRef.current = orderKey;
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    controllers.current.forEach((c) => c.abort());
    controllers.current.clear();
    setGroups({});
    setGroupLimit(GROUP_STEP);
    for (const id of openRef.current) loadGroup(id, false);
  }, [orderKey, loadGroup]);

  useEffect(() => {
    const map = controllers.current;
    return () => map.forEach((c) => c.abort());
  }, []);

  const toggleGroup = useCallback(
    (id: string) => {
      const isOpen = openRef.current.includes(id);
      if (isOpen) {
        controllers.current.get(id)?.abort();
        setOpen((o) => o.filter((x) => x !== id));
        return;
      }
      // Never more than MAX_OPEN open at once: the oldest one closes (and its cards unmount).
      const dropped = openRef.current.length >= MAX_OPEN ? openRef.current[0] : null;
      if (dropped) controllers.current.get(dropped)?.abort();
      setOpen((o) => [...(dropped ? o.slice(1) : o), id]);
      if (!groupsRef.current[id] || groupsRef.current[id].error) loadGroup(id, false);
    },
    [loadGroup]
  );

  const showMore = useCallback((id: string) => loadGroup(id, true), [loadGroup]);
  const retry = useCallback((id: string) => loadGroup(id, false), [loadGroup]);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const toggleExpandedService = useCallback((id: string) => setExpandedServiceId((prev) => (prev === id ? null : id)), []);

  const toggleFavoritesOnly = useCallback(() => {
    setFavoritesOnly((v) => {
      if (!v) setFavSnapshot(Array.from(favorites));
      return !v;
    });
  }, [favorites]);

  function clearAll() {
    setSelectedCategoryIds([]);
    setAdvancedFilters(defaultAdvancedFilters);
    setFavoritesOnly(false);
    setSearchQuery("");
    setDebouncedQuery("");
  }

  const mounted = open.reduce((n, id) => n + (groups[id]?.items.length ?? 0), 0);
  const canShowMore = mounted < MAX_CARDS;
  const loadingList = categoryPool === null && !filteredError;
  const shownCategories = visibleCategories.slice(0, groupLimit);

  return (
    <div>
      <HeaderZone />

      <div>
        <h1 className="text-[26px] font-semibold tracking-[-0.015em] text-ink dark:text-white">Layanan</h1>
        <p className="mt-1.5 text-[10px] font-medium text-[#5B6B8C] dark:text-slate-400">Lihat daftar layanan kami di sini</p>
      </div>

      <div className="mt-6">
        <ServicesToolbar
          categories={base.categories}
          selectedCategoryIds={selectedCategoryIds}
          onCategoryChange={setSelectedCategoryIds}
          advancedFilters={advancedFilters}
          onAdvancedApply={setAdvancedFilters}
          onAdvancedReset={() => setAdvancedFilters(defaultAdvancedFilters)}
          favoritesOnly={favoritesOnly}
          onToggleFavoritesOnly={toggleFavoritesOnly}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onClearAll={clearAll}
        />
      </div>

      <div className="mt-6" aria-busy={loadingList}>
        {loadingList ? (
          <ServiceSkeleton />
        ) : filteredError ? (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[10.5px] text-red-600 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            Layanan gagal dimuat. Coba lagi sebentar lagi.
          </div>
        ) : visibleCategories.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-primary-200 bg-primary-50/40 px-6 py-20 text-center dark:border-slate-700 dark:bg-slate-900/40">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-primary-accent shadow-sm dark:bg-slate-900">
              <PackageSearch className="h-6 w-6" />
            </span>
            <p className="mt-5 text-[11px] font-semibold text-ink dark:text-slate-200">
              {base.loaded && base.total === 0 && !hasFilters ? "Belum ada layanan" : "Layanan tidak ditemukan"}
            </p>
            {hasFilters || selectedCategoryIds.length > 0 ? (
              <button
                type="button"
                onClick={clearAll}
                className="mt-4 rounded-xl bg-gradient-to-b from-primary-from to-primary-to px-4 py-2 text-[10.5px] font-semibold text-white shadow-[0_2px_0_var(--primary-pressed)] transition hover:brightness-105"
              >
                Reset Filter
              </button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            {shownCategories.map((category) => (
              <ServiceGroup
                key={category.id}
                category={category}
                expanded={open.includes(category.id)}
                data={groups[category.id]}
                canShowMore={canShowMore}
                onToggle={toggleGroup}
                onShowMore={showMore}
                onRetry={retry}
                favorites={favorites}
                onToggleFavorite={toggleFavorite}
                expandedServiceId={expandedServiceId}
                onToggleExpandedService={toggleExpandedService}
                isMobile={isMobile}
              />
            ))}
            {visibleCategories.length > groupLimit ? (
              <button
                type="button"
                onClick={() => setGroupLimit((n) => n + GROUP_STEP)}
                className="flex w-full items-center justify-center rounded-xl border border-dashed border-primary-200 bg-primary-50/40 py-2.5 text-[10.5px] font-semibold text-primary-accent transition hover:bg-primary-50 dark:border-slate-700 dark:bg-slate-900/40 dark:text-primary-300"
              >
                Tampilkan lebih banyak kategori ({(visibleCategories.length - groupLimit).toLocaleString("id-ID")})
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
