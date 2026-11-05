"use client";

import { useMemo } from "react";
import { Filter, LayoutGrid } from "lucide-react";
import { platforms, allPlatformsId, type Platform, type IconComponent } from "@/lib/dashboard-data";
import { useCategories } from "@/lib/services-client";
import { cn } from "@/lib/utils";

const OTHER: Platform = { id: "lainnya", label: "Lainnya", icon: LayoutGrid as unknown as IconComponent };

export function PlatformFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (platformId: string) => void;
}) {
  const { categories } = useCategories();
  // "Lainnya" only shows when the catalogue actually has categories that match no known platform.
  const list = useMemo<Platform[]>(
    () => (categories.some((c) => c.platformId === "lainnya") ? [...platforms, OTHER] : platforms),
    [categories]
  );
  return (
    <div
      role="tablist"
      aria-label="Filter platform"
      className="grid grid-cols-2 gap-[7px] sm:grid-cols-3 lg:grid-cols-7"
    >
      <button
        type="button"
        role="tab"
        aria-selected={value === allPlatformsId}
        onClick={() => onChange(allPlatformsId)}
        className={cn(
          "flex h-[39px] items-center justify-center gap-2 rounded-xl border px-3 text-[10.5px] font-medium transition",
          value === allPlatformsId
            ? "border-primary bg-primary-solid text-white shadow-[0_2px_0_var(--primary-pressed)]"
            : "border-slate-200 text-ink hover:border-primary-200 hover:bg-primary-50 dark:border-slate-700 dark:text-white dark:hover:border-primary-800 dark:hover:bg-slate-800"
        )}
      >
        <Filter className="h-3.5 w-3.5" />
        Semua
      </button>

      {list.map((platform) => {
        const active = value === platform.id;
        return (
          <button
            key={platform.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(platform.id)}
            className={cn(
              "flex h-[39px] items-center justify-center gap-2 rounded-xl border px-3 text-[10.5px] font-medium transition",
              active
                ? "border-primary bg-primary-solid text-white shadow-[0_2px_0_var(--primary-pressed)]"
                : "border-slate-200 text-ink hover:border-primary-200 hover:bg-primary-50 dark:border-slate-700 dark:text-white dark:hover:border-primary-800 dark:hover:bg-slate-800"
            )}
          >
            <platform.icon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{platform.label}</span>
          </button>
        );
      })}
    </div>
  );
}
