"use client";

import { useEffect, useMemo, useState } from "react";
import { PackageSearch } from "lucide-react";
import { categories, services as allServices } from "@/lib/dashboard-data";
import { readFavorites, writeFavorites } from "@/lib/favorites";
import { HeaderZone } from "@/components/shell/header-zone";
import { ServicesToolbar } from "./services-toolbar";
import { ServiceGroup } from "./service-group";
import { ServiceSkeleton } from "./service-skeleton";
import { defaultAdvancedFilters, type AdvancedFilterValues } from "./advanced-filters";

const VISIBLE_STEP = 20;

export function ServicesPage({ initialSearch = "" }: { initialSearch?: string }) {
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [advancedFilters, setAdvancedFilters] =
    useState<AdvancedFilterValues>(defaultAdvancedFilters);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [debouncedQuery, setDebouncedQuery] = useState(initialSearch);
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set());
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({});
  const [expandedServiceId, setExpandedServiceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // One-time sync from localStorage once mounted in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFavorites(new Set(readFavorites()));
    setFavoritesLoaded(true);
  }, []);

  useEffect(() => {
    if (!favoritesLoaded) return;
    writeFavorites(Array.from(favorites));
  }, [favorites, favoritesLoaded]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 200);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    // Show a brief skeleton on mount and whenever filters change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const t = setTimeout(() => setLoading(false), 400);
    return () => clearTimeout(t);
  }, [
    debouncedQuery,
    selectedCategoryIds,
    advancedFilters.sortOrder,
    advancedFilters.priceMin,
    advancedFilters.priceMax,
    advancedFilters.guarantee,
    favoritesOnly,
  ]);

  const groups = useMemo(() => {
    const query = debouncedQuery.trim().toLowerCase();
    const minPrice = advancedFilters.priceMin ? Number(advancedFilters.priceMin) : null;
    const maxPrice = advancedFilters.priceMax ? Number(advancedFilters.priceMax) : null;

    const categoryPool =
      selectedCategoryIds.length > 0
        ? categories.filter((c) => selectedCategoryIds.includes(c.id))
        : categories;

    return categoryPool
      .map((category) => {
        let list = allServices.filter((s) => s.categoryId === category.id);

        if (query) {
          list = list.filter(
            (s) => s.id.includes(query) || s.name.toLowerCase().includes(query)
          );
        }
        if (minPrice !== null) list = list.filter((s) => s.pricePer1000 >= minPrice);
        if (maxPrice !== null) list = list.filter((s) => s.pricePer1000 <= maxPrice);
        if (advancedFilters.guarantee === "ada-garansi") {
          list = list.filter((s) => s.refillDays !== null);
        } else if (advancedFilters.guarantee === "tanpa-garansi") {
          list = list.filter((s) => s.refillDays === null);
        }
        if (favoritesOnly) {
          list = list.filter((s) => favorites.has(s.id));
        }

        const sorted = [...list].sort((a, b) => {
          switch (advancedFilters.sortOrder) {
            case "termurah":
              return a.pricePer1000 - b.pricePer1000;
            case "termahal":
              return b.pricePer1000 - a.pricePer1000;
            case "tercepat":
              return b.speedPerHour - a.speedPerHour;
            case "id-asc":
              return Number(a.id) - Number(b.id);
            default:
              return 0;
          }
        });

        return { category, services: sorted };
      })
      .filter((group) => group.services.length > 0);
  }, [selectedCategoryIds, debouncedQuery, advancedFilters, favoritesOnly, favorites]);

  const totalResults = groups.reduce((sum, g) => sum + g.services.length, 0);

  function toggleCollapsed(id: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function showMore(id: string) {
    setVisibleCounts((prev) => ({ ...prev, [id]: (prev[id] ?? VISIBLE_STEP) + VISIBLE_STEP }));
  }

  function toggleFavorite(id: string) {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleExpanded(id: string) {
    setExpandedServiceId((prev) => (prev === id ? null : id));
  }

  function clearAll() {
    setSelectedCategoryIds([]);
    setAdvancedFilters(defaultAdvancedFilters);
    setFavoritesOnly(false);
    setSearchQuery("");
  }

  return (
    <div>
      <HeaderZone />

      <div>
        <h1 className="text-[26px] font-semibold tracking-[-0.015em] text-ink dark:text-white">
          Layanan
        </h1>
        <p className="mt-1.5 text-[10px] font-medium text-[#5B6B8C] dark:text-slate-400">
          Lihat daftar layanan kami di sini
        </p>
      </div>

      <div className="mt-6">
        <ServicesToolbar
          selectedCategoryIds={selectedCategoryIds}
          onCategoryChange={setSelectedCategoryIds}
          advancedFilters={advancedFilters}
          onAdvancedApply={setAdvancedFilters}
          onAdvancedReset={() => setAdvancedFilters(defaultAdvancedFilters)}
          favoritesOnly={favoritesOnly}
          onToggleFavoritesOnly={() => setFavoritesOnly((v) => !v)}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onClearAll={clearAll}
        />
      </div>

      <div className="mt-6">
        {loading ? (
          <ServiceSkeleton />
        ) : totalResults === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-primary-200 bg-primary-50/40 px-6 py-20 text-center dark:border-slate-700 dark:bg-slate-900/40">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-primary-accent shadow-sm dark:bg-slate-900">
              <PackageSearch className="h-6 w-6" />
            </span>
            <p className="mt-5 text-[11px] font-semibold text-ink dark:text-slate-200">
              Layanan tidak ditemukan
            </p>
            <button
              type="button"
              onClick={clearAll}
              className="mt-4 rounded-xl bg-gradient-to-b from-primary-from to-primary-to px-4 py-2 text-[10.5px] font-semibold text-white shadow-[0_2px_0_var(--primary-pressed)] transition hover:brightness-105"
            >
              Reset Filter
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map(({ category, services }) => (
              <ServiceGroup
                key={category.id}
                category={category}
                services={services}
                collapsed={collapsedGroups.has(category.id)}
                onToggleCollapsed={toggleCollapsed}
                visibleCount={visibleCounts[category.id] ?? VISIBLE_STEP}
                onShowMore={showMore}
                favorites={favorites}
                onToggleFavorite={toggleFavorite}
                expandedId={expandedServiceId}
                onToggleExpanded={toggleExpanded}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
