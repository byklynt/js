"use client";

import { useState } from "react";
import { Copy, Loader2, Wallet } from "lucide-react";
import { affiliate, affiliateMinPayout } from "@/lib/affiliates-data";
import { formatBalance, formatIdr } from "@/lib/balance";
import { requestPayout } from "@/lib/dashboard-actions";
import { HeaderLine, HeaderZone } from "@/components/shell/header-zone";
import { PageHeading } from "@/components/shell/page-heading";
import { useToast } from "@/components/shared/toast";
import { cn } from "@/lib/utils";

const stats = [
  { label: "Tingkat komisi", value: affiliate.commissionRate },
  { label: "Minimal penarikan", value: formatIdr(affiliateMinPayout) },
  { label: "Kunjungan", value: String(affiliate.visits) },
  { label: "Pendaftaran", value: String(affiliate.registrations) },
  { label: "Referral", value: String(affiliate.referrals) },
  { label: "Rasio konversi", value: affiliate.conversionRate },
  { label: "Total pendapatan", value: formatBalance(affiliate.totalEarnings) },
  { label: "Pendapatan tersedia", value: formatBalance(affiliate.availableEarnings) },
];

function cellBorders(i: number) {
  return cn(
    // 2 columns on small screens, 4 on large
    i % 2 === 1 && "max-lg:border-l",
    i >= 2 && "max-lg:border-t",
    i % 4 !== 0 && "lg:border-l",
    i >= 4 && "lg:border-t"
  );
}

export function AffiliatesPage() {
  const toast = useToast();
  const [paying, setPaying] = useState(false);
  const canWithdraw = affiliate.availableEarnings >= affiliateMinPayout;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(affiliate.link);
      toast("Link disalin");
    } catch {
      toast("Gagal menyalin link", "error");
    }
  }

  async function withdraw() {
    setPaying(true);
    try {
      const result = await requestPayout(affiliate.availableEarnings);
      toast(result.success ? "Permintaan penarikan dikirim" : result.message, result.success ? "success" : "error");
    } catch {
      toast("Gagal mengajukan penarikan. Coba lagi.", "error");
    } finally {
      setPaying(false);
    }
  }

  return (
    <div>
      <HeaderZone />
      <PageHeading title="Afiliasi" subtitle="Dapatkan uang dengan mengajak pelanggan ke website kami." />

      <div className="relative mt-[46px]">
        <HeaderLine top={20} />
        <section
          aria-label="Statistik afiliasi"
          className="relative z-10 overflow-hidden rounded-3xl border border-slate-200/70 bg-white dark:border-slate-800 dark:bg-slate-900"
        >
          <dl className="grid grid-cols-2 lg:grid-cols-4">
            {stats.map((s, i) => (
              <div
                key={s.label}
                className={cn("border-slate-200/70 p-5 sm:p-7 dark:border-slate-800", cellBorders(i))}
              >
                <dt className="text-[10px] text-[#5B6B8C] dark:text-slate-400">{s.label}</dt>
                <dd className="mt-3 text-[22px] leading-tight font-medium tracking-[-0.015em] text-ink dark:text-white">
                  {s.value}
                </dd>
              </div>
            ))}
          </dl>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/70 p-4 dark:border-slate-800">
            <div className="flex min-w-0 items-center gap-3 rounded-full bg-[#F1F6FB] p-1 pr-4 dark:bg-[#161b20]">
              <button
                type="button"
                onClick={copyLink}
                className="flex h-9 shrink-0 items-center gap-2 rounded-full border border-slate-200/70 bg-white px-4 text-[10px] font-medium text-ink shadow-sm transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800"
              >
                <Copy className="h-3.5 w-3.5" aria-hidden />
                Salin Link
              </button>
              <span className="min-w-0 truncate text-[10px] font-medium text-ink dark:text-slate-100" title={affiliate.link}>
                {affiliate.link}
              </span>
            </div>

            <button
              type="button"
              disabled={!canWithdraw || paying}
              onClick={withdraw}
              title={canWithdraw ? undefined : `Minimal penarikan ${formatIdr(affiliateMinPayout)}`}
              className="flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-4 text-[10px] font-medium text-ink transition enabled:hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-100 dark:enabled:hover:bg-slate-800"
            >
              {paying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wallet className="h-3.5 w-3.5" aria-hidden />}
              Tarik saldo
            </button>
          </div>
        </section>
        <div aria-hidden className="mt-7 h-px w-full bg-slate-200/70 dark:bg-slate-800" />
      </div>
    </div>
  );
}
