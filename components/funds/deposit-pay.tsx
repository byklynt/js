"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Clock, Copy, Download, ExternalLink, Landmark, LifeBuoy, Lock, QrCode, Store, Wallet, X } from "lucide-react";
import { HeaderLine, HeaderZone } from "@/components/shell/header-zone";
import { PageHeading } from "@/components/shell/page-heading";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/shared/toast";
import { formatDateTime, formatIdr } from "@/lib/balance";
import { depositFee } from "@/lib/funds-copy";
import { cancelMyDeposit, getMyDepositView, type DepositView } from "@/lib/user-actions";
import { cn } from "@/lib/utils";

/**
 * The payment page of one top-up. Presentation only: the data, the polling (our own database, never the return_url) and the cancel action are unchanged.
 * Nothing about the payment partner is shown here: no name, no transaction id, no raw payment data, no internal status.
 */

const POLL_MS = 4000;
const TERMINAL = new Set(["berhasil", "gagal", "kedaluwarsa", "dibatalkan"]);
const LOW_SECONDS = 120;
const URGENT_SECONDS = 30;

type Kind = "qris" | "va" | "store" | "wallet" | "other";

const badge: Record<DepositView["status"], string> = {
  menunggu: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  berhasil: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
  gagal: "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300",
  kedaluwarsa: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  dibatalkan: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300",
};
const badgeLabel: Record<DepositView["status"], string> = { menunggu: "Menunggu pembayaran", berhasil: "Pembayaran diterima", gagal: "Pembayaran gagal", kedaluwarsa: "Kedaluwarsa", dibatalkan: "Dibatalkan" };

const kindIcon: Record<Kind, React.ComponentType<{ className?: string }>> = { qris: QrCode, va: Landmark, store: Store, wallet: Wallet, other: Wallet };

const howTo: Record<Kind, string[]> = {
  qris: ["Buka aplikasi bank atau e-wallet yang mendukung QRIS.", "Pilih Scan atau Bayar, lalu arahkan kamera ke kode QR.", "Pastikan nominalnya sesuai, lalu konfirmasi pembayaran."],
  va: ["Buka aplikasi m-banking, internet banking, atau ATM bank yang dipilih.", "Pilih Transfer, lalu Virtual Account.", "Masukkan nomor Virtual Account di atas.", "Pastikan nominalnya sama persis dengan total yang dibayar, lalu konfirmasi."],
  store: ["Datang ke gerai dan sebutkan bahwa kamu ingin membayar tagihan.", "Berikan kode pembayaran di atas ke kasir.", "Bayar sesuai total yang tertera dan simpan struknya."],
  wallet: ["Tekan Bayar sekarang untuk membuka halaman pembayaran.", "Masuk ke aplikasi e-wallet dan setujui pembayaran.", "Kembali ke halaman ini: statusnya berubah otomatis."],
  other: ["Tekan Bayar sekarang untuk membuka halaman pembayaran.", "Ikuti petunjuk di halaman tersebut.", "Kembali ke halaman ini: statusnya berubah otomatis."],
};

