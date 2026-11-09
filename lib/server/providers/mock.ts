/**
 * Mock provider (PROVIDER_MODE=mock, the default): deterministic fake data so the app works without an API key.
 * Orders live in db.providerOrders, the same place the older mock client uses, so seeded orders keep working.
 * An order created here ("MK-...") advances by itself: Pending -> In progress (first status check) -> Completed (second).
 */
import type { AdminDb } from "@/lib/admin-data";
import { ProviderError } from "../provider-client";
import { LIKEO_ID } from "./config";
import { readMockOverride } from "./mock-overrides";
import { cancelStateFromStatus, mapRefillStatus, mapSmmStatus as mapLikeoStatus } from "./smm-v2";
import type { BatchStatusItem, CancelResult, CancelStatusItem, RefillStatusItem, ProviderAdapter, ProviderOrderStatus, ProviderServiceInfo } from "./types";

const row = (id: number, name: string, category: string, rate: number, min: number, max: number, extra: Partial<ProviderServiceInfo> = {}): ProviderServiceInfo => ({
  id: String(id), name, category, rate, min, max, refill: false, cancel: false, type: "Default", ...extra,
});

/** A small fake Likeo catalogue. Rates are USD per 1000. Includes unsupported types and decorated names on purpose. */
export const MOCK_CATALOG: ProviderServiceInfo[] = [
  row(1001, "🔥 Instagram Followers | Real Mix | Refill 30D ⚡", "Instagram Followers", 0.85, 100, 100_000, { refill: true, cancel: true }),
  row(1002, "Instagram Followers | Non Drop | Instant", "Instagram Followers", 1.9, 100, 50_000, { refill: true }),
  row(1003, "Instagram Likes | Real | Fast", "Instagram Likes", 0.35, 50, 50_000, { cancel: true }),
  row(1004, "Instagram Auto Likes (Subscription)", "Instagram Likes", 2.4, 50, 5_000, { type: "Subscription" }),
  row(1005, "Instagram Custom Comments", "Instagram Comments", 6.5, 10, 1_000, { type: "Custom Comments" }),
  row(1006, "TikTok Views | Instant | Max 10M", "TikTok Views", 0.04, 100, 10_000_000, { cancel: true }),
  row(1007, "TikTok Followers | High Quality ✅", "TikTok Followers", 1.6, 100, 100_000, { refill: true }),
  row(1008, "YouTube Views | Retention 60s", "YouTube Views", 2.2, 500, 1_000_000),
  row(1009, "YouTube Subscribers | 30 Days Refill", "YouTube Subscribers", 9.5, 50, 10_000, { refill: true }),
  row(1010, "Telegram Members | Mixed", "Telegram Members", 0.9, 100, 100_000, { refill: true }),
  row(1011, "Telegram Post Views", "Telegram Views", 0.05, 100, 1_000_000, { cancel: true }),
  row(1012, "Facebook Page Likes + Followers", "Facebook Page Likes", 2.8, 100, 100_000),
  row(1013, "Twitter/X Followers | Global", "Twitter/X Followers", 3.1, 100, 50_000, { refill: true }),
  row(1014, "Spotify Plays | Premium Accounts", "Spotify Plays", 1.2, 1_000, 5_000_000),
  row(1015, "Website Traffic | Social Referral", "Website Traffic", 0.7, 1_000, 500_000),
  row(1016, "Reddit Upvotes | Mixed", "Reddit Upvotes", 4.2, 10, 5_000, { type: "Package" }),
];

/**
 * A second fake catalogue for every provider that is not the first one (smmsoc and others in mock mode). Different ids, names and prices, and a
 * different balance currency, so multi-provider routing, namespacing and per-provider rates can be tested without any network.
 */
export const MOCK_CATALOG_SECOND: ProviderServiceInfo[] = [
  row(5001, "Instagram Followers | Stabil", "Instagram Followers", 0.62, 50, 200_000, { refill: true, cancel: true }),
  row(5002, "Instagram Likes | Cepat", "Instagram Likes", 0.21, 20, 100_000, { cancel: true }),
  row(5003, "TikTok Views | Instan", "TikTok Views", 0.03, 100, 20_000_000),
  row(5004, "YouTube Watch Time", "YouTube Views", 5.5, 100, 100_000, { type: "Package" }),
  row(5005, "Facebook Custom Comments", "Facebook Comments", 7.2, 5, 500, { type: "Custom Comments" }),
];

/** The fake catalogue / balance of one provider (the first provider keeps the original fake). */
const catalogFor = (providerId: string) => (providerId === LIKEO_ID ? MOCK_CATALOG : MOCK_CATALOG_SECOND);
const balanceFor = (providerId: string) => (providerId === LIKEO_ID ? { balance: 75.5, currency: "USD" } : { balance: 31.25, currency: "USD" });

/** Mock refill lifecycle: Pending -> In progress (first read) -> Completed (second read). A refill id containing "REJECT" ends as Rejected. */
const refillPolls = new Map<string, number>();

