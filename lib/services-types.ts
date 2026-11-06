/** Shapes shared by the services API (server) and the pages (client). Plain data only. */

import type { EstimateStats } from "@/lib/service-estimate";

/** Everything a service card needs. Long descriptions are fetched on demand (ServiceDetailData). */
export type ServiceRow = {
  id: string;
  name: string;
  categoryId: string;
  /** Rupiah per 1000. */
  price: number;
  min: number;
  /** >= 1,000,000,000 means no limit (see formatMaxQty). */
  max: number;
  /** Refill window in days; null = no refill. */
  refillDays: number | null;
  /** Average start/finish time as text; absent when the provider gives none. */
  avgTime?: string;
  /** Items per hour; absent when the provider gives none. */
  speed?: number;
  /** Measured delivery-time numbers (aggregates only). Absent when the service has none and no manual text: show "Belum ada estimasi". */
  est?: EstimateStats;
  /** Absent = a normal service. "comments" = Custom Comments (the buyer supplies the comments). "unsupported" = cannot be ordered ("Belum tersedia untuk dipesan"). */
  kind?: "comments" | "unsupported";
  /** Only set when the request carried favoriteIds. */
  favorite?: boolean;
};

export type CategoryRow = { id: string; label: string; platformId: string; count: number };

export type ServiceSort = "id-asc" | "termurah" | "termahal" | "tercepat";
export type GuaranteeFilter = "semua" | "ada-garansi" | "tanpa-garansi";

export type ServicesQuery = {
  category?: string;
  platform?: string;
  /** Minimum 2 characters; shorter is ignored. */
  search?: string;
  sort?: ServiceSort;
  favoritesOnly?: boolean;
  favoriteIds?: string[];
  guarantee?: GuaranteeFilter;
  priceMin?: number;
  priceMax?: number;
  cursor?: string | null;
  limit?: number;
};

export type ServicesPage = { items: ServiceRow[]; nextCursor: string | null; total: number };

export type ServiceDetailData = ServiceRow & {
  badges: string[];
  description: string[];
  guarantee: string;
  linkFormat: string;
  estimate: string;
};

export const MIN_SEARCH_LENGTH = 2;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
