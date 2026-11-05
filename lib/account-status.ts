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
