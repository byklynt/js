export type RefundStatus = "dibatalkan" | "sebagian";

export type Refund = {
  id: string;
  orderId: string;
  amount: number;
  status: RefundStatus;
  createdAt: string;
};

export const refundStatusLabels: Record<RefundStatus, string> = {
  dibatalkan: "Dibatalkan",
  sebagian: "Sebagian",
};

export const refundStatusFilters: { id: RefundStatus | "semua"; label: string }[] = [
  { id: "semua", label: "Semua" },
  { id: "dibatalkan", label: "Dibatalkan" },
  { id: "sebagian", label: "Sebagian" },
];

