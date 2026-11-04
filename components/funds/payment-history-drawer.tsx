"use client";

import { useEffect, useState } from "react";
import { History, ReceiptText } from "lucide-react";
import { getMyDeposits, type MyDeposit } from "@/lib/user-actions";
import { Drawer } from "@/components/ui/drawer";
import { PaymentHistoryItem } from "./payment-history-item";

export function PaymentHistoryDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [payments, setPayments] = useState<MyDeposit[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void getMyDeposits()
      .then((list) => alive && (setPayments(list), setFailed(false)))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [open]);

  return (
    <Drawer open={open} onClose={onClose} title="Riwayat Pembayaran" icon={History}>
      {failed ? (
        <p role="alert" className="py-10 text-center text-[11px] text-red-500">Gagal memuat riwayat. Coba lagi.</p>
      ) : payments === null ? (
        <p aria-busy="true" className="py-10 text-center text-[11px] text-[#5B6B8C] dark:text-slate-400">Memuat...</p>
      ) : payments.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-accent dark:bg-primary-soft">
            <ReceiptText className="h-5 w-5" />
          </span>
          <p className="text-[11px] font-semibold text-ink dark:text-slate-200">Belum ada riwayat pembayaran</p>
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
