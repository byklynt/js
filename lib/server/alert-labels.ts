import type { AlertKind } from "./types";

export const alertLabels: Record<AlertKind, string> = {
  provider_balance_low: "Saldo provider rendah",
  provider_sync_failing: "Sinkronisasi provider gagal 3x",
  orders_stuck: "Pesanan macet melewati batas",
  large_deposit: "Deposit besar",
  new_ticket: "Tiket baru",
  new_admin_login: "Login admin baru",
  refund_mismatch: "Refund tidak sesuai perhitungan",
};
