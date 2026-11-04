export type PaymentStatus = "berhasil" | "menunggu" | "gagal";

export type Payment = {
  id: string;
  method: string;
  amount: number;
  status: PaymentStatus;
  createdAt: string;
};

export const presetAmounts = [25000, 50000, 100000, 500000] as const;

export type PaymentMethod = {
  id: string;
  name: string;
  detail?: string;
  featured?: boolean;
  /** Needs a payment gateway + signed webhook (not available yet). */
  needsGateway?: boolean;
};

export const paymentMethods: PaymentMethod[] = [
  { id: "manual", name: "Transfer manual", detail: "dikonfirmasi admin setelah pembayaran diterima", featured: true },
  { id: "qris", name: "QRIS", needsGateway: true },
  { id: "bank", name: "Transfer Bank", detail: "BCA, BRI, Mandiri, BNI", needsGateway: true },
  { id: "ewallet", name: "E-Wallet", detail: "DANA, OVO, GoPay, ShopeePay", needsGateway: true },
  { id: "va", name: "Virtual Account", needsGateway: true },
];