const mmss = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${String(h).padStart(2, "0")}:${m}:${sec}` : `${m}:${sec}`;
};

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

/** Copies text and shows "Tersalin" for two seconds on the button itself. */
function CopyButton({ text, label, what, className }: { text: string; label: string; what: string; className?: string }) {
  const toast = useToast();
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setDone(false), 2000);
    } catch {
      toast(`Gagal menyalin ${what}`, "error");
    }
  }
  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={`${label} ${what}`}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[10px] font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        done ? "border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300" : "border-slate-200 text-ink hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800",
        className,
      )}
    >
      {done ? <Check className="h-3 w-3" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
      <span aria-live="polite">{done ? "Tersalin" : label}</span>
    </button>
  );
}

const STEPS = ["Buat pesanan", "Bayar", "Saldo masuk"] as const;

/** 1 Buat pesanan -> 2 Bayar -> 3 Saldo masuk. Completed steps are checked, the current one is highlighted, a failed payment marks step 2. */
function Steps({ status }: { status: DepositView["status"] }) {
  const current = status === "berhasil" ? 3 : 2;
  const failed = status === "gagal" || status === "kedaluwarsa" || status === "dibatalkan";
  return (
    <ol aria-label="Tahapan" className="mt-4 flex items-start">
      {STEPS.map((name, i) => {
        const n = i + 1;
        const done = n < current || (status === "berhasil" && n === 3);
        const active = n === current && !done && !failed;
        const bad = failed && n === 2;
        return (
          <li key={name} className="flex flex-1 flex-col items-center text-center" aria-current={active ? "step" : undefined}>
            <div className="flex w-full items-center">
              <span className={cn("h-0.5 flex-1", i === 0 ? "bg-transparent" : done || active || bad ? "bg-primary/40" : "bg-slate-200 dark:bg-slate-700")} />
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                  done ? "bg-emerald-500 text-white" : bad ? "bg-red-500 text-white" : active ? "bg-primary text-white ring-4 ring-primary-soft" : "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500",
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : bad ? <X className="h-3.5 w-3.5" aria-hidden /> : n}
              </span>
              <span className={cn("h-0.5 flex-1", i === STEPS.length - 1 ? "bg-transparent" : done ? "bg-emerald-300 dark:bg-emerald-500/50" : "bg-slate-200 dark:bg-slate-700")} />
            </div>
            <span className={cn("mt-1.5 text-[9.5px] font-medium", active || done ? "text-ink dark:text-white" : bad ? "text-red-600 dark:text-red-300" : "text-slate-400 dark:text-slate-500")}>{name}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** The QR in a clean white frame with brand-coloured corner accents. */
function QrFrame({ src, onDownload }: { src: string; onDownload: () => void }) {
  const corner = "absolute h-5 w-5 border-primary";
  return (
    <div className="mx-auto w-fit">
      <div className="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700">
        <span aria-hidden className={cn(corner, "left-1.5 top-1.5 rounded-tl-lg border-l-2 border-t-2")} />
        <span aria-hidden className={cn(corner, "right-1.5 top-1.5 rounded-tr-lg border-r-2 border-t-2")} />
        <span aria-hidden className={cn(corner, "bottom-1.5 left-1.5 rounded-bl-lg border-b-2 border-l-2")} />
        <span aria-hidden className={cn(corner, "bottom-1.5 right-1.5 rounded-br-lg border-b-2 border-r-2")} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="Kode QRIS" width={240} height={240} className="block h-56 w-56 max-w-full sm:h-60 sm:w-60" />
      </div>
      <p className="mt-3 text-center text-[10.5px] text-[#5B6B8C] dark:text-slate-400">Scan dengan aplikasi bank atau e-wallet apa pun</p>
      <button
        type="button"
        onClick={onDownload}
        className="mx-auto mt-2 flex h-9 items-center gap-1.5 rounded-full border border-slate-200 px-4 text-[10px] font-medium text-ink transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
      >
        <Download className="h-3.5 w-3.5" aria-hidden /> Unduh QR
      </button>
    </div>
  );
}

function Countdown({ left, total }: { left: number | null; total: number }) {
  if (left === null) return <div className="h-[52px]" aria-hidden />;
  const pct = total > 0 ? Math.min(100, Math.max(0, (left / total) * 100)) : 0;
  const low = left <= LOW_SECONDS;
  const urgent = left <= URGENT_SECONDS;
  return (
    <div className="mx-auto w-full max-w-[320px]">
      <div className="flex items-center justify-center gap-1.5">
        <Clock className={cn("h-3.5 w-3.5", urgent ? "text-red-500" : low ? "text-amber-500" : "text-primary-accent")} aria-hidden />
        <span className="text-[10.5px] text-[#5B6B8C] dark:text-slate-400">Bayar dalam</span>
        <span data-testid="deposit-countdown" className={cn("text-[15px] font-semibold tabular-nums", urgent ? "text-red-500" : low ? "text-amber-600 dark:text-amber-300" : "text-ink dark:text-white")}>
          {mmss(left)}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden>
        <div className={cn("h-full rounded-full transition-[width,background-color] duration-1000 ease-linear", urgent ? "bg-red-500" : low ? "bg-amber-500" : "bg-primary")} style={{ width: `${pct}%` }} />
      </div>
      {low ? <p className={cn("mt-1.5 text-center text-[9.5px] font-medium", urgent ? "text-red-500" : "text-amber-600 dark:text-amber-300")}>{left === 0 ? "Waktu pembayaran habis." : "Waktu hampir habis. Selesaikan pembayaranmu sekarang."}</p> : null}
    </div>
  );
}

function DepositHowTo({ kind }: { kind: Kind }) {
  return (
    <details className="group mx-auto w-full rounded-2xl border border-slate-200/70 px-3.5 py-2.5 text-left dark:border-slate-800">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[10.5px] font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:text-white [&::-webkit-details-marker]:hidden">
        Cara membayar
        <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" aria-hidden />
      </summary>
      <ol className="mt-2 list-decimal space-y-1 pl-4 text-[10px] leading-relaxed text-[#5B6B8C] dark:text-slate-400">
        {howTo[kind].map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
    </details>
  );
}

/** The payment page of one top-up: header, amounts, steps, and one panel per state. */
export function DepositPay({ initial }: { initial: DepositView }) {
  const toast = useToast();
  const [view, setView] = useState(initial);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [announce, setAnnounce] = useState("");
  const polling = useRef(false);
  const pending = view.status === "menunggu";
  const left = useCountdown(view.expiresAt, pending);
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

  // Screen readers hear the status changes and three moments of the countdown (5 minutes, 1 minute, expiry), never every second.
  const lastBucket = useRef<number | null>(null);
  useEffect(() => {
    if (left === null) return;
    const bucket = left === 0 ? 0 : left <= 60 ? 60 : left <= 300 ? 300 : -1;
    if (bucket !== -1 && bucket !== lastBucket.current) {
      lastBucket.current = bucket;
      setAnnounce(bucket === 0 ? "Waktu pembayaran habis." : bucket === 60 ? "Sisa waktu pembayaran kurang dari satu menit." : "Sisa waktu pembayaran kurang dari lima menit.");
    }
  }, [left]);
  const firstStatus = useRef(view.status);
  useEffect(() => {
    if (firstStatus.current !== view.status) {
      firstStatus.current = view.status;
      setAnnounce(badgeLabel[view.status]);
    }
  }, [view.status]);

  const qr = typeof info.qr_url === "string" ? info.qr_url : null;
  const va = typeof info.va_number === "string" ? info.va_number : null;
  const bank = typeof info.bank === "string" ? info.bank : null;
  const code = typeof info.payment_code === "string" ? info.payment_code : null;
  const store = typeof info.store === "string" ? info.store : null;
  const checkout = typeof info.checkout_url === "string" ? info.checkout_url : null;
  const simulator = typeof info.simulator_url === "string" ? info.simulator_url : null;
  const kind: Kind = qr ? "qris" : va ? "va" : code ? "store" : checkout || view.payUrl ? "wallet" : "other";
  const Icon = kindIcon[kind];
  const ref = view.id.slice(-8);
  const total = view.expiresAt ? Math.max(1, Math.floor((new Date(view.expiresAt).getTime() - new Date(view.createdAt).getTime()) / 1000)) : 0;
  const payLink = checkout ?? view.payUrl;
  const methodName = kind === "va" && bank && !view.method.toLowerCase().includes(bank.toLowerCase()) ? `${view.method} ${bank}` : view.method;

  async function downloadQr() {
    if (!qr) return;
    try {
      const blob = await (await fetch(qr)).blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `qris-${ref}.png`;
      a.click();
      URL.revokeObjectURL(href);
    } catch {
      window.open(qr, "_blank", "noopener,noreferrer");
    }
  }

  const primary = "inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-primary-from to-primary-to px-5 text-[11px] font-semibold text-white shadow-[0_2px_0_var(--primary-pressed)] transition hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border dark:border-white/25";
  const secondary = "inline-flex h-10 w-full items-center justify-center rounded-xl border border-slate-200 px-4 text-[10.5px] font-medium text-ink transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800";

  return (
    <div>
      <HeaderZone />
      <PageHeading align="center" title="Pembayaran" subtitle="Selesaikan pembayaran sebelum batas waktu. Saldo masuk otomatis setelah terkonfirmasi." />
      <div className="relative mt-[42px]">
        <HeaderLine top={50} />
        <section aria-labelledby="deposit-title" data-testid="deposit-pay" className="relative z-10 mx-auto w-full max-w-[500px] rounded-3xl border border-slate-200/70 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
          {/* header: method, status, short reference */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-accent">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <h2 id="deposit-title" className="truncate text-[13px] font-semibold text-ink dark:text-white">{methodName}</h2>
                <p className="mt-0.5 flex items-center gap-1 text-[10px] text-[#5B6B8C] dark:text-slate-400">
                  <span>#{ref}</span>
                  <CopyButton text={ref} label="Salin" what="ID referensi" className="h-6 border-transparent px-1.5 text-[9.5px]" />
                </p>
              </div>
            </div>
            <span data-testid="deposit-status" className={cn("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[10px] font-semibold", badge[view.status])}>
              {pending ? (
                <span className="relative flex h-2 w-2" aria-hidden>
                  <span className="absolute inline-flex h-full w-full rounded-full bg-amber-500/60 motion-safe:animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
                </span>
              ) : view.status === "berhasil" ? (
                <Check className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <X className="h-3.5 w-3.5" aria-hidden />
              )}
              {badgeLabel[view.status]}
            </span>
          </div>

          {/* amounts */}
          <div className="mt-4 rounded-2xl bg-[#F1F6FB] p-4 text-center dark:bg-[#161b20]">
            <p className="text-[10px] font-medium text-[#5B6B8C] dark:text-slate-400">Total yang dibayar</p>
            <div className="mt-1 flex items-center justify-center gap-2">
              <p data-testid="deposit-pay-amount" className="text-[26px] font-bold leading-tight tabular-nums text-ink dark:text-white">{formatIdr(view.payAmount)}</p>
              {pending ? <CopyButton text={String(view.payAmount)} label="Salin" what="jumlah" /> : null}
            </div>
            <dl className="mt-3 space-y-1.5 border-t border-dashed border-slate-300/80 pt-3 text-[10.5px] dark:border-slate-700">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[#5B6B8C] dark:text-slate-400">Saldo yang masuk</dt>
                <dd data-testid="deposit-amount" className="font-semibold tabular-nums text-ink dark:text-white">{formatIdr(view.amount)}</dd>
              </div>
              {depositFee({ amount: view.amount, payAmount: view.payAmount, feeAmount: view.fee }).kind === "fee" ? (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-[#5B6B8C] dark:text-slate-400">Biaya layanan</dt>
                  <dd className="font-medium tabular-nums text-ink dark:text-slate-200">{formatIdr(depositFee({ amount: view.amount, payAmount: view.payAmount, feeAmount: view.fee }).fee)}</dd>
                </div>
              ) : null}
            </dl>
          </div>

          <Steps status={view.status} />

          {/* one panel per state; the container keeps a minimum height so the card does not jump when the status flips */}
          <div className="mt-5 min-h-[260px]" aria-live="polite">
            <div key={view.status} className="dep-fade">
              {pending ? (
                <div className="space-y-4 text-center">
                  <Countdown left={left} total={total} />
                  {qr ? <QrFrame src={qr} onDownload={() => void downloadQr()} /> : null}
                  {va ? (
                    <div className="rounded-2xl border border-slate-200/70 p-4 text-left dark:border-slate-800">
                      <p className="text-[10px] text-[#5B6B8C] dark:text-slate-400">Nomor Virtual Account{bank ? ` ${bank}` : ""}</p>
                      <div className="mt-1.5 flex items-center justify-between gap-3">
                        <p data-testid="deposit-va" className="min-w-0 break-all font-mono text-[18px] font-semibold tracking-wider text-ink dark:text-white">{va}</p>
                        <CopyButton text={va} label="Salin" what="nomor Virtual Account" />
                      </div>
                    </div>
                  ) : null}
                  {code ? (
                    <div className="rounded-2xl border border-slate-200/70 p-4 text-left dark:border-slate-800">
                      <p className="text-[10px] text-[#5B6B8C] dark:text-slate-400">Kode pembayaran{store ? ` (${store})` : ""}</p>
                      <div className="mt-1.5 flex items-center justify-between gap-3">
                        <p className="min-w-0 break-all font-mono text-[18px] font-semibold tracking-wider text-ink dark:text-white">{code}</p>
                        <CopyButton text={code} label="Salin" what="kode pembayaran" />
                      </div>
                    </div>
                  ) : null}

                  {payLink && (kind === "wallet" || kind === "other" || kind === "store") ? (
                    <div className="sticky bottom-[max(12px,env(safe-area-inset-bottom))] z-20 sm:static">
                      <a href={payLink} target="_blank" rel="noopener noreferrer" className={primary}>
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Bayar sekarang
                      </a>
                    </div>
                  ) : null}
                  {payLink && (kind === "qris" || kind === "va") ? (
                    <a href={payLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] font-medium text-primary-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                      <ExternalLink className="h-3 w-3" aria-hidden /> Buka halaman pembayaran
                    </a>
                  ) : null}

                  <DepositHowTo kind={kind} />

                  <p className="flex items-center justify-center gap-2 text-[10px] font-medium text-[#5B6B8C] dark:text-slate-400">
                    <span className="relative flex h-2 w-2" aria-hidden>
                      <span className="absolute inline-flex h-full w-full rounded-full bg-primary/50 motion-safe:animate-ping" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                    </span>
                    Menunggu pembayaran...
                  </p>
                  <p className="text-[9.5px] text-[#5B6B8C] dark:text-slate-400">Halaman ini diperbarui otomatis. Kamu tidak perlu refresh, dan boleh menutupnya: saldo tetap masuk setelah pembayaran terkonfirmasi.</p>
                  {view.sandbox ? (
                    <p className="rounded-xl bg-amber-50 px-3 py-2 text-[10px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                      Mode uji coba: tidak ada uang yang berpindah.{" "}
                      {simulator ? <a href={simulator} target="_blank" rel="noopener noreferrer" className="underline">Buka simulator pembayaran</a> : null}
                    </p>
                  ) : null}
                  <div className="flex flex-col items-center gap-2 pt-1">
                    <button type="button" onClick={() => setConfirmCancel(true)} className="text-[10.5px] font-medium text-[#5B6B8C] underline-offset-2 transition hover:text-red-500 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:text-slate-400">
                      Batalkan pembayaran
                    </button>
                  </div>
                </div>
              ) : view.status === "berhasil" ? (
                <div className="text-center" role="status" data-testid="deposit-success">
                  <span className="dep-pop mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-500 dark:bg-emerald-500/15" aria-hidden>
                    <svg viewBox="0 0 24 24" className="h-9 w-9" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                      <path className="dep-check-path" d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  </span>
                  <p className="mt-3 text-[15px] font-semibold text-ink dark:text-white">Saldo bertambah {formatIdr(view.amount)}</p>
                  <p className="mt-1 text-[10.5px] text-[#5B6B8C] dark:text-slate-400">Terima kasih! Saldomu sudah bisa dipakai untuk order.</p>
                  <dl className="mt-4 space-y-2 rounded-2xl border border-dashed border-slate-300 p-4 text-left text-[10.5px] dark:border-slate-700">
                    {[
                      ["Metode", methodName],
                      ["Waktu", view.paidAt ? formatDateTime(view.paidAt) : "-"],
                      ["ID referensi", `#${ref}`],
                      ["Jumlah", formatIdr(view.amount)],
                    ].map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between gap-3">
                        <dt className="text-[#5B6B8C] dark:text-slate-400">{k}</dt>
                        <dd className="text-right font-medium tabular-nums text-ink dark:text-white">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-4 space-y-2">
                    <Link href="/dashboard" className={primary}>Mulai order</Link>
                    <Link href="/dashboard/ledger" className={secondary}>Lihat mutasi saldo</Link>
                    <Link href="/dashboard/add-funds" className="inline-block pt-1 text-[10.5px] font-medium text-primary-accent underline-offset-2 hover:underline">Kembali ke Tambah Saldo</Link>
                  </div>
                </div>
              ) : (
                <div className="text-center" role="status">
                  <span className={cn("mx-auto flex h-14 w-14 items-center justify-center rounded-full", view.status === "gagal" ? "bg-red-50 text-red-500 dark:bg-red-500/15" : view.status === "kedaluwarsa" ? "bg-amber-50 text-amber-500 dark:bg-amber-500/15" : "bg-slate-100 text-slate-500 dark:bg-slate-500/15")} aria-hidden>
                    {view.status === "kedaluwarsa" ? <Clock className="h-7 w-7" /> : <X className="h-7 w-7" />}
                  </span>
                  <p className="mt-3 text-[14px] font-semibold text-ink dark:text-white">
                    {view.status === "kedaluwarsa" ? "Waktu pembayaran habis" : view.status === "gagal" ? "Pembayaran tidak berhasil" : "Pembayaran dibatalkan"}
                  </p>
                  <p className="mx-auto mt-1 max-w-[340px] text-[10.5px] leading-relaxed text-[#5B6B8C] dark:text-slate-400">
                    {view.status === "kedaluwarsa"
                      ? "Kode pembayaran ini tidak berlaku lagi. Bila kamu sudah telanjur membayar, saldo tetap masuk setelah pembayarannya terkonfirmasi."
                      : view.status === "gagal"
                        ? "Terjadi kendala saat memproses pembayaran. Tidak ada saldo yang dipotong. Buat deposit baru atau hubungi support."
                        : "Deposit ini dibatalkan. Bila kamu sudah telanjur membayar, saldo tetap masuk setelah pembayarannya terkonfirmasi."}
                  </p>
                  <div className="mt-4 space-y-2">
                    <Link href="/dashboard/add-funds" className={primary}>Buat deposit baru</Link>
                    <Link href="/dashboard/tickets" className={secondary}>Hubungi support</Link>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* footer of the card */}
          <div className="mt-5 border-t border-slate-200/70 pt-3 dark:border-slate-800">
            {pending ? (
              <p className="mb-2 flex items-center justify-center gap-1.5 text-[10px] text-[#5B6B8C] dark:text-slate-400">
                <LifeBuoy className="h-3.5 w-3.5" aria-hidden />
                Butuh bantuan?{" "}
                <Link href="/dashboard/tickets" className="font-medium text-primary-accent underline-offset-2 hover:underline">Hubungi support</Link>
              </p>
            ) : null}
            <p className="flex items-center justify-center gap-1.5 text-[9.5px] text-[#5B6B8C] dark:text-slate-400">
              <Lock className="h-3 w-3" aria-hidden /> Pembayaran diproses aman oleh mitra pembayaran
            </p>
          </div>
          <p className="sr-only" aria-live="polite" role="status">{announce}</p>
        </section>
      </div>
      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="Batalkan pembayaran ini?"
        description="Deposit dibatalkan. Bila kamu sudah membayar, saldo tetap masuk setelah pembayarannya terkonfirmasi."
        confirmLabel="Batalkan pembayaran"
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

