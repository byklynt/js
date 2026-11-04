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

// Mock data. TODO: load from the refunds API.
export const refunds: Refund[] = [
  { id: "r1", orderId: "6977964", amount: 3000, status: "dibatalkan", createdAt: "2026-10-30T19:53:10+07:00" },
  { id: "r2", orderId: "7112481", amount: 2600, status: "dibatalkan", createdAt: "2026-10-19T08:30:43+07:00" },
  { id: "r3", orderId: "7025157", amount: 3300, status: "dibatalkan", createdAt: "2026-10-12T05:39:51+07:00" },
  { id: "r4", orderId: "6932877", amount: 6600, status: "sebagian", createdAt: "2026-10-11T18:49:56+07:00" },
  { id: "r5", orderId: "6996240", amount: 13800, status: "dibatalkan", createdAt: "2026-10-05T08:10:00+07:00" },
  { id: "r6", orderId: "6996050", amount: 33700, status: "dibatalkan", createdAt: "2026-10-05T07:21:28+07:00" },
  { id: "r7", orderId: "6951203", amount: 8000, status: "dibatalkan", createdAt: "2026-10-04T13:12:29+07:00" },
  { id: "r8", orderId: "6918440", amount: 13600, status: "dibatalkan", createdAt: "2026-10-04T13:12:29+07:00" },
  { id: "r9", orderId: "6890125", amount: 1700, status: "dibatalkan", createdAt: "2026-10-04T13:11:38+07:00" },
  { id: "r10", orderId: "6829742", amount: 9400, status: "sebagian", createdAt: "2026-10-03T22:04:17+07:00" },
  { id: "r11", orderId: "6871934", amount: 4200, status: "dibatalkan", createdAt: "2026-10-02T15:27:09+07:00" },
  { id: "r12", orderId: "6850011", amount: 21500, status: "dibatalkan", createdAt: "2026-10-01T09:45:52+07:00" },
  { id: "r13", orderId: "6977964", amount: 5100, status: "sebagian", createdAt: "2026-09-29T20:36:41+07:00" },
  { id: "r14", orderId: "6932877", amount: 7800, status: "dibatalkan", createdAt: "2026-09-28T12:08:23+07:00" },
];
