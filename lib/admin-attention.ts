import { Ban, Headset, ShoppingCart, TrendingDown, Undo2, UserSearch, WalletCards, type LucideIcon } from "lucide-react";
import type { StatTone } from "@/lib/dashboard-data";

export type AttentionInput = {
  stats: { pendingTickets: number };
  failedCount: number;
  stuck: { total: number; main: "provider_error" | "waiting_provider" | null };
  reconciliation: { refundMismatches: number };
  pendingDeposits: number;
  thinMargin: number;
  flaggedUsers: number;
};
export type AttentionCard = { label: string; value: string; icon: LucideIcon; tone: StatTone; actionLabel: string; actionHref: string };

/**
 * The seven "Perlu Tindakan" cards. All seven are ALWAYS returned; a count of 0 gets the neutral tone ("slate")
 * so the card stays visible and calm instead of disappearing.
 */
export function attentionCards(data: AttentionInput): AttentionCard[] {
  const stuckCause = data.stuck.main === "provider_error" ? "Penyebab: provider error" : data.stuck.main === "waiting_provider" ? "Penyebab: menunggu provider" : "Lihat pesanan";
  const cards: { label: string; value: number; icon: LucideIcon; tone: Exclude<StatTone, "slate">; actionLabel: string; actionHref: string }[] = [
    { label: "Tiket Menunggu", value: data.stats.pendingTickets, icon: Headset, tone: "rose", actionLabel: "Buka tiket", actionHref: "/admin/tickets?status=menunggu" },
    { label: "Order Gagal Kirim", value: data.failedCount, icon: Ban, tone: "amber", actionLabel: "Lihat pesanan", actionHref: "/admin/orders?status=gagal_kirim" },
    { label: "Order Macet", value: data.stuck.total, icon: ShoppingCart, tone: "sky", actionLabel: stuckCause, actionHref: "/admin/orders?status=macet" },
    { label: "Refund Tidak Sesuai", value: data.reconciliation.refundMismatches, icon: Undo2, tone: "rose", actionLabel: "Periksa refund", actionHref: "/admin/refunds?mismatch=1" },
    { label: "Deposit Menunggu", value: data.pendingDeposits, icon: WalletCards, tone: "amber", actionLabel: "Lihat deposit", actionHref: "/admin/deposits?status=menunggu" },
    { label: "Margin Tipis", value: data.thinMargin, icon: TrendingDown, tone: "amber", actionLabel: "Lihat layanan", actionHref: "/admin/services?margin=thin" },
    { label: "Perlu Ditinjau", value: data.flaggedUsers, icon: UserSearch, tone: "rose", actionLabel: "Lihat pengguna", actionHref: "/admin/users?status=review" },
  ];
  return cards.map((c) => ({ ...c, tone: c.value > 0 ? c.tone : "slate", value: c.value.toLocaleString("id-ID") }));
}