const polls = new WeakMap<AdminDb, Map<string, number>>();
const pollsFor = (db: AdminDb) => {
  let m = polls.get(db);
  if (!m) polls.set(db, (m = new Map()));
  return m;
};

export function createMockAdapter(db: AdminDb, providerId: string = LIKEO_ID): ProviderAdapter {
  const guard = () => {
    if (db.providerDown.includes(providerId)) throw new ProviderError("Provider API tidak merespons", { kind: "network", ambiguous: false });
  };
  const statusOf = (id: string): ProviderOrderStatus => {
    // DEV simulator (npm run dev:simulate): a forced state wins over the demo lifecycle.
    const forced = readMockOverride(id);
    if (forced) db.providerOrders[id] = { status: forced.status, startCount: forced.startCount, remains: forced.remains };
    const state = db.providerOrders[id];
    if (!state) throw new ProviderError("ID pesanan tidak ditemukan di Likeo.", { kind: "provider" });
    // Only while it is still in its own demo lifecycle; a status set from outside (tests, admin edits) is left alone.
    if (!forced && id.startsWith("MK-") && (state.status === "Pending" || state.status === "In progress")) {
      const n = (pollsFor(db).get(id) ?? 0) + 1;
      pollsFor(db).set(id, n);
      if (n === 1) { state.status = "In progress"; state.startCount = 100; }
      else if (n >= 2) { state.status = "Completed"; state.remains = 0; }
    }
    return { raw: state.status, status: mapLikeoStatus(state.status), startCount: state.startCount, remains: state.remains, charge: null, currency: null };
  };

  return {
    mode: "mock",
    async getServices() {
      guard();
      return catalogFor(providerId).map((s) => ({ ...s }));
    },
    async getBalance() {
      guard();
      return balanceFor(providerId);
    },
    async createOrder({ serviceId, quantity, comments }) {
      guard();
      // Fixture providers (tests) historically ordered the first catalogue ids, so those stay accepted for them. Tests and the demo teach the mock a service id by registering it in the mock world; the first provider's entries count for every mock provider
      // (they were written when there was only one provider, and fixture providers have their own ids).
      if (!catalogFor(providerId).some((s) => s.id === serviceId) && !(providerId !== LIKEO_ID && MOCK_CATALOG.some((s) => s.id === serviceId)) && !db.services.some((s) => (s.providerId === providerId || s.providerId === LIKEO_ID) && s.providerServiceId === serviceId)) {
        throw new ProviderError("Layanan tidak ditemukan di Likeo.", { kind: "provider" });
      }
      if (comments && comments.length !== quantity) throw new ProviderError("Jumlah komentar tidak sama dengan jumlah pesanan.", { kind: "provider" });
      const orderId = `MK-${100_000 + Object.keys(db.providerOrders).length * 3 + 1}`;
      db.providerOrders[orderId] = { status: "Pending", startCount: 0, remains: quantity };
      return { orderId };
    },
    async getOrderStatus(id) {
      guard();
      return statusOf(id);
    },
    async getOrdersStatus(ids) {
      guard();
      const out: Record<string, BatchStatusItem> = {};
      for (const id of ids) {
        try { out[id] = { ok: true, status: statusOf(id) }; } catch (e) { out[id] = { ok: false, error: e instanceof Error ? e.message : "error" }; }
      }
      return out;
    },
    async requestRefill(id) {
      guard();
      if (!db.providerOrders[id]) throw new ProviderError("ID pesanan tidak ditemukan di Likeo.", { kind: "provider" });
      return { refillId: `MKR-${id}` };
    },
    async getRefillStatuses(refillIds) {
      guard();
      const out: Record<string, RefillStatusItem> = {};
      for (const id of refillIds) {
        if (!id.startsWith("MKR-")) { out[id] = { ok: false, error: "Status refill tidak ada di jawaban Likeo." }; continue; }
        const n = (refillPolls.get(id) ?? 0) + 1;
        refillPolls.set(id, n);
        const raw = id.includes("REJECT") ? "Rejected" : n === 1 ? "In progress" : "Completed";
        out[id] = { ok: true, raw, state: mapRefillStatus(raw) };
      }
      return out;
    },
    async getCancelStatuses(providerOrderIds) {
      guard();
      const out: Record<string, CancelStatusItem> = {};
      for (const id of providerOrderIds) {
        const state = db.providerOrders[id];
        out[id] = state ? { ok: true, raw: state.status, state: cancelStateFromStatus(state.status) } : { ok: false, error: "ID pesanan tidak ditemukan di Likeo." };
      }
      return out;
    },
    async requestCancel(ids) {
      guard();
      const out: Record<string, CancelResult> = {};
      for (const id of ids) {
        const state = db.providerOrders[id];
        if (!state) out[id] = { ok: false, error: "ID pesanan tidak ditemukan di Likeo." };
        else if (["Completed", "Partial", "Canceled"].includes(state.status)) out[id] = { ok: false, error: "Pesanan ini tidak bisa dibatalkan di Likeo." };
        else { state.status = "Canceled"; out[id] = { ok: true }; } // accepted: the next status read confirms it
      }
      return out;
    },
  };
}
