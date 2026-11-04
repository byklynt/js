"use client";

import { useState } from "react";
import type { AdminUser } from "@/lib/admin-data";
import { formatIdr } from "@/lib/balance";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type Target = { user: AdminUser; direction: "tambah" | "kurangi" } | null;

/** Two steps: amount + reason, then a password re-entry confirmation before the balance changes. */
export function BalanceModal({
  target,
  onClose,
  onSubmit,
}: {
  target: Target;
  onClose: () => void;
  onSubmit: (values: {
    userId: string;
    direction: "tambah" | "kurangi";
    amount: number;
    reason: string;
    password: string;
  }) => Promise<boolean>;
}) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<{ amount?: string; reason?: string }>({});
  const [confirming, setConfirming] = useState(false);

  const amountNumber = Number(amount.replace(/\D/g, ""));

  function reset() {
    setAmount("");
    setReason("");
    setErrors({});
    setConfirming(false);
  }

  function close() {
    reset();
    onClose();
  }

  function next(e: React.FormEvent) {
    e.preventDefault();
    const nextErrors: typeof errors = {};
    if (!amountNumber || amountNumber < 1) nextErrors.amount = "Jumlah harus lebih dari 0.";
    else if (amountNumber > 100_000_000) nextErrors.amount = "Maksimal Rp 100.000.000 per penyesuaian.";
    else if (target?.direction === "kurangi" && amountNumber > target.user.balance)
      nextErrors.amount = "Jumlah melebihi saldo pengguna.";
    if (reason.trim().length < 5) nextErrors.reason = "Alasan minimal 5 karakter.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) setConfirming(true);
  }

  const verb = target?.direction === "tambah" ? "Tambah" : "Kurangi";

  return (
    <>
      <Dialog
        open={Boolean(target) && !confirming}
        onClose={close}
        title={`${verb} saldo ${target?.user.username ?? ""}`}
        description={target ? `Saldo saat ini ${formatIdr(target.user.balance)}.` : undefined}
        maxWidth="max-w-sm"
      >
        <form noValidate onSubmit={next} className="space-y-4">
          <TextField
            label="Jumlah (Rp)"
            inputMode="numeric"
            value={amount ? amountNumber.toLocaleString("id-ID") : ""}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            error={errors.amount}
          />
          <Textarea
            label="Alasan"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Contoh: kompensasi pesanan gagal"
            error={errors.reason}
            className="min-h-[72px]"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={close}>
              Batal
            </Button>
            <Button type="submit">Lanjutkan</Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={Boolean(target) && confirming}
        onClose={() => setConfirming(false)}
        title="Konfirmasi perubahan saldo"
        description={`${verb} ${formatIdr(amountNumber)} untuk ${target?.user.username ?? ""}. Masukkan password adminmu untuk melanjutkan.`}
        confirmLabel={`${verb} saldo`}
        tone={target?.direction === "kurangi" ? "danger" : "primary"}
        requirePassword
        onConfirm={async (password) => {
          if (!target) return;
          const ok = await onSubmit({
            userId: target.user.id,
            direction: target.direction,
            amount: amountNumber,
            reason,
            password,
          });
          if (ok) reset();
        }}
      />
    </>
  );
}
