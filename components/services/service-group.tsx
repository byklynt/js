"use client";

import { createElement } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Category, Service } from "@/lib/dashboard-data";
import { getCategoryIcon } from "@/lib/dashboard-data";
import { ServiceCard } from "./service-card";

export function ServiceGroup({
  category,
  services,
  collapsed,
  onToggleCollapsed,
  visibleCount,
  onShowMore,
  favorites,
  onToggleFavorite,
  expandedId,
  onToggleExpanded,
}: {
  category: Category;
  services: Service[];
  collapsed: boolean;
  onToggleCollapsed: (id: string) => void;
  visibleCount: number;
  onShowMore: (id: string) => void;
  favorites: Set<string>;
  onToggleFavorite: (id: string) => void;
  expandedId: string | null;
  onToggleExpanded: (id: string) => void;
}) {
  const visible = services.slice(0, visibleCount);
  const remaining = services.length - visible.length;
  const headingId = `group-heading-${category.id}`;

  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <h2 id={headingId} className="sr-only">
        {category.label}
      </h2>
      <button
        type="button"
        aria-expanded={!collapsed}
        onClick={() => onToggleCollapsed(category.id)}
        className="flex h-[42px] w-full items-center gap-2.5 rounded-xl border border-slate-200/70 bg-white px-4 text-left transition hover:border-primary-200 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-primary-800"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-accent dark:bg-primary-950/60 dark:text-primary-300">
          {createElement(getCategoryIcon(category), { className: "h-4 w-4" })}
        </span>
        <span className="flex-1 text-[10.5px] font-semibold text-ink dark:text-slate-200">
          {category.label}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {!collapsed ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <ul className="space-y-3">
              {visible.map((service, i) => (
                <ServiceCard
                  key={service.id}
                  service={service}
                  index={i}
                  isFavorite={favorites.has(service.id)}
                  onToggleFavorite={onToggleFavorite}
                  isExpanded={expandedId === service.id}
                  onToggleExpanded={onToggleExpanded}
                />
              ))}
            </ul>

            {remaining > 0 ? (
              <button
                type="button"
                onClick={() => onShowMore(category.id)}
                className="mt-3 flex w-full items-center justify-center rounded-xl border border-dashed border-primary-200 bg-primary-50/40 py-2.5 text-[10.5px] font-semibold text-primary-accent transition hover:bg-primary-50 dark:border-slate-700 dark:bg-slate-900/40 dark:text-primary-300"
              >
                Tampilkan lebih banyak ({remaining})
              </button>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