/** First paint of the route: the same card with grey blocks (reserved heights, no jump when the real card arrives). */
export function DepositPaySkeleton() {
  const block = "rounded-xl bg-slate-100 motion-safe:animate-pulse dark:bg-slate-800";
  return (
    <div>
      <HeaderZone />
      <PageHeading align="center" title="Pembayaran" subtitle="Selesaikan pembayaran sebelum batas waktu. Saldo masuk otomatis setelah terkonfirmasi." />
      <div className="relative mt-[42px]">
        <HeaderLine top={50} />
        <div role="status" aria-label="Memuat pembayaran" className="relative z-10 mx-auto w-full max-w-[500px] rounded-3xl border border-slate-200/70 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <div className={cn(block, "h-10 w-10")} />
            <div className="flex-1 space-y-2"><div className={cn(block, "h-3 w-32")} /><div className={cn(block, "h-2.5 w-20")} /></div>
            <div className={cn(block, "h-8 w-32 rounded-full")} />
          </div>
          <div className={cn(block, "mt-4 h-[132px]")} />
          <div className={cn(block, "mt-4 h-10")} />
          <div className={cn(block, "mx-auto mt-5 h-60 w-60")} />
          <div className={cn(block, "mx-auto mt-4 h-3 w-48")} />
        </div>
      </div>
    </div>
  );
}
