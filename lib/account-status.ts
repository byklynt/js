/** Client-safe constants about blocked ("dibekukan") accounts. */

/** The one message a blocked user ever sees (login, orders, deposits, tickets). It never says why. */
export const BLOCKED_MESSAGE = "Akun kamu dibekukan. Hubungi bantuan.";

/** Reasons an admin can pick when blocking an account. The pick (and an optional note) goes to the audit log. */
export const BAN_REASONS = [
  "Pelanggaran kebijakan konten",
  "Penipuan atau chargeback",
  "Penyalahgunaan bug atau saldo",
  "Multi-akun untuk promo",
  "Permintaan refund berulang yang tidak wajar",
  "Lainnya",
] as const;
export type BanReason = (typeof BAN_REASONS)[number];

/** Reasons for cancelling an order for a policy violation (no refund). Stored on the order and in the audit log. */
export const VIOLATION_REASONS = ["Pelanggaran kebijakan konten", "SARA/kekerasan", "Penipuan", "Lainnya"] as const;

/** What an admin can decide about the balance of a blocked account. */
export const SETTLE_CHOICES = [
  { id: "kembalikan", label: "Kembalikan ke pengguna", hint: "Saldo dibayarkan kepada pengguna di luar sistem; saldo di akun dikurangi lewat penyesuaian saldo." },
  { id: "hanguskan", label: "Hanguskan", hint: "Saldo dihapus lewat penyesuaian saldo karena pelanggaran." },
  { id: "tahan", label: "Biarkan ditahan", hint: "Tidak ada perubahan saldo; keputusan dicatat di log audit." },
] as const;
export type SettleChoice = (typeof SETTLE_CHOICES)[number]["id"];
