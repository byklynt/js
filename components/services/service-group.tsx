"use client";

import { createElement, memo } from "react";
import { ChevronDown } from "lucide-react";
import type { CategoryRow, ServiceRow } from "@/lib/services-types";
import { getCategoryIcon } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";
import { ServiceCard } from "./service-card";
import { ServiceSkeleton } from "./service-skeleton";

export type GroupData = {
  items: ServiceRow[];
  total: number;
  next: string | null;
  loading: boolean;
  error: boolean;
};

type Props = {
  category: CategoryRow;
  expanded: boolean;
  data: GroupData | undefined;
  /** False when the page already shows the most cards it is allowed to mount. */
  canShowMore: boolean;
  onToggle: (id: string) => void;
  onShowMore: (id: string) => void;
  onRetry: (id: string) => void;
  favorites: ReadonlySet<string>;
  onToggleFavorite: (id: string) => void;
  expandedServiceId: string | null;
  onToggleExpandedService: (id: string) => void;
  isMobile: boolean;
};

/** A collapsed header with the count; its services are fetched and mounted only while it is expanded. */
export const ServiceGroup = memo(function ServiceGroup({
  category, expanded, data, canShowMore, onToggle, onShowMore, onRetry, favorites, onToggleFavorite, expandedServiceId, onToggleExpandedService, isMobile,
}: Props) {
  const headingId = `group-heading-${category.id}`;
  const panelId = `group-panel-${category.id}`;
  const remaining = data ? data.total - data.items.length : 0;

  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <h2 id={headingId} className="sr-only">
        {category.label}
      </h2>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => onToggle(category.id)}
        className="flex h-[42px] w-full items-center gap-2.5 rounded-xl border border-slate-200/70 bg-white px-4 text-left transition hover:border-primary-200 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-primary-800"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-accent dark:bg-primary-950/60 dark:text-primary-300">
          {createElement(getCategoryIcon(category), { className: "h-4 w-4" })}
        </span>
        <span className="min-w-0 flex-1 truncate text-[10.5px] font-semibold text-ink dark:text-slate-200">
          {category.label} ({category.count.toLocaleString("id-ID")})
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform", expanded && "rotate-180")} aria-hidden />
      </button>

      {expanded ? (
        <div id={panelId} className="fade-in">
          {!data || (data.loading && data.items.length === 0) ? (
            <ServiceSkeleton groups={1} cards={3} />
          ) : data.error && data.items.length === 0 ? (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[10.5px] text-red-600 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
              Layanan gagal dimuat.{" "}
              <button type="button" onClick={() => onRetry(category.id)} className="font-semibold underline">
                Coba lagi
              </button>
            </div>
          ) : (
            <>
              <ul className="space-y-3">
                {data.items.map((service) => (
                  <ServiceCard
                    key={service.id}
                    service={service}
                    isFavorite={favorites.has(service.id)}
                    onToggleFavorite={onToggleFavorite}
                    isExpanded={expandedServiceId === service.id}
                    onToggleExpanded={onToggleExpandedService}
                    isMobile={isMobile}
                  />
                ))}
              </ul>

              {remaining > 0 && canShowMore ? (
                <button
                  type="button"
                  disabled={data.loading}
                  onClick={() => onShowMore(category.id)}
                  className="mt-3 flex w-full items-center justify-center rounded-xl border border-dashed border-primary-200 bg-primary-50/40 py-2.5 text-[10.5px] font-semibold text-primary-accent transition hover:bg-primary-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900/40 dark:text-primary-300"
                >
                  {data.loading ? "Memuat..." : `Tampilkan lebih banyak (${remaining.toLocaleString("id-ID")})`}
                </button>
              ) : null}
              {remaining > 0 && !canShowMore ? (
                <p className="mt-3 text-center text-[10px] text-slate-400">
                  {remaining.toLocaleString("id-ID")} layanan lagi. Tutup kategori lain atau persempit pencarian untuk melihat lebih banyak.
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </section>
  );
});
