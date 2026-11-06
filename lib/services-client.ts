"use client";

import { chooseEstimate } from "@/lib/service-estimate";
import { useEffect, useState } from "react";
import type { Service } from "@/lib/dashboard-data";
import type { CategoryRow, ServiceDetailData, ServiceRow, ServicesPage, ServicesQuery } from "@/lib/services-types";

/** Browser side of the services API (/api/services). Every call accepts an AbortSignal so stale requests can be cancelled. */

export function queryString(q: ServicesQuery): string {
  const p = new URLSearchParams();
  if (q.category) p.set("category", q.category);
  if (q.platform && q.platform !== "semua") p.set("platform", q.platform);
  if (q.search && q.search.trim().length >= 2) p.set("search", q.search.trim());
  if (q.sort && q.sort !== "id-asc") p.set("sort", q.sort);
  if (q.guarantee && q.guarantee !== "semua") p.set("guarantee", q.guarantee);
  if (q.priceMin !== undefined && Number.isFinite(q.priceMin)) p.set("priceMin", String(q.priceMin));
  if (q.priceMax !== undefined && Number.isFinite(q.priceMax)) p.set("priceMax", String(q.priceMax));
  if (q.favoritesOnly) {
    p.set("favoritesOnly", "1");
    p.set("fav", (q.favoriteIds ?? []).join(","));
  }
  if (q.cursor) p.set("cursor", q.cursor);
  if (q.limit) p.set("limit", String(q.limit));
  return p.toString();
}

async function get<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal, credentials: "same-origin", headers: { Accept: "application/json" } });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Gagal memuat layanan. Coba lagi.");
  }
  return (await res.json()) as T;
}

export const fetchServices = (q: ServicesQuery, signal?: AbortSignal) => get<ServicesPage>(`/api/services?${queryString(q)}`, signal);
export const fetchCategoryList = (q: ServicesQuery = {}, signal?: AbortSignal) =>
  get<{ categories: CategoryRow[]; totalServices: number }>(`/api/services/categories?${queryString(q)}`, signal);
export const fetchServiceDetail = (id: string, signal?: AbortSignal) => get<ServiceDetailData>(`/api/services/${encodeURIComponent(id)}`, signal);
export const fetchServicesByIds = async (ids: string[], signal?: AbortSignal) =>
  (await get<{ items: ServiceRow[] }>(`/api/services/by-ids?ids=${encodeURIComponent(ids.join(","))}`, signal)).items;

export function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}

/** A row as the order form and the detail panel expect it (they read more fields than a list card does). */
export function rowToService(row: ServiceRow | ServiceDetailData): Service {
  const detail = row as Partial<ServiceDetailData>;
  return {
    id: row.id, categoryId: row.categoryId, name: row.name, badges: detail.badges ?? [], pricePer1000: row.price, min: row.min, max: row.max,
    speedPerHour: row.speed ?? 0, startTime: row.avgTime ?? "Bervariasi", refillDays: row.refillDays,
    guarantee: detail.guarantee ?? (row.refillDays ? "Garansi refill" : "Tanpa garansi"), estimate: detail.estimate ?? chooseEstimate(row.est).text, est: row.est,
    linkFormat: detail.linkFormat ?? "https://", description: detail.description ?? [],
    ...(row.kind ? { kind: row.kind } : {}),
  };
}

// --- categories (unfiltered): fetched once, shared by every component, refreshed when stale ---
type CategoriesState = { categories: CategoryRow[]; total: number; loaded: boolean };
const STALE_MS = 30_000;
let cache: (CategoriesState & { at: number }) | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function loadCategories(): Promise<void> {
  inflight ??= fetchCategoryList()
    .then((r) => {
      cache = { categories: r.categories, total: r.totalServices, loaded: true, at: Date.now() };
      listeners.forEach((l) => l());
    })
    .catch(() => {})
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

const EMPTY: CategoriesState = { categories: [], total: 0, loaded: false };

/** The category list with counts. Small, cached, and the only catalogue data the order form needs up front. */
export function useCategories(): CategoriesState {
  const [state, setState] = useState<CategoriesState>(cache ?? EMPTY);
  useEffect(() => {
    const sync = () => cache && setState(cache);
    listeners.add(sync);
    if (!cache || Date.now() - cache.at > STALE_MS) void loadCategories();
    else sync();
    return () => {
      listeners.delete(sync);
    };
  }, []);
  return state;
}
