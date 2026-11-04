"use client";

import { LayoutGrid } from "lucide-react";
import { categories, platforms, services, type Category, type IconComponent, type Platform, type Service } from "@/lib/dashboard-data";

/**
 * Adds services imported from the provider (admin: Sinkronkan dari provider) to the shared catalogue lists that the
 * order form and the Layanan page read. Rendered BEFORE the page content, on the server and in the browser, from data the
 * server built (buildUserCatalog). Services the provider dropped or an admin switched off disappear on the next render.
 * The bundled demo services stay as they are.
 */
const injected = { services: new Set<string>(), categories: new Set<string>(), platform: false };
const OTHER: Platform = { id: "lainnya", label: "Lainnya", icon: LayoutGrid as unknown as IconComponent };

function sync<T extends { id: string }>(list: T[], ids: Set<string>, next: T[]) {
  for (let i = list.length - 1; i >= 0; i--) if (ids.has(list[i].id)) list.splice(i, 1);
  ids.clear();
  for (const item of next) {
    if (list.some((x) => x.id === item.id)) continue;
    list.push(item);
    ids.add(item.id);
  }
}

/** Bundled demo entries taken out while the real provider is in charge (live mode). Put back when they are no longer hidden. */
const stash = { services: [] as Service[], categories: [] as Category[] };

function hide<T extends { id: string }>(list: T[], saved: T[], ids: Set<string>) {
  // restore what is no longer hidden, then remove what is hidden now
  for (const item of saved.splice(0)) if (!ids.has(item.id) && !list.some((x) => x.id === item.id)) list.push(item);
  for (let i = list.length - 1; i >= 0; i--) {
    if (ids.has(list[i].id)) saved.push(...list.splice(i, 1));
  }
}

export function CatalogHydrator({
  categories: nextCategories, services: nextServices, hiddenServiceIds = [], hiddenCategoryIds = [],
}: { categories: Category[]; services: Service[]; hiddenServiceIds?: string[]; hiddenCategoryIds?: string[] }) {
  hide(services, stash.services, new Set(hiddenServiceIds));
  hide(categories, stash.categories, new Set(hiddenCategoryIds));
  sync(categories, injected.categories, nextCategories);
  sync(services, injected.services, nextServices);
  const needsOther = nextCategories.some((c) => c.platformId === "lainnya");
  if (needsOther && !platforms.some((p) => p.id === OTHER.id)) {
    platforms.push(OTHER);
    injected.platform = true;
  } else if (!needsOther && injected.platform) {
    const i = platforms.findIndex((p) => p.id === OTHER.id);
    if (i >= 0) platforms.splice(i, 1);
    injected.platform = false;
  }
  return null;
}
