"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock, Copy, ExternalLink, Loader2, XCircle } from "lucide-react";
import { HeaderLine, HeaderZone } from "@/components/shell/header-zone";
import { PageHeading } from "@/components/shell/page-heading";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/shared/toast";
import { formatDateTime, formatIdr } from "@/lib/balance";
import { cancelMyDeposit, getMyDepositView, type DepositView } from "@/lib/user-actions";
import { cn } from "@/lib/utils";

const POLL_MS = 4000;
const TERMINAL = new Set(["berhasil", "gagal", "kedaluwarsa", "dibatalkan"]);

const tone: Record<DepositView["status"], string> = {
  menunggu: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  berhasil: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
  gagal: "bg-red-50 text-red-500 dark:bg-red-500/15 dark:text-red-300",
  kedaluwarsa: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300",
  dibatalkan: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300",
};
const label: Record<DepositView["status"], string> = { menunggu: "Menunggu pembayaran", berhasil: "Pembayaran diterima", gagal: "Pembayaran gagal", kedaluwarsa: "Kedaluwarsa", dibatalkan: "Dibatalkan" };

function useCountdown(expiresAt: string | null, active: boolean) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!expiresAt || !active) return;
    const tick = () => setLeft(Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [expiresAt, active]);
  return left;
}

const mmss = (s: number) => `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

/** The payment page of one Paymenku deposit: QR / VA / link, countdown, and live status from OUR database (never from the return_url). */
export function DepositPay({ initial }: { initial: DepositView }) {
  const toast = useToast();
  const [view, setView] = useState(initial);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const polling = useRef(false);
  const left = useCountdown(view.expiresAt, view.status === "menunggu");
  const info = view.info;

  const refresh = useCallback(async () => {
    if (polling.current) return;
    polling.current = true;
    try {
      const next = await getMyDepositView(initial.id);
      if (next) setView(next);
    } catch {
      /* the next tick tries again */
    } finally {
      polling.current = false;
    }
  }, [initial.id]);

  useEffect(() => {
    if (TERMINAL.has(view.status)) return;
    const t = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [view.status, refresh]);

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${what} disalin`);
    } catch {
      toast("Gagal menyalin", "error");
    }
  }

  const pending = view.status === "menunggu";
  const qr = typeof info.qr_url === "string" ? info.qr_url : null;
  const va = typeof info.va_number === "string" ? info.va_number : null;
  const code = typeof info.payment_code === "string" ? info.payment_code : null;
  const checkout = typeof info.checkout_url === "string" ? info.checkout_url : null;
  const simulator = typeof info.simulator_url === "string" ? info.simulator_url : null;

  return (
    <div>
      <HeaderZone />
      <PageHeading align="center" title="Pembayaran" subtitle="Selesaikan pembayaran sebelum batas waktu. Saldo masuk otomatis setelah terkonfirmasi." />
      <div className="relative mt-[42px]">
        <HeaderLine top={50} />
        <section aria-label="Detail pembayaran" data-testid="deposit-pay" className="relative z-10 mx-auto w-full max-w-[524px] rounded-3xl border border-slate-200/70 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[13px] font-semibold text-ink dark:text-white">{view.method}</p>
              <p className="text-[10px] text-[#5B6B8C] dark:text-slate-400">ID {view.id.slice(0, 8)} &middot; {formatDateTime(view.createdAt)}</p>
            </div>
            <span data-testid="deposit-status" className={cn("inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[10px] font-semibold", tone[view.status])}>
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : view.status === "berhasil" ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : <XCircle className="h-3.5 w-3.5" aria-hidden />}
              {label[view.status]}
            </span>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-[#F1F6FB] p-3 text-[10px] dark:bg-[#161b20]">
            <div>
              <dt className="text-[#5B6B8C] dark:text-slate-400">Saldo yang masuk</dt>
              <dd data-testid="deposit-amount" className="mt-0.5 text-[12px] font-semibold text-ink dark:text-white">{formatIdr(view.amount)}</dd>
            </div>
            <div>
              <dt className="text-[#5B6B8C] dark:text-slate-400">Total yang dibayar</dt>
              <dd data-testid="deposit-pay-amount" className="mt-0.5 text-[12px] font-semibold text-ink dark:text-white">{formatIdr(view.payAmount)}</dd>
            </div>
            {view.payAmount > view.amount ? (
              <p className="col-span-2 text-[#5B6B8C] dark:text-slate-400">Termasuk biaya layanan {formatIdr(view.payAmount - view.amount)}. Saldo yang masuk tetap {formatIdr(view.amount)}.</p>
            ) : null}
          </dl>

          {pending ? (
            <div className="mt-4 space-y-3 text-center">
              {left !== null ? (
                <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-ink dark:text-white" aria-live="off">
                  <Clock className="h-3.5 w-3.5 text-amber-500" aria-hidden />
                  Bayar dalam <span data-testid="deposit-countdown" className="tabular-nums">{mmss(left)}</span>
                </p>
              ) : null}
              {qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt="Kode QRIS" width={240} height={240} className="mx-auto h-60 w-60 rounded-2xl border border-slate-200 bg-white p-2 dark:border-slate-700" />
              ) : null}
              {typeof info.bank === "string" && va ? (
                <div className="rounded-2xl border border-slate-200/70 p-3 dark:border-slate-800">
                  <p className="text-[10px] text-[#5B6B8C] dark:text-slate-400">Virtual Account {info.bank}</p>
                  <p className="mt-1 text-[14px] font-semibold tracking-wider text-ink dark:text-white">{va}</p>
                  <button type="button" onClick={() => void copy(va, "Nomor VA")} className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-full border border-slate-200 px-3 text-[10px] font-medium text-ink hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800">
                    <Copy className="h-3 w-3" aria-hidden /> Salin nomor
                  </button>
                </div>
              ) : null}
              {code ? (
                <div className="rounded-2xl border border-slate-200/70 p-3 dark:border-slate-800">
                  <p className="text-[10px] text-[#5B6B8C] dark:text-slate-400">Kode pembayaran{typeof info.store === "string" ? ` (${info.store})` : ""}</p>
                  <p className="mt-1 text-[14px] font-semibold tracking-wider text-ink dark:text-white">{code}</p>
                </div>
              ) : null}
              <div className="flex flex-wrap justify-center gap-2">
                {checkout || view.payUrl ? (
                  <a href={(checkout ?? view.payUrl)!} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-b from-primary-from to-primary-to px-4 text-[10px] font-semibold text-white shadow-[0_2px_0_var(--primary-pressed)]">
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Buka halaman pembayaran
                  </a>
                ) : null}
                <button type="button" onClick={() => setConfirmCancel(true)} className="inline-flex h-9 items-center rounded-xl border border-slate-200 px-4 text-[10px] font-medium text-ink hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800">
                  Batalkan deposit
                </button>
              </div>
              {view.sandbox ? (
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-[10px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                  Mode uji coba (sandbox): tidak ada uang yang berpindah.{" "}
                  {simulator ? <a href={simulator} target="_blank" rel="noopener noreferrer" className="underline">Buka simulator pembayaran</a> : null}
                </p>
              ) : null}
              <p className="text-[9.5px] text-[#5B6B8C] dark:text-slate-400">Halaman ini memeriksa status otomatis. Kamu boleh menutupnya: saldo tetap masuk setelah pembayaran terkonfirmasi.</p>
            </div>
          ) : (
            <div className="mt-4 space-y-3 text-center text-[10.5px] text-[#5B6B8C] dark:text-slate-400" role="status">
              {view.status === "berhasil" ? <p className="font-medium text-emerald-600 dark:text-emerald-300">Saldo bertambah {formatIdr(view.amount)}{view.paidAt ? ` pada ${formatDateTime(view.paidAt)}` : ""}.</p> : null}
              {view.status === "kedaluwarsa" ? <p>Batas waktu pembayaran habis. Bila kamu sudah membayar, saldo tetap masuk setelah pembayarannya terkonfirmasi.</p> : null}
              {view.status === "gagal" ? <p>Pembayaran tidak berhasil. Buat deposit baru atau hubungi support.</p> : null}
              {view.status === "dibatalkan" ? <p>Deposit dibatalkan.</p> : null}
              <Link href="/dashboard/add-funds" className="inline-flex h-9 items-center rounded-xl bg-gradient-to-b from-primary-from to-primary-to px-4 text-[10px] font-semibold text-white shadow-[0_2px_0_var(--primary-pressed)]">
                {view.status === "berhasil" ? "Kembali ke Tambah Saldo" : "Buat deposit baru"}
              </Link>
            </div>
          )}
        </section>
      </div>
      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="Batalkan deposit ini?"
        description="Deposit dibatalkan. Bila kamu sudah membayar, saldo tetap masuk setelah pembayarannya terkonfirmasi."
        confirmLabel="Batalkan deposit"
        tone="danger"
        onConfirm={async () => {
          const res = await cancelMyDeposit(initial.id);
          toast(res.ok ? (res.message ?? "Deposit dibatalkan.") : res.error, res.ok ? undefined : "error");
          if (res.ok) {
            setConfirmCancel(false);
            await refresh();
          }
          return res.ok;
        }}
      />
    </div>
  );
}
