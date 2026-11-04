export type RefillStatus = "menunggu" | "berjalan" | "selesai" | "ditolak";

export type RefillRequest = {
  id: string;
  orderId: string;
  platform: string;
  name: string;
  link: string;
  status: RefillStatus;
  createdAt: string;
};

export const refillStatusLabels: Record<RefillStatus, string> = {
  menunggu: "Menunggu",
  berjalan: "Sedang berjalan",
  selesai: "Selesai",
  ditolak: "Ditolak",
};

export const refillStatusFilters: { id: RefillStatus | "semua"; label: string }[] = [
  { id: "semua", label: "Semua" },
  { id: "menunggu", label: "Menunggu" },
  { id: "berjalan", label: "Sedang berjalan" },
  { id: "selesai", label: "Selesai" },
  { id: "ditolak", label: "Ditolak" },
];

