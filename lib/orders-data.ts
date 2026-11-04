export type OrderStatus =
  | "menunggu"
  | "diproses"
  | "berjalan"
  | "selesai"
  | "sebagian"
  | "dibatalkan"
  /** Could not be submitted to the provider after 3 attempts; the charge is refunded automatically. */
  | "gagal_kirim";

export type Order = {
  id: string;
  serviceId: string;
  platform: string;
  name: string;
  link: string;
  charge: number;
  quantity: number;
  startCount: number;
  remains: number;
  status: OrderStatus;
  createdAt: string;
  refillable: boolean;
};

export const orderStatusLabels: Record<OrderStatus, string> = {
  menunggu: "Menunggu",
  diproses: "Diproses",
  berjalan: "Sedang berjalan",
  selesai: "Selesai",
  sebagian: "Sebagian",
  dibatalkan: "Dibatalkan",
  gagal_kirim: "Gagal kirim",
};

export const orderStatusFilters: { id: OrderStatus | "semua"; label: string }[] = [
  { id: "semua", label: "Semua" },
  { id: "menunggu", label: "Menunggu" },
  { id: "diproses", label: "Diproses" },
  { id: "berjalan", label: "Sedang berjalan" },
  { id: "selesai", label: "Selesai" },
  { id: "sebagian", label: "Sebagian" },
  { id: "dibatalkan", label: "Dibatalkan" },
  { id: "gagal_kirim", label: "Gagal kirim" },
];

