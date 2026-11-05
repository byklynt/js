import "server-only";
/**
 * Glue between the provider adapters and the order / sync code (which talks to the ProviderClient interface).
 * The only provider is Likeo; live calls read the URL and the (encrypted) key from the providers table
 * (lib/server/repo/providers.ts). PROVIDER_MODE=mock uses an in-memory fake that exists only for tests and experiments.
 */
import { createEmptyDb, type AdminDb } from "@/lib/admin-data";
import { loadSettings } from "@/lib/server/repo/settings";
import { likeoCredentials } from "@/lib/server/repo/providers";
import { toProviderStatus } from "../rules";
import { ProviderError, type ProviderClient } from "../provider-client";
import type { ProviderOrderState } from "../types";
import { LIKEO_ID, providerMode } from "./config";
import { createLikeoAdapter } from "./likeo";
import { createMockAdapter } from "./mock";
import type { MappedProviderStatus, ProviderAdapter, ProviderOrderStatus } from "./types";

/** In-memory world of the mock provider (mock mode only). */
export function mockWorld(): AdminDb {
  const g = globalThis as unknown as { __sgMockWorld?: AdminDb };
  return (g.__sgMockWorld ??= createEmptyDb());
}

/** The adapter for the current PROVIDER_MODE. In live mode a missing key throws a clear developer error. */
export async function getAdapter(): Promise<ProviderAdapter> {
  const mode = providerMode();
  if (mode === "mock") return createMockAdapter(mockWorld(), LIKEO_ID);
  if (mode === "off") throw new ProviderError("Provider belum aktif. Isi PROVIDER_MODE=live di .env.local lalu restart server.", { kind: "config" });
  const { apiUrl, apiKey } = await likeoCredentials();
  if (!apiKey) throw new ProviderError("API key Likeo belum diisi. Jalankan npm run bootstrap setelah mengisi LIKEO_API_KEY dan PROVIDER_KEY_ENC_KEY.", { kind: "config" });
  return createLikeoAdapter({ apiUrl, apiKey, mode: "live" });
}

/** Canonical status text the sync rules understand. Unknown status text is passed on as is: the sync keeps the old status and logs it. */
function toState(s: ProviderOrderStatus): ProviderOrderState {
  const mapped: MappedProviderStatus = s.status;
  const status = mapped === null ? s.raw : mapped === "gagal" ? "Failed" : toProviderStatus(mapped);
  return { status, raw: s.raw, startCount: s.startCount, remains: s.remains };
}

export function createProviderClient(): ProviderClient {
  return {
    async addOrder(_providerId, input) {
      const res = await (await getAdapter()).createOrder({ serviceId: input.service, link: input.link, quantity: input.quantity });
      return { providerOrderId: res.orderId };
    },
    async getOrderStatus(_providerId, id) {
      return toState(await (await getAdapter()).getOrderStatus(id));
    },
    async cancelOrder(_providerId, id) {
      const res = (await (await getAdapter()).requestCancel([id]))[id];
      if (!res?.ok) throw new ProviderError(res?.ok === false ? res.error : "Likeo menolak pembatalan.", { kind: "provider" });
      return { requestId: `cancel-${id}` };
    },
    async refillOrder(_providerId, id) {
      const res = await (await getAdapter()).requestRefill(id);
      return { requestId: res.refillId };
    },
    async getBalance() {
      const b = await (await getAdapter()).getBalance();
      const p = (await loadSettings()).pricing;
      return Math.round(b.currency.toUpperCase() === p.currency.toUpperCase() ? b.balance * p.rateIdr : b.balance);
    },
    async getRefillStatuses(_providerId, refillIds) {
      return (await getAdapter()).getRefillStatuses(refillIds);
    },
    async getCancelStatuses(_providerId, orderIds) {
      return (await getAdapter()).getCancelStatuses(orderIds);
    },
    async getOrdersStatus(_providerId, ids) {
      const res = await (await getAdapter()).getOrdersStatus(ids);
      const out: Record<string, ProviderOrderState | Error> = {};
      for (const id of ids) {
        const item = res[id];
        out[id] = item?.ok ? toState(item.status) : new ProviderError(item?.ok === false ? item.error : "Status tidak ada di jawaban provider.");
      }
      return out;
    },
  };
}
