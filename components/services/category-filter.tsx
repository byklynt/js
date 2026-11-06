"use client";

import { createElement, useMemo, useRef, useState } from "react";
import { Filter, ChevronDown, Check, Search } from "lucide-react";
import { getCategoryIcon, knownPlatforms } from "@/lib/dashboard-data";
import { iconForPlatform } from "@/lib/platform-icons";
import { useVisualViewportMaxHeight } from "@/lib/use-touch";
import type { CategoryRow } from "@/lib/services-types";
import { useClickOutside } from "@/lib/use-click-outside";
import { cn } from "@/lib/utils";

/** Rows rendered at once in the popover; the rest is reached through the search box. */
const ROW_LIMIT = 50;

function platformLabel(id: string): string {
  return knownPlatforms.find((p) => p.id === id)?.label ?? "Lainnya";
}

function Row({ category, checked, onToggle }: { category: CategoryRow; checked: boolean; onToggle: (id: string) => void }) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      onClick={() => onToggle(category.id)}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[10.5px] transition",
        checked
          ? "bg-primary-50 text-primary-accent dark:bg-primary-950/60 dark:text-primary-300"
          : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
      )}
    >
      <span
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
          checked ? "border-primary bg-primary-solid text-white" : "border-slate-300 dark:border-slate-600"
        )}
      >
        {checked ? <Check className="h-3 w-3" /> : null}
      </span>
      {createElement(getCategoryIcon(category), { className: "h-4 w-4 shrink-0 text-primary-accent" })}
      <span className="min-w-0 flex-1 truncate">{category.label}</span>
      <span className="shrink-0 text-[9.5px] text-slate-400">{category.count.toLocaleString("id-ID")}</span>
    </button>
  );
}

export function CategoryFilter({
  categories,
  selectedIds,
  onChange,
}: {
  categories: CategoryRow[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [openPlatform, setOpenPlatform] = useState<string | null>(null);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listMaxHeight = useVisualViewportMaxHeight(open, triggerRef, 384);

  const allSelected = selectedIds.length === 0;
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  function toggleCategory(id: string) {
    onChange(selected.has(id) ? selectedIds.filter((i) => i !== id) : [...selectedIds, id]);
  }

  const q = query.trim().toLowerCase();
  const matches = useMemo(() => (q ? categories.filter((c) => c.label.toLowerCase().includes(q)) : []), [categories, q]);
  // Grouped by platform (collapsed): header + count; a platform's categories render only while it is open.
  const byPlatform = useMemo(() => {
    const map = new Map<string, CategoryRow[]>();
    for (const c of categories) map.set(c.platformId, [...(map.get(c.platformId) ?? []), c]);
    return Array.from(map, ([id, list]) => ({ id, label: platformLabel(id), list, total: list.reduce((n, c) => n + c.count, 0) }));
  }, [categories]);

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-slate-200/70 bg-white py-2 pl-2 pr-3 text-[10.5px] font-semibold text-slate-600 transition hover:border-primary-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-50 text-primary-accent dark:bg-primary-950/60 dark:text-primary-300">
          <Filter className="h-3.5 w-3.5" />
        </span>
        Kategori
        {selectedIds.length > 0 ? (
          <span className="rounded-full bg-primary-solid px-1.5 text-[9.5px] font-bold text-white">{selectedIds.length}</span>
        ) : null}
        <ChevronDown className={cn("h-3.5 w-3.5 text-slate-400 transition-transform", open && "rotate-180")} />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Filter kategori"
          style={{ maxHeight: listMaxHeight }}
          className="fade-in absolute left-0 z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] overflow-auto overscroll-contain rounded-xl border border-primary-100 bg-white p-1.5 shadow-xl shadow-primary-100/70 dark:border-slate-700 dark:bg-slate-900 dark:shadow-none"
        >
          <div className="sticky top-0 z-10 bg-white p-1 dark:bg-slate-900">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari kategori"
              aria-label="Cari kategori"
              className="h-8 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-2 text-[10.5px] text-ink outline-none focus:border-primary-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={allSelected}
            onClick={() => onChange([])}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[10.5px] transition",
              allSelected
                ? "bg-primary-50 text-primary-accent dark:bg-primary-950/60 dark:text-primary-300"
                : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
            )}
          >
            <span
              className={cn(
                "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                allSelected ? "border-primary bg-primary-solid text-white" : "border-slate-300 dark:border-slate-600"
              )}
            >
              {allSelected ? <Check className="h-3 w-3" /> : null}
            </span>
            Semua Kategori
          </button>

          <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

          {q ? (
            matches.length === 0 ? (
              <p className="px-3 py-4 text-center text-[10.5px] text-slate-400">Kategori tidak ditemukan.</p>
            ) : (
              <>
                {matches.slice(0, ROW_LIMIT).map((c) => (
                  <Row key={c.id} category={c} checked={selected.has(c.id)} onToggle={toggleCategory} />
                ))}
                {matches.length > ROW_LIMIT ? (
                  <p className="px-3 py-2 text-center text-[10px] text-slate-400">
                    +{(matches.length - ROW_LIMIT).toLocaleString("id-ID")} lainnya. Persempit pencarian.
                  </p>
                ) : null}
              </>
            )
          ) : (
            byPlatform.map((p) => (
              <div key={p.id}>
                <button
                  type="button"
                  aria-expanded={openPlatform === p.id}
                  onClick={() => setOpenPlatform((cur) => (cur === p.id ? null : p.id))}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[10.5px] font-semibold text-ink hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {createElement(iconForPlatform(p.id), { className: "h-4 w-4 shrink-0 text-primary-accent" })}
                  <span className="flex-1 truncate">{p.label}</span>
                  <span className="text-[9.5px] font-medium text-slate-400">
                    {p.list.length.toLocaleString("id-ID")} kategori
                  </span>
                  <ChevronDown className={cn("h-3.5 w-3.5 text-slate-400 transition-transform", openPlatform === p.id && "rotate-180")} aria-hidden />
                </button>
                {openPlatform === p.id ? (
                  <div className="pl-2">
                    {p.list.slice(0, ROW_LIMIT).map((c) => (
                      <Row key={c.id} category={c} checked={selected.has(c.id)} onToggle={toggleCategory} />
                    ))}
                    {p.list.length > ROW_LIMIT ? (
                      <p className="px-3 py-2 text-center text-[10px] text-slate-400">
                        +{(p.list.length - ROW_LIMIT).toLocaleString("id-ID")} lainnya. Gunakan kotak cari.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
