"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { CircleCheck, RefreshCw, Send, ShoppingCart, ShieldAlert, TrendingUp, Users, Wallet } from "lucide-react";
import type { loadDashboardData } from "@/lib/server/admin/dashboard";
import { resendAllFailedOrders, resyncProviders } from "@/lib/admin-actions";
import { formatDateTime, formatIdr } from "@/lib/balance";
import { HeaderLine } from "@/components/shell/header-zone";
import { PageHeader } from "@/components/shell/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAdminRunner } from "@/components/admin/use-admin-runner";
import { OrderStatusChip } from "@/components/orders/order-status-chip";
import { DepositStatusChip, LowBalanceChip, ProviderStatusChip } from "@/components/admin/admin-chips";
import { PlatformChart, RevenueChart } from "./admin-charts";
import { attentionCards } from "@/lib/admin-attention";

type Data = Awaited<ReturnType<typeof loadDashboardData>>;
type Range = "hari" | "7" | "30";

const rangeItems: { value: Range; label: string }[] = [
  { value: "hari", label: "Hari ini" },
  { value: "7", label: "7 hari" },
  { value: "30", label: "30 hari" },
];

function Card({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[12px] font-semibold text-ink dark:text-white">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-[10px] text-[#5B6B8C] dark:text-slate-400">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

const linkClass =
  "rounded text-[10px] font-medium text-primary-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export function AdminDashboard({ data }: { data: Data }) {
  const run = useAdminRunner();
  const [range, setRange] = useState<Range>("7");
  const [resendOpen, setResendOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const revenue = data.series.revenue[range];
  const total = revenue.reduce((s, p) => s + p.value, 0);
  const profitTotal = revenue.reduce((s, p) => s + p.profit, 0);
  const platformData = data.series.platforms[range];
  const orderTotal = platformData.reduce((s, p) => s + p.value, 0);
  const attention = attentionCards(data);
  const allClear = attention.every((c) => c.value === "0");

  return (
    <div className="space-y-6">
      <PageHeader title="Dasbor" subtitle="Ringkasan operasional JagoanSosmed hari ini." />

      <div className="relative grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-[16px]">
        <HeaderLine />
        {[
          { label: "Pendapatan Hari Ini", value: formatIdr(data.stats.revenueToday), icon: Wallet, tone: "sky" as const, actionLabel: "Lihat deposit", actionHref: "/admin/deposits" },
          { label: "Profit Hari Ini", value: formatIdr(data.finance.profit), icon: TrendingUp, tone: "emerald" as const, actionLabel: "Lihat pesanan", actionHref: "/admin/orders" },
          { label: "Pesanan Hari Ini", value: data.stats.ordersToday.toLocaleString("id-ID"), icon: ShoppingCart, tone: "amber" as const, actionLabel: "Lihat pesanan", actionHref: "/admin/orders" },
          { label: "Pengguna Baru", value: data.stats.newUsers.toLocaleString("id-ID"), icon: Users, tone: "rose" as const, actionLabel: "Lihat pengguna", actionHref: "/admin/users" },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: i * 0.06, ease: "easeOut" }}
          >
            <StatCard {...stat} />
          </motion.div>
        ))}
      </div>

      {data.setup.some((s) => !s.done) ? (
        <section aria-label="Langkah awal" className="rounded-2xl border border-primary-200 bg-primary-50/50 p-4 dark:border-slate-700 dark:bg-slate-900/50">
          <h2 className="text-[12px] font-semibold text-ink dark:text-white">Langkah awal</h2>
          <p className="mt-0.5 text-[10px] text-[#5B6B8C] dark:text-slate-400">Selesaikan ini supaya pengguna bisa mulai memesan.</p>
          <ul className="mt-3 space-y-1.5">
            {data.setup.map((s) => (
              <li key={s.id} className="flex items-center gap-2 text-[10.5px] text-ink dark:text-slate-200">
                <span aria-hidden className={s.done ? "text-emerald-500" : "text-slate-400"}>{s.done ? "✓" : "○"}</span>
                {s.done ? <span className="text-[#5B6B8C] line-through dark:text-slate-500">{s.label}</span> : <Link href={s.href} className="font-medium text-primary-accent underline-offset-2 hover:underline">{s.label}</Link>}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-label="Perlu Tindakan" className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-[12px] font-semibold text-ink dark:text-white">Perlu Tindakan</h2>
          {allClear ? (
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-emerald-50 px-3 text-[10px] font-medium text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
              Semua aman
              <CircleCheck className="h-3.5 w-3.5" aria-hidden />
            </span>
          ) : null}
        </div>
        {/* All seven cards are always shown; a count of 0 is neutral (grey) instead of the card disappearing. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-[16px]" data-testid="attention-cards">
          {attention.map((stat, i) => (
            <motion.div key={stat.label} data-testid="attention-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.1 + i * 0.05, ease: "easeOut" }}>
              <StatCard {...stat} />
            </motion.div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Kesehatan Sinkronisasi"
          subtitle="Status pesanan disinkronkan tiap 2 menit."
          action={
            <Button
              variant="outline"
              loading={syncing}
              onClick={async () => {
                setSyncing(true);
                await run(resyncProviders({}));
                setSyncing(false);
              }}
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Sinkronkan ulang
            </Button>
          }
        >
          {data.syncHealth.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-300 px-3 py-3 text-[10px] text-[#5B6B8C] dark:border-slate-700 dark:text-slate-400">Belum ada provider terdaftar. Tambahkan lewat halaman Provider.</p>
          ) : null}
          <ul className="space-y-2" aria-label="Provider">
            {data.syncHealth.map((h) => (
              <li key={h.providerId} data-testid="sync-provider" className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/70 px-3 py-2 dark:border-slate-800">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-ink dark:text-white">{h.name}</p>
                  <p className="mt-1 text-[10px] text-[#5B6B8C] dark:text-slate-400">
                    {h.lastSyncedAt ? <>Sinkronisasi terakhir <time dateTime={h.lastSyncedAt}>{formatDateTime(h.lastSyncedAt)}</time></> : "Belum pernah sinkron berhasil"}
                  </p>
                </div>
                {!h.active ? (
                  <span className="inline-flex h-8 items-center rounded-full bg-slate-100 px-3 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">Nonaktif</span>
                ) : h.stalled ? (
                  <span className="inline-flex h-8 items-center rounded-full bg-red-50 px-3 text-[10px] font-medium text-red-500 dark:bg-red-500/15 dark:text-red-300">Sinkronisasi terhenti</span>
                ) : h.failingRuns >= 3 ? (
                  <Link href="/admin/logs" className="inline-flex h-8 items-center rounded-full bg-red-50 px-3 text-[10px] font-medium text-red-500 hover:underline dark:bg-red-500/15 dark:text-red-300">Gagal {h.failingRuns}x berturut-turut</Link>
                ) : (
                  <span className="inline-flex h-8 items-center rounded-full bg-emerald-50 px-3 text-[10px] font-medium text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">Normal</span>
                )}
              </li>
            ))}
          </ul>
          {data.alerts.length ? (
            <ul className="mt-3 space-y-1.5" aria-label="Peringatan provider">
              {data.alerts.map((a) => (
                <li key={a.id} className="rounded-xl bg-amber-50 px-3 py-2 text-[10px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">{a.message}</li>
              ))}
            </ul>
          ) : null}
        </Card>

        <Card
          title="Pesanan Gagal Kirim"
          subtitle="Saldo pengguna sudah dikembalikan otomatis."
          action={
            <Button variant="outline" disabled={data.failedCount === 0} onClick={() => setResendOpen(true)}>
              <Send className="h-3.5 w-3.5" aria-hidden />
              Kirim ulang semua
            </Button>
          }
        >
          {data.failedCount === 0 ? (
            <p className="flex items-center gap-2 rounded-2xl border border-slate-200/70 px-3 py-2.5 text-[10px] text-[#5B6B8C] dark:border-slate-800 dark:text-slate-400" data-testid="failed-empty">
              <ShieldAlert className="h-3.5 w-3.5" aria-hidden /> Tidak ada pesanan gagal kirim.
            </p>
          ) : (
            <>
              <ul className="space-y-2">
                {data.failedOrders.slice(0, 4).map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/70 px-3 py-2 dark:border-slate-800">
                    <p className="flex items-center gap-2 text-[11px] font-medium text-ink dark:text-white">
                      <span className="shrink-0 rounded-full bg-primary-solid px-2.5 py-1 text-[9.5px] font-semibold text-white">#{o.id}</span>
                      <span className="truncate">{o.username}</span>
                    </p>
                    <span className="text-[10px] text-[#5B6B8C] dark:text-slate-400">{formatIdr(o.charge)}</span>
                  </li>
                ))}
              </ul>
              {data.failedCount > 4 ? <Link href="/admin/orders?status=gagal_kirim" className={`${linkClass} mt-2 inline-block`}>Lihat semua {data.failedCount.toLocaleString("id-ID")} pesanan</Link> : null}
            </>
          )}
        </Card>
      </div>

      <Card
        title="Rekonsiliasi"
        subtitle={data.sanity ? `Pemeriksaan harian terakhir ${formatDateTime(data.sanity.at)}: ${data.sanity.balanceMismatches} selisih saldo, ${data.sanity.refundMismatches} refund tidak sesuai.` : "Perbandingan data panel dengan provider dan buku besar."}
        action={<Link href="/admin/ledger" className={linkClass}>Buka buku besar</Link>}
      >
        <ul className="grid gap-2 md:grid-cols-3">
          {[
            { label: "Status beda dengan provider", value: data.reconciliation.discrepancies, hint: "Pesanan aktif yang jawaban providernya tidak dikenal atau gagal dibaca. Detailnya ada di tiap pesanan.", href: "/admin/orders?status=berjalan" },
            { label: "Saldo tidak cocok dengan buku besar", value: data.reconciliation.balanceMismatches.length, hint: data.reconciliation.balanceMismatches.map((m) => m.username).join(", ") || "Semua saldo cocok.", href: "/admin/ledger" },
            { label: "Refund tidak sesuai perhitungan", value: data.reconciliation.refundMismatches, hint: "Periksa di halaman Refund.", href: "/admin/refunds?mismatch=1" },
          ].map((r) => (
            <li key={r.label} className={`rounded-2xl border p-3 ${r.value ? "border-amber-300 dark:border-amber-500/50" : "border-slate-200/70 dark:border-slate-800"}`}>
              <p className="text-[10px] text-[#5B6B8C] dark:text-slate-400">{r.label}</p>
              <Link href={r.href} aria-label={`${r.label}: ${r.value}. Buka daftar`} className="mt-1 inline-block rounded text-[16px] font-medium text-ink underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:text-white">{r.value.toLocaleString("id-ID")}</Link>
              <p className="mt-1 truncate text-[9.5px] text-[#5B6B8C] dark:text-slate-400">{r.hint}</p>
            </li>
          ))}
        </ul>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[12px] font-semibold text-ink dark:text-white">Analitik</h2>
        <SegmentedControl<Range>
          items={rangeItems}
          value={range}
          onChange={setRange}
          ariaLabel="Rentang waktu"
          className="h-10 w-[260px] max-w-full"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Pendapatan dan Profit" subtitle={`Pendapatan ${formatIdr(total)} · Profit ${formatIdr(profitTotal)} (garis putus-putus)`}>
          <RevenueChart data={revenue} />
        </Card>
        <Card title="Pesanan per platform" subtitle={`${orderTotal.toLocaleString("id-ID")} pesanan`}>
          <PlatformChart data={platformData} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Pesanan Terbaru" action={<Link href="/admin/orders" className={linkClass}>Lihat semua</Link>}>
          <ul className="space-y-2">
            {data.recentOrders.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/70 px-3 py-2 dark:border-slate-800">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-[11px] font-medium text-ink dark:text-white">
                    <span className="shrink-0 rounded-full bg-primary-solid px-2.5 py-1 text-[9.5px] font-semibold text-white">#{o.id}</span>
                    <span className="truncate">{o.username}</span>
                  </p>
                  <p className="mt-1 truncate text-[10px] text-[#5B6B8C] dark:text-slate-400" title={o.name}>
                    {o.name}
                  </p>
                </div>
                <OrderStatusChip status={o.status} />
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Deposit Terbaru" action={<Link href="/admin/deposits" className={linkClass}>Lihat semua</Link>}>
          <ul className="space-y-2">
            {data.recentDeposits.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/70 px-3 py-2 dark:border-slate-800">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-ink dark:text-white">
                    {d.username} <span className="text-[#5B6B8C] dark:text-slate-400">- {d.method}</span>
                  </p>
                  <p className="mt-1 text-[10px] text-[#5B6B8C] dark:text-slate-400">
                    {formatIdr(d.amount)} <span aria-hidden>&bull;</span>{" "}
                    <time dateTime={d.createdAt}>{formatDateTime(d.createdAt)}</time>
                  </p>
                </div>
                <DepositStatusChip status={d.status} />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card
        title="Saldo Provider"
        subtitle={`Peringatan muncul jika saldo di bawah ${formatIdr(data.lowBalanceThreshold)}.${data.autoDisableLowBalance ? " Layanan otomatis dinonaktifkan di bawah batas." : ""}`}
        action={<Link href="/admin/providers" className={linkClass}>Kelola provider</Link>}
      >
        <ul className="grid gap-2 md:grid-cols-3">
          {data.providers.map((p) => (
            <li key={p.id} className="rounded-2xl border border-slate-200/70 p-3 dark:border-slate-800">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold text-ink dark:text-white">{p.name}</p>
                <ProviderStatusChip status={p.status} />
              </div>
              <p className="mt-2 text-[16px] font-medium tracking-[-0.01em] text-ink dark:text-white">{formatIdr(p.balance)}</p>
              {data.lowProviders.includes(p.id) ? (
                <div className="mt-2">
                  <LowBalanceChip />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>
      <ConfirmDialog
        open={resendOpen}
        onClose={() => setResendOpen(false)}
        title="Kirim ulang semua pesanan gagal?"
        description={`${data.failedCount} pesanan akan dikirim lagi ke provider dan saldo pengguna dipotong lagi. Pesanan dengan saldo kurang dilewati. Masukkan password adminmu.`}
        confirmLabel="Kirim ulang"
        tone="primary"
        requirePassword
        onConfirm={async (password) => {
          const result = await run(resendAllFailedOrders({ password }));
          if (result.ok) setResendOpen(false);
        }}
      />
    </div>
  );
}
