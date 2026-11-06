"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CreditCard, History, Loader2 } from "lucide-react";
import type { PaymentMethod } from "@/lib/payments-data";
import type { DepositConfig } from "@/lib/user-actions";
import { formatIdr } from "@/lib/balance";
import { createDeposit } from "@/lib/dashboard-actions";
import { submitGatewayDeposit } from "@/lib/user-actions";
import { amountLimits } from "@/lib/server/payments/gateway-rules";
import { feeSummary, gatewayMethodHint } from "@/lib/funds-copy";
import { useToast } from "@/components/shared/toast";
import { cn } from "@/lib/utils";
import { AmountPresets, type PresetValue } from "./amount-presets";
import { MethodSelect } from "./method-select";
import { PaymentHistoryDrawer } from "./payment-history-drawer";

function formatDigits(digits: string): string {
  return digits ? Number(digits).toLocaleString("id-ID") : "";
}

const presetAmounts = [25000, 50000, 100000, 500000] as const;

export function AddFundsCard({ config }: { config: DepositConfig }) {
  const { minDeposit, gateway } = config;
  // manual transfer (admin confirms) plus the Paymenku channels the admin enabled
  const paymentMethods: PaymentMethod[] = [
    ...gateway.channels.map((c, i): PaymentMethod => ({
      id: `gw:${c.code}`, name: c.name, kind: c.type, featured: i === 0,
      detail: gatewayMethodHint,
    })),
    ...config.methods,
  ];
  const router = useRouter();
  const getBonusPercent = (amount: number) => config.bonusTiers.find((t) => amount >= t.min)?.percent ?? 0;
  const toast = useToast();
  const amountId = useId();
  const amountErrorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [digits, setDigits] = useState("");
  const [customChosen, setCustomChosen] = useState(false);
  const [touched, setTouched] = useState(false);
  const [method, setMethod] = useState<PaymentMethod | null>(paymentMethods[0] ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const channel = method?.id.startsWith("gw:") ? (gateway.channels.find((c) => `gw:${c.code}` === method.id) ?? null) : null;
  const limits = channel ? amountLimits(channel, { minDeposit, maxDeposit: gateway.maxDeposit }) : { min: minDeposit, max: Number.POSITIVE_INFINITY };
  const amount = Number(digits || 0);
  const matchedPreset = presetAmounts.find((p) => p === amount);
  const selectedPreset: PresetValue = matchedPreset ?? (customChosen || digits ? "custom" : null);
  const belowMin = amount < limits.min;
  const aboveMax = amount > limits.max;
  const error = touched && belowMin ? `Minimal deposit ${formatIdr(limits.min)}.` : touched && aboveMax ? `Maksimal deposit ${formatIdr(limits.max)}.` : "";
  const summary = feeSummary(channel, amount, limits);
  const bonusPercent = getBonusPercent(amount);
  const canSubmit = !belowMin && !aboveMax && Boolean(method) && !submitting;

  function handlePreset(next: number | "custom") {
    if (next === "custom") {
      setCustomChosen(true);
      setDigits("");
      inputRef.current?.focus();
      return;
    }
    setCustomChosen(false);
    setDigits(String(next));
    setTouched(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!canSubmit || !method) return;
    setSubmitting(true);
    try {
      if (channel) {
        const res = await submitGatewayDeposit({ amount, channelCode: channel.code });
        if (res.ok && res.data) router.push(`/deposit/${res.data.id}`);
        else if (!res.ok) toast(res.error, "error");
        return;
      }
      const result = await createDeposit({ amount, method: method.id });
      if (result.success) {
        toast(`Permintaan deposit ${formatIdr(amount)} dibuat. Menunggu konfirmasi admin.`);
        setDigits("");
        setCustomChosen(false);
        setTouched(false);
      } else {
        toast(result.message, "error");
      }
    } catch {
      toast("Gagal membuat deposit. Coba lagi.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <section
        aria-labelledby="add-funds-title"
        className="relative z-10 mx-auto w-full max-w-[524px] rounded-3xl border border-slate-200/70 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-[10px] font-semibold text-primary-accent">
              Rp
            </span>
            <h2 id="add-funds-title" className="text-[13px] font-semibold text-ink dark:text-white">
              Tambah saldo
            </h2>
          </div>
          <button
            type="button"
            aria-label="Riwayat pembayaran"
            aria-haspopup="dialog"
            onClick={() => setHistoryOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-ink transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-slate-700 dark:text-white dark:hover:bg-slate-800"
          >
            <History className="h-4 w-4" />
          </button>
        </div>

        <form noValidate onSubmit={handleSubmit} className="mt-4 space-y-4">
          <AmountPresets value={selectedPreset} onSelect={handlePreset} />

          <div>
            <label
              htmlFor={amountId}
              className="mb-1.5 block text-[10.5px] font-semibold text-ink dark:text-slate-200"
            >
              Jumlah
            </label>
            <div className="relative">
              <span
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[10px] font-medium text-[#5B6B8C] dark:text-slate-400"
              >
                Rp
              </span>
              <input
                ref={inputRef}
                id={amountId}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={formatDigits(digits)}
                onChange={(e) => {
                  setDigits(e.target.value.replace(/\D/g, "").replace(/^0+/, "").slice(0, 10));
                  setCustomChosen(true);
                }}
                onBlur={() => setTouched(true)}
                placeholder="0"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? amountErrorId : undefined}
                className={cn(
                  "h-[38px] w-full rounded-xl border bg-white pr-3.5 pl-9 text-[11px] font-medium text-ink outline-none transition placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary-ring focus:shadow-[0_0_0_5px_var(--primary-soft)] dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-600",
                  error
                    ? "border-red-300 focus:border-red-400 focus:ring-red-400 dark:border-red-900"
                    : "border-slate-200 dark:border-slate-700"
                )}
              />
            </div>
            {error ? (
              <p id={amountErrorId} className="mt-1.5 text-[9.5px] font-medium text-red-500">
                {error}
              </p>
            ) : null}
            <p data-testid="fee-info" aria-live="polite" className={cn("text-[9.5px] font-medium text-ink dark:text-slate-200", summary && !error ? "mt-1.5" : "hidden")}>
              {error ? null : summary}
            </p>
          </div>

          {paymentMethods.length === 0 ? (
            <p role="status" className="rounded-xl bg-amber-50 px-3 py-2 text-center text-[10px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
              Belum ada metode pembayaran yang aktif. Hubungi support.
            </p>
          ) : (
            <MethodSelect value={method} onChange={setMethod} methods={paymentMethods} />
          )}

          <div>
            <p className="mb-1.5 text-[10.5px] font-semibold text-ink dark:text-slate-200">
              Petunjuk
            </p>
            <div className="space-y-2 text-center text-[10px] leading-relaxed text-[#5B6B8C] dark:text-slate-400">
              {channel ? (
                <>
                  <p>Pilih jumlah, lalu bayar di halaman berikutnya. Saldo masuk otomatis begitu pembayaranmu terkonfirmasi.</p>
                  {gateway.sandbox ? <p className="font-semibold text-amber-600 dark:text-amber-300">Mode uji coba (sandbox): pembayaran tidak memindahkan uang.</p> : null}
                </>
              ) : (
                <>
                  <p>{gateway.enabled ? "Pilih Transfer manual bila ingin mengajukan deposit tanpa pembayaran otomatis." : "Pembayaran otomatis (QRIS, bank, e-wallet) belum tersedia."}</p>
                  <p>Ajukan deposit di sini, transfer sesuai arahan support, lalu admin menambahkan saldomu setelah pembayaran diterima.</p>
                </>
              )}
              <p className="pt-3">
                Butuh bantuan pembayaran?{" "}
                <Link
                  href="/dashboard/tickets"
                  className="font-medium text-primary-accent underline-offset-2 hover:underline"
                >
                  Hubungi support.
                </Link>
              </p>
            </div>
          </div>

          <div aria-live="polite">
            {bonusPercent > 0 ? (
              <p className="rounded-xl bg-emerald-50 px-3 py-2 text-center text-[10px] font-medium text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
                Bonus {bonusPercent}%: +{formatIdr(Math.floor((amount * bonusPercent) / 100))}
              </p>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="flex h-[38px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-primary-from to-primary-to text-[10px] font-semibold text-white shadow-[0_2px_0_var(--primary-pressed)] transition hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60 dark:border dark:border-white/25 dark:shadow-[0_2px_0_var(--primary-pressed)]"
          >
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Memproses...
              </>
            ) : (
              <>
                <CreditCard className="h-3.5 w-3.5" />
                {channel ? "Bayar sekarang" : "Ajukan deposit"}
              </>
            )}
          </button>
        </form>
      </section>

      <PaymentHistoryDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </>
  );
}
