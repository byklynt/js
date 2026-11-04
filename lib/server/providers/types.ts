/**
 * Provider adapter contract. Server-only: adapters read API keys.
 * Money in a provider's own currency (usually USD) stays in that currency here; conversion to Rupiah happens in catalog.ts.
 */
import type { OrderStatus } from "@/lib/orders-data";

/** One row of the provider's catalogue (action=services), cleaned up but not yet priced in Rupiah. */
export type ProviderServiceInfo = {
  id: string;
  name: string;
  category: string;
  /** Price per 1000 in the provider's currency. */
  rate: number;
  min: number;
  max: number;
  refill: boolean;
  cancel: boolean;
  /** "Default", "Package", "Custom Comments", ... (as the provider sends it). */
  type: string;
};

/** Order status after mapping. `gagal` = the provider reports a failure; `null` = unknown text (keep the old status). */
export type MappedProviderStatus = OrderStatus | "gagal" | null;

export type ProviderOrderStatus = {
  /** Raw status text from the provider. */
  raw: string;
  status: MappedProviderStatus;
  startCount: number;
  remains: number;
  charge: number | null;
  currency: string | null;
};

export type ProviderBalance = { balance: number; currency: string };

export type BatchStatusItem = { ok: true; status: ProviderOrderStatus } | { ok: false; error: string };
export type CancelResult = { ok: true } | { ok: false; error: string };

export interface ProviderAdapter {
  readonly mode: "mock" | "live";
  getServices(): Promise<ProviderServiceInfo[]>;
  getBalance(): Promise<ProviderBalance>;
  /** NEVER retried automatically: a timeout here is ambiguous (the order may exist at the provider). */
  createOrder(input: { serviceId: string; link: string; quantity: number }): Promise<{ orderId: string }>;
  getOrderStatus(id: string): Promise<ProviderOrderStatus>;
  /** Up to 100 ids per call. */
  getOrdersStatus(ids: string[]): Promise<Record<string, BatchStatusItem>>;
  requestRefill(id: string): Promise<{ refillId: string }>;
  requestCancel(ids: string[]): Promise<Record<string, CancelResult>>;
}

export const MAX_STATUS_BATCH = 100;
