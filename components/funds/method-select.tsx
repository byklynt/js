"use client";

import { Bitcoin, Building2, CreditCard, QrCode, Smartphone } from "lucide-react";
import { paymentMethods, type PaymentMethod } from "@/lib/payments-data";
import { CustomSelect } from "@/components/ui/select";

const methodIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  qris: QrCode,
  bank: Building2,
  ewallet: Smartphone,
  va: CreditCard,
  crypto: Bitcoin,
};

function MethodLabel({ method }: { method: PaymentMethod }) {
  const Icon = methodIcons[method.id] ?? CreditCard;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Icon className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
      {method.featured ? (
        <span className="shrink-0 rounded-full bg-primary-soft px-2 py-0.5 text-[9px] font-semibold text-primary-accent">
          Pilihan Utama
        </span>
      ) : null}
      <span className="min-w-0 truncate">
        {method.name}
        {method.detail ? (
          <span className="text-[#5B6B8C] dark:text-slate-400"> ({method.detail})</span>
        ) : null}
      </span>
    </span>
  );
}

export function MethodSelect({
  value,
  onChange,
}: {
  value: PaymentMethod | null;
  onChange: (next: PaymentMethod) => void;
}) {
  return (
    <CustomSelect
      label="Metode pembayaran"
      options={paymentMethods}
      value={value}
      onChange={onChange}
      getKey={(m) => m.id}
      placeholder="Pilih metode pembayaran"
      renderValue={(m) => <MethodLabel method={m} />}
      renderOption={(m) => <MethodLabel method={m} />}
      triggerClassName="h-[38px] rounded-xl"
    />
  );
}
