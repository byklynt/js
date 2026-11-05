/**
 * Provider API boundary. Only server code may import this: it reads provider API keys.
 *
 * TODO(provider): replace `createMockProviderClient` with real HTTP calls to the provider's
 * reservation API (action=add / status / cancel / refill / balance) using provider.apiUrl + provider.apiKey.
 * Keep the same interface so orders.ts / sync.ts do not change.
 */
import type { AdminDb, AdminOrder } from "@/lib/admin-data";
import type { ProviderOrderState } from "./types";

export interface ProviderClient {
  addOrder(providerId: string, input: { service: string; link: string; quantity: number }): Promise<{ providerOrderId: string }>;
  getOrderStatus(providerId: string, providerOrderId: string): Promise<ProviderOrderState>;
  cancelOrder(providerId: string, providerOrderId: string): Promise<{ requestId: string }>;
  refillOrder(providerId: string, providerOrderId: string): Promise<{ requestId: string }>;
  getBalance(providerId: string): Promise<number>;
  /** Read back refill requests (provider refill ids) and the outcome of forwarded cancellations (provider order ids). */
  getRefillStatuses?(providerId: string, refillIds: string[]): Promise<Record<string, import("./providers/types").RefillStatusItem>>;
  getCancelStatuses?(providerId: string, providerOrderIds: string[]): Promise<Record<string, import("./providers/types").CancelStatusItem>>;
  /** Optional batch status (up to 100 ids per call). Without it the sync job asks one order at a time. */
  getOrdersStatus?(providerId: string, providerOrderIds: string[]): Promise<Record<string, ProviderOrderState | Error>>;
}

export type ProviderErrorKind = "config" | "timeout" | "network" | "http" | "provider" | "invalid" | "unknown";

/**
 * `ambiguous` = we cannot tell whether the provider acted (timeout, dropped connection, 5xx, unreadable answer).
 * For "add order" this must never be retried automatically: the order may already exist at the provider.
 */
export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly ambiguous: boolean;
  constructor(message: string, opts: { kind?: ProviderErrorKind; ambiguous?: boolean } = {}) {
    super(message);
    this.name = "ProviderError";
    this.kind = opts.kind ?? "unknown";
    this.ambiguous = opts.ambiguous ?? false;
  }
}

/** Mock provider backed by db.providerOrders. `db.providerDown` simulates an outage. */
export function createMockProviderClient(db: AdminDb): ProviderClient {
  const guard = (providerId: string) => {
    if (db.providerDown.includes(providerId)) throw new ProviderError("Provider API tidak merespons");
  };
  return {
    async addOrder(providerId, input) {
      guard(providerId);
      const providerOrderId = `PRV-${900_000 + db.orders.length * 7 + Math.floor(Math.random() * 6)}`;
      db.providerOrders[providerOrderId] = { status: "Pending", startCount: 0, remains: input.quantity };
      return { providerOrderId };
    },
    async getOrderStatus(providerId, providerOrderId) {
      guard(providerId);
      const state = db.providerOrders[providerOrderId];
      if (!state) throw new ProviderError("Pesanan tidak ditemukan di provider");
      return { ...state };
    },
    async cancelOrder(providerId, providerOrderId) {
      guard(providerId);
      return { requestId: `PCX-${providerOrderId}` };
    },
    async refillOrder(providerId, providerOrderId) {
      guard(providerId);
      return { requestId: `PRQ-${providerOrderId}` };
    },
    async getBalance(providerId) {
      guard(providerId);
      return db.providers.find((p) => p.id === providerId)?.balance ?? 0;
    },
  };
}

export type ProviderOrderRef = Pick<AdminOrder, "providerId" | "providerOrderId">;
