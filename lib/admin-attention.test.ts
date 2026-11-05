import { describe, expect, it } from "vitest";
import { attentionCards, type AttentionInput } from "./admin-attention";

const zero: AttentionInput = { stats: { pendingTickets: 0 }, failedCount: 0, stuck: { total: 0, main: null }, reconciliation: { refundMismatches: 0 }, pendingDeposits: 0, thinMargin: 0, flaggedUsers: 0 };
const LABELS = ["Tiket Menunggu", "Order Gagal Kirim", "Order Macet", "Refund Tidak Sesuai", "Deposit Menunggu", "Margin Tipis", "Perlu Ditinjau"];

describe("attentionCards", () => {
  it("shows all seven cards with count 0 and a neutral tone when nothing needs attention", () => {
    const cards = attentionCards(zero);
    expect(cards.map((c) => c.label)).toEqual(LABELS);
    for (const c of cards) expect(c).toMatchObject({ value: "0", tone: "slate" });
  });
  it("colours only the cards that have something to do, and keeps the real (uncapped) numbers", () => {
    const cards = attentionCards({ ...zero, failedCount: 1234, stats: { pendingTickets: 3 }, stuck: { total: 2, main: "provider_error" } });
    const by = Object.fromEntries(cards.map((c) => [c.label, c]));
    expect(by["Order Gagal Kirim"]).toMatchObject({ value: "1.234", tone: "amber" });
    expect(by["Tiket Menunggu"]).toMatchObject({ value: "3", tone: "rose" });
    expect(by["Order Macet"]).toMatchObject({ value: "2", tone: "sky", actionLabel: "Penyebab: provider error" });
    expect(by["Deposit Menunggu"]).toMatchObject({ value: "0", tone: "slate" });
    expect(cards).toHaveLength(7);
  });
});
