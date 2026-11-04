export type PaymentStatus = "berhasil" | "menunggu" | "gagal";

export type Payment = {
  id: string;
  method: string;
  amount: number;
  status: PaymentStatus;
  createdAt: string;
};

// Mock data. TODO: load from the payments API.
export const payments: Payment[] = [
  { id: "215593", method: "QRIS", amount: 100000, status: "berhasil", createdAt: "2026-10-30T14:46:47+07:00" },
  { id: "215309", method: "E-Wallet (DANA)", amount: 50000, status: "berhasil", createdAt: "2026-10-29T09:03:02+07:00" },
  { id: "214870", method: "Transfer Bank (BCA)", amount: 250000, status: "menunggu", createdAt: "2026-10-27T20:15:11+07:00" },
  { id: "214102", method: "Virtual Account", amount: 75000, status: "gagal", createdAt: "2026-10-22T11:40:36+07:00" },
  { id: "213556", method: "QRIS", amount: 500000, status: "berhasil", createdAt: "2026-10-15T16:27:58+07:00" },
];

export const bonusTiers = [
  { min: 1000000, percent: 6 },
  { min: 500000, percent: 5 },
  { min: 100000, percent: 3 },
] as const;

export const minDeposit = 10000;

export const presetAmounts = [25000, 50000, 100000, 500000] as const;

export function getBonusPercent(amount: number): number {
  return bonusTiers.find((t) => amount >= t.min)?.percent ?? 0;
}

export type PaymentMethod = {
  id: string;
  name: string;
  detail?: string;
  featured?: boolean;
};

export const paymentMethods: PaymentMethod[] = [
  { id: "qris", name: "QRIS", featured: true },
  { id: "bank", name: "Transfer Bank", detail: "BCA, BRI, Mandiri, BNI" },
  { id: "ewallet", name: "E-Wallet", detail: "DANA, OVO, GoPay, ShopeePay" },
  { id: "va", name: "Virtual Account" },
  { id: "crypto", name: "Crypto" },
];
