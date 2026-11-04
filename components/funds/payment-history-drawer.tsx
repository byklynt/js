"use client";

import { History, ReceiptText } from "lucide-react";
import { payments } from "@/lib/payments-data";
import { Drawer } from "@/components/ui/drawer";
import { PaymentHistoryItem } from "./payment-history-item";

export function PaymentHistoryDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Drawer open={open} onClose={onClose} title="Riwayat Pembayaran" icon={History}>
      {payments.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-accent dark:bg-primary-soft">
            <ReceiptText className="h-5 w-5" />
          </span>
          <p className="text-[11px] font-semibold text-ink dark:text-slate-200">
            Belum ada riwayat pembayaran
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {payments.map((p) => (
            <PaymentHistoryItem key={p.id} payment={p} />
          ))}
        </ul>
      )}
    </Drawer>
  );
}
