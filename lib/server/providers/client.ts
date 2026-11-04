/**
 * Glue between the provider adapters and the order / sync code (which talks to the older ProviderClient interface).
 * Likeo goes through the adapter (mock or live, PROVIDER_MODE); the three demo providers keep the db-backed mock.
 */
import type { AdminDb } from "@/lib/admin-data";
import { toProviderStatus } from "../rules";
import { createMockProviderClient, ProviderError, type ProviderClient } from "../provider-client";
import type { ProviderOrderState } from "../types";
import { likeoApiKey, likeoApiUrl, LIKEO_ID, providerMode } from "./config";
import { createLikeoAdapter } from "./likeo";
import { createMockAdapter } from "./mock";
import type { MappedProviderStatus, ProviderAdapter, ProviderOrderStatus } from "./types";

/** The adapter for the current PROVIDER_MODE. In live mode a missing key throws a clear developer error. */
export function getAdapter(db: AdminDb): ProviderAdapter {
  const mode = providerMode();
  if (mode === "mock") return createMockAdapter(db, LIKEO_ID);
  if (mode === "off") throw new ProviderError("Provider belum aktif. Isi PROVIDER_MODE=live di .env.local lalu restart server.", { kind: "config" });
  return createLikeoAdapter({ apiUrl: likeoApiUrl(), apiKey: likeoApiKey(), mode: "live" });
}

/** Canonical status text the existing sync rules understand. Unknown status text is passed on as is: the sync rules keep the old status and log it. */
function toState(s: ProviderOrderStatus): ProviderOrderState {
  const mapped: MappedProviderStatus = s.status;
  const status = mapped === null ? s.raw : mapped === "gagal" ? "Failed" : toProviderStatus(mapped);
  return { status, startCount: s.startCount, remains: s.remains };
}

export function createProviderClient(db: AdminDb): ProviderClient {
  const demo = createMockProviderClient(db);
  const adapter = () => getAdapter(db);
  const isLikeo = (id: string) => id === LIKEO_ID;

  return {
    async addOrder(providerId, input) {
      if (!isLikeo(providerId)) return demo.addOrder(providerId, input);
      const res = await adapter().createOrder({ serviceId: input.service, link: input.link, quantity: input.quantity });
      return { providerOrderId: res.orderId };
    },
    async getOrderStatus(providerId, id) {
      if (!isLikeo(providerId)) return demo.getOrderStatus(providerId, id);
      return toState(await adapter().getOrderStatus(id));
    },
    async cancelOrder(providerId, id) {
      if (!isLikeo(providerId)) return demo.cancelOrder(providerId, id);
      const res = (await adapter().requestCancel([id]))[id];
      if (!res?.ok) throw new ProviderError(res?.error ?? "Likeo menolak pembatalan.", { kind: "provider" });
      return { requestId: `cancel-${id}` };
    },
    async refillOrder(providerId, id) {
      if (!isLikeo(providerId)) return demo.refillOrder(providerId, id);
      const res = await adapter().requestRefill(id);
      return { requestId: res.refillId };
    },
    async getBalance(providerId) {
      if (!isLikeo(providerId)) return demo.getBalance(providerId);
      const b = await adapter().getBalance();
      const p = db.settings.pricing;
      return Math.round(b.currency.toUpperCase() === p.currency.toUpperCase() ? b.balance * p.rateIdr : b.balance);
    },
    async getOrdersStatus(providerId, ids) {
      if (!isLikeo(providerId)) {
        const out: Record<string, ProviderOrderState | Error> = {};
        for (const id of ids) {
          try { out[id] = await demo.getOrderStatus(providerId, id); } catch (e) { out[id] = e instanceof Error ? e : new Error("error"); }
        }
        return out;
      }
      const res = await adapter().getOrdersStatus(ids);
      const out: Record<string, ProviderOrderState | Error> = {};
      for (const id of ids) {
        const item = res[id];
        out[id] = item?.ok ? toState(item.status) : new ProviderError(item?.ok === false ? item.error : "Status tidak ada di jawaban provider.");
      }
      return out;
    },
  };
}
