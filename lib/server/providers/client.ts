import "server-only";
/**
 * Glue between the provider adapters and the order / sync code (which talks to the ProviderClient interface).
 * Every call carries the provider id and is routed to THAT provider: its URL and (encrypted) key come from the providers table
 * (lib/server/repo/providers.ts), all providers speak the generic smm-v2 adapter. PROVIDER_MODE=mock uses an in-memory fake (tests, dev).
 * Live calls need PROVIDER_MODE=live AND PROVIDER_LIVE_APPROVED_REF = this project (see config.ts providerMode): the same guard for every provider.
 */
import { createEmptyDb, type AdminDb } from "@/lib/admin-data";
import { loadSettings } from "@/lib/server/repo/settings";
import { loadProvider, providerCredentials } from "@/lib/server/repo/providers";
import { toProviderStatus } from "../rules";
import { ProviderError, type ProviderClient } from "../provider-client";
import type { ProviderOrderState } from "../types";
import { customCommentsEnabled, LIKEO_ID, providerMode } from "./config";
import { createMockAdapter } from "./mock";
import { nativeToRupiah, providerRate } from "./rates";
import { createSmmV2Adapter } from "./smm-v2";
import type { MappedProviderStatus, ProviderAdapter, ProviderOrderStatus } from "./types";

/** In-memory world of the mock provider (mock mode only). */
export function mockWorld(): AdminDb {
  const g = globalThis as unknown as { __sgMockWorld?: AdminDb };
  return (g.__sgMockWorld ??= createEmptyDb());
}

/** The adapter for ONE provider under the current PROVIDER_MODE. In live mode a missing key / unknown provider throws a clear error. */
export async function getAdapter(providerId: string = LIKEO_ID): Promise<ProviderAdapter> {
  const mode = providerMode();
  if (mode === "mock") return createMockAdapter(mockWorld(), providerId);
  if (mode === "off") throw new ProviderError("Provider belum aktif. Isi PROVIDER_MODE=live di .env.local lalu restart server.", { kind: "config" });
  const creds = await providerCredentials(providerId);
  if (!creds) throw new ProviderError("Provider tidak ditemukan.", { kind: "config" });
  if (!creds.apiKey) throw new ProviderError(`API key ${creds.name} belum diisi. Simpan API key di halaman Provider.`, { kind: "config" });
  if (!creds.apiUrl) throw new ProviderError(`URL API ${creds.name} belum diisi.`, { kind: "config" });
  // Custom Comments was verified against Likeo only; other providers refuse it live until someone verifies their format.
  return createSmmV2Adapter({ apiUrl: creds.apiUrl, apiKey: creds.apiKey, mode: "live", providerName: creds.name, customComments: customCommentsEnabled() && providerId === LIKEO_ID });
}

/** Canonical status text the sync rules understand. Unknown status text is passed on as is: the sync keeps the old status and logs it. */
function toState(s: ProviderOrderStatus): ProviderOrderState {
  const mapped: MappedProviderStatus = s.status;
  const status = mapped === null ? s.raw : mapped === "gagal" ? "Failed" : toProviderStatus(mapped);
  return { status, raw: s.raw, startCount: s.startCount, remains: s.remains };
}

export function createProviderClient(): ProviderClient {
  return {
    async addOrder(providerId, input) {
      const res = await (await getAdapter(providerId)).createOrder({ serviceId: input.service, link: input.link, quantity: input.quantity, ...(input.comments ? { comments: input.comments } : {}) });
      return { providerOrderId: res.orderId };
    },
    async getOrderStatus(providerId, id) {
      return toState(await (await getAdapter(providerId)).getOrderStatus(id));
    },
    async cancelOrder(providerId, id) {
      const res = (await (await getAdapter(providerId)).requestCancel([id]))[id];
      if (!res?.ok) throw new ProviderError(res?.ok === false ? res.error : "Provider menolak pembatalan.", { kind: "provider" });
      return { requestId: `cancel-${id}` };
    },
    async refillOrder(providerId, id) {
      const res = await (await getAdapter(providerId)).requestRefill(id);
      return { requestId: res.refillId };
    },
    async getBalance(providerId) {
      const b = await (await getAdapter(providerId)).getBalance();
      const [settings, provider] = await Promise.all([loadSettings(), loadProvider(providerId)]);
      return nativeToRupiah(b.balance, b.currency, providerRate(provider ?? undefined, settings.pricing)) ?? 0;
    },
    async getRefillStatuses(providerId, refillIds) {
      return (await getAdapter(providerId)).getRefillStatuses(refillIds);
    },
    async getCancelStatuses(providerId, orderIds) {
      return (await getAdapter(providerId)).getCancelStatuses(orderIds);
    },
    async getOrdersStatus(providerId, ids) {
      const res = await (await getAdapter(providerId)).getOrdersStatus(ids);
      const out: Record<string, ProviderOrderState | Error> = {};
      for (const id of ids) {
        const item = res[id];
        out[id] = item?.ok ? toState(item.status) : new ProviderError(item?.ok === false ? item.error : "Status tidak ada di jawaban provider.");
      }
      return out;
    },
  };
}
