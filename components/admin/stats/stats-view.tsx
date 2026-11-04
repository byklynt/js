"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Banknote, Download, Percent, Scale, TrendingUp, Undo2, UserPlus, Users, Wallet } from "lucide-react";
import { formatIdr } from "@/lib/balance";
import type { Card, RangeId, StatsResult, TabId } from "@/lib/server/stats";
import { PageHeader } from "@/components/shell/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { FilterPill } from "@/components/ui/filter-pill";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { StatusChip } from "@/components/ui/status-chip";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { useToast } from "@/components/shared/toast";
import { ColumnBars, HorizontalBars, SeriesLine, StackedBars } from "./stats-charts";

export type StatsUrlParams = { tab: TabId; range: RangeId; from?: string; to?: string; provider: string; platform: string; compare: boolean };

const rangeItems: { value: RangeId; label: string }[] = [
  { value: "hari", label: "Hari ini" },
  { value: "7", label: "7 hari" },
  { value: "30", label: "30 hari" },
  { value: "90", label: "90 hari" },
  { value: "bulan", label: "Bulan ini" },
  { value: "kustom", label: "Kustom" },
];
const tabItems: { value: TabId; label: string }[] = [
  { value: "keuangan", label: "Keuangan" },
  { value: "layanan", label: "Layanan" },
  { value: "pengguna", label: "Pengguna" },
  { value: "provider", label: "Provider" },
  { value: "operasional", label: "Operasional" },
];

const compactIdr = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });
const num = new Intl.NumberFormat("id-ID");
const pct = (n: number) => `${n.toLocaleString("id-ID")}%`;

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

const cardIcons: Record<string, typeof Wallet> = {
  revenue: Wallet, cost: Banknote, refund: Undo2, profit: TrendingUp, margin: Percent,
  signups: UserPlus, active: Users, avg: Scale, balance: Wallet,
};
const cardTones = ["sky", "amber", "rose", "emerald", "sky"] as const;

function cardValue(c: Card) {
  if (c.kind === "pct") return pct(c.value);
  if (c.kind === "int") return num.format(c.value);
  return (
    <>
      <span title={formatIdr(c.value)} className="sm:hidden">Rp {compactIdr.format(c.value)}</span>
      <span className="hidden sm:inline">{formatIdr(c.value)}</span>
    </>
  );
}

function deltaOf(c: Card) {
  if (c.delta === null || c.delta === undefined) return null;
  const sign = c.delta > 0 ? "+" : "";
  const good = c.invert ? c.delta <= 0 : c.delta >= 0;
  return { text: `${sign}${c.delta.toLocaleString("id-ID")}${c.kind === "pct" ? " pp" : "%"}`, good };
}

function CardGrid({ cards, cols }: { cards: Card[]; cols: string }) {
  return (
    <div className={`grid grid-cols-2 gap-3 sm:gap-4 ${cols}`}>
      {cards.map((c, i) => (
        <motion.div key={c.key} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: i * 0.05, ease: "easeOut" }}>
          <StatCard
            label={c.label}
            value={cardValue(c)}
            icon={cardIcons[c.key] ?? Wallet}
            tone={cardTones[i % cardTones.length]}
            actionLabel={c.href ? "Lihat daftar" : "Lihat tabel"}
            actionHref={c.href ?? "#stats-table"}
            delta={deltaOf(c)}
            compact
          />
        </motion.div>
      ))}
    </div>
  );
}

function ChartCard({ title, subtitle, children, className = "" }: { title: string; subtitle: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 ${className}`}>
      <div className="mb-3">
        <h2 className="text-[12px] font-semibold text-ink dark:text-white">{title}</h2>
        <p className="mt-0.5 text-[10px] text-[#5B6B8C] dark:text-slate-400">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sortable table with "show more"
// ---------------------------------------------------------------------------

type SortCol<T> = Column<T> & { sort?: (row: T) => number | string };

function SortTable<T>({ columns, rows, rowKey, mobileCard, ariaLabel, initialSort }: {
  columns: SortCol<T>[]; rows: T[]; rowKey: (r: T) => string; mobileCard: (r: T) => React.ReactNode; ariaLabel: string; initialSort?: { key: string; dir: "asc" | "desc" };
}) {
  const [sort, setSort] = useState(initialSort ?? null);
  const [visible, setVisible] = useState(10);
  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort?.key);
    if (!col?.sort || !sort) return rows;
    const get = col.sort;
    return [...rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      const r = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "id-ID");
      return sort.dir === "asc" ? r : -r;
    });
  }, [rows, columns, sort]);

  return (
    <div id="stats-table" className="scroll-mt-32">
      <DataTable
        ariaLabel={ariaLabel}
        columns={columns.map((c) => ({ ...c, sortable: Boolean(c.sort) }))}
        rows={sorted.slice(0, visible)}
        rowKey={rowKey}
        mobileCard={mobileCard}
        sort={sort ?? undefined}
        onSort={(key) => setSort((s) => (s?.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }))}
      />
      <Pagination total={sorted.length} visible={visible} onMore={() => setVisible((v) => v + 10)} />
    </div>
  );
}

const right = "text-right whitespace-nowrap";
function MobileRow({ title, items }: { title: React.ReactNode; items: [string, React.ReactNode][] }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-ink dark:text-white">{title}</p>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px]">
        {items.map(([k, v]) => (
          <div key={k}>
            <dt className="text-[#5B6B8C] dark:text-slate-400">{k}</dt>
            <dd className="font-medium text-ink dark:text-slate-100">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

const marginCell = (m: number) => (m < 0 ? <span className="font-semibold text-red-500">{pct(m)} (rugi)</span> : pct(m));

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

const cell = (v: string | number) => {
  const t = String(v);
  return `"${(typeof v === "string" && /^[=+\-@]/.test(t) ? `'${t}` : t).replace(/"/g, '""')}"`;
};

function csvFor(r: StatsResult, layananFilter: { thin: boolean; high: boolean }): { name: string; rows: (string | number)[][] } | null {
  if (r.keuangan) return { name: "keuangan", rows: [["Tanggal", "Pesanan", "Pendapatan", "Biaya provider", "Refund", "Profit", "Margin %"], ...r.keuangan.series.map((d) => [d.date, d.orders, d.revenue, d.providerCost, d.refund, d.profit, d.margin])] };
  if (r.layanan) {
    const rows = r.layanan.rows.filter((x) => (!layananFilter.thin || x.thin) && (!layananFilter.high || x.highRefund));
    return { name: "layanan", rows: [["ID", "Nama", "Platform", "Pesanan", "Pendapatan", "Profit", "Margin %", "Rasio refund %"], ...rows.map((x) => [x.serviceId, x.name, x.platform, x.orders, x.revenue, x.profit, x.margin, x.refundRate])] };
  }
  if (r.pengguna) return { name: "pengguna", rows: [["Username", "Total belanja", "Jumlah order", "Rasio refund", "Status"], ...r.pengguna.spenders.map((u) => [u.username, u.totalSpent, u.orders, u.refundRatio, u.status])] };
  if (r.provider) return { name: "provider", rows: [["Provider", "Pesanan", "Success rate %", "Partial %", "Cancel %", "Rata-rata selesai (menit)", "Biaya total", "Saldo", "Status sync"], ...r.provider.rows.map((p) => [p.name, p.orders, p.successRate, p.partialRate, p.cancelRate, p.avgMinutes, p.cost, p.balance, p.syncStatus])] };
  if (r.operasional) {
    const o = r.operasional;
    return { name: "operasional", rows: [["Tanggal", "Pesanan macet", "Tiket", "Respons pertama (menit)", "Error sinkron"], ...o.tickets.map((t, i) => [t.date, o.stuck[i]?.stuck ?? 0, t.tickets, t.firstResponseMin, o.syncErrors[i]?.syncErrors ?? 0])] };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function StatsView({ result, params, providers, platforms }: {
  result: StatsResult; params: StatsUrlParams; providers: { id: string; name: string }[]; platforms: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const [thinOnly, setThinOnly] = useState(false);
  const [highOnly, setHighOnly] = useState(false);

  // 400ms skeleton whenever the filters or the tab change.
  const key = JSON.stringify(params);
  const [readyFor, setReadyFor] = useState<string | null>(null);
  useEffect(() => {
    const t = window.setTimeout(() => setReadyFor(key), 400);
    return () => window.clearTimeout(t);
  }, [key]);
  const loading = readyFor !== key;

  function update(patch: Partial<StatsUrlParams>) {
    const next = { ...params, ...patch };
    const qs = new URLSearchParams();
    qs.set("tab", next.tab);
    qs.set("range", next.range);
    if (next.range === "kustom") {
      if (next.from) qs.set("from", next.from);
      if (next.to) qs.set("to", next.to);
    }
    if (next.provider !== "semua") qs.set("provider", next.provider);
    if (next.platform !== "semua") qs.set("platform", next.platform);
    if (next.compare) qs.set("compare", "1");
    router.replace(`${pathname}?${qs.toString()}`, { scroll: false });
  }

  function exportCsv() {
    const data = csvFor(result, { thin: thinOnly, high: highOnly });
    if (!data) return;
    const blob = new Blob(["﻿" + data.rows.map((r) => r.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `statistik-${data.name}-${result.period.from}-${result.period.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast("CSV diekspor");
  }

  const periodText = `${result.period.from} sampai ${result.period.to}`;

  return (
    <div>
      <PageHeader title="Statistik" subtitle="Analisis keuangan, layanan, dan pengguna" />

      {/* Sticky toolbar on the full-width line */}
      <div className="sticky top-[66px] z-20 -mx-4 border-b border-slate-200/70 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-[53px] lg:px-[53px] dark:border-slate-800 dark:bg-slate-950/95">
        <div className="flex flex-wrap items-center gap-3">
          <div className="thin-scroll max-w-full overflow-x-auto">
            <SegmentedControl<RangeId> items={rangeItems} value={params.range} onChange={(range) => update({ range })} ariaLabel="Rentang waktu" className="h-10 min-w-[460px] w-[520px]" />
          </div>
          {params.range === "kustom" ? (
            <div className="flex items-end gap-2">
              <TextField label="Dari" type="date" max={result.period.to} value={params.from ?? result.period.from} onChange={(e) => update({ from: e.target.value })} />
              <TextField label="Sampai" type="date" value={params.to ?? result.period.to} onChange={(e) => update({ to: e.target.value })} />
            </div>
          ) : null}
          <label className="flex items-center gap-2 text-[10px] font-medium text-ink dark:text-slate-100">
            <ToggleSwitch checked={params.compare} onChange={(compare) => update({ compare })} label="Bandingkan dengan periode sebelumnya" />
            Bandingkan dengan periode sebelumnya
          </label>
          <FilterPill options={[{ id: "semua", label: "Semua provider" }, ...providers.map((p) => ({ id: p.id, label: p.name }))]} value={params.provider} onChange={(provider) => update({ provider })} ariaLabel="Filter provider" />
          <FilterPill options={[{ id: "semua", label: "Semua platform" }, ...platforms.map((p) => ({ id: p, label: p.charAt(0).toUpperCase() + p.slice(1) }))]} value={params.platform} onChange={(platform) => update({ platform })} ariaLabel="Filter platform" />
          <Button variant="outline" className="ml-auto" onClick={exportCsv}>
            <Download className="h-3.5 w-3.5" aria-hidden />
            Ekspor CSV
          </Button>
        </div>
        <p className="mt-2 text-[9.5px] text-[#5B6B8C] dark:text-slate-400">
          Periode {periodText}
          {params.compare ? `, dibandingkan dengan ${result.period.prevFrom} sampai ${result.period.prevTo}.` : "."} Data contoh (belum dari database).
        </p>
      </div>

      <div className="thin-scroll mt-4 overflow-x-auto">
        <SegmentedControl<TabId> items={tabItems} value={params.tab} onChange={(tab) => update({ tab })} ariaLabel="Bagian statistik" className="h-10 min-w-[520px]" />
      </div>

      <div className="mt-6 space-y-6">
        {result.keuangan ? <Keuangan r={result.keuangan} loading={loading} /> : null}
        {result.layanan ? <Layanan r={result.layanan} loading={loading} thinOnly={thinOnly} highOnly={highOnly} setThin={setThinOnly} setHigh={setHighOnly} /> : null}
        {result.pengguna ? <Pengguna r={result.pengguna} loading={loading} /> : null}
        {result.provider ? <Provider r={result.provider} loading={loading} /> : null}
        {result.operasional ? <Operasional r={result.operasional} loading={loading} /> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

type Keu = NonNullable<StatsResult["keuangan"]>;
function Keuangan({ r, loading }: { r: Keu; loading: boolean }) {
  type Row = Keu["series"][number];
  const columns: SortCol<Row>[] = [
    { key: "date", header: "Tanggal", cell: (d) => d.label, sort: (d) => d.date },
    { key: "orders", header: "Pesanan", cell: (d) => num.format(d.orders), className: right, sort: (d) => d.orders },
    { key: "revenue", header: "Pendapatan", cell: (d) => formatIdr(d.revenue), className: right, sort: (d) => d.revenue },
    { key: "cost", header: "Biaya provider", cell: (d) => formatIdr(d.providerCost), className: right, sort: (d) => d.providerCost },
    { key: "refund", header: "Refund", cell: (d) => formatIdr(d.refund), className: right, sort: (d) => d.refund },
    { key: "profit", header: "Profit", cell: (d) => <span className={d.profit < 0 ? "font-semibold text-red-500" : ""}>{formatIdr(d.profit)}</span>, className: right, sort: (d) => d.profit },
    { key: "margin", header: "Margin", cell: (d) => pct(d.margin), className: right, sort: (d) => d.margin },
  ];
  return (
    <>
      <CardGrid cards={r.cards} cols="lg:grid-cols-5" />
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Pendapatan, profit, dan refund" subtitle="Per hari pada periode yang dipilih">
          <SeriesLine loading={loading} money label="Grafik pendapatan, profit, dan refund per hari" data={r.series} series={[{ key: "revenue", label: "Pendapatan" }, { key: "profit", label: "Profit", color: "profit" }, { key: "refund", label: "Refund", color: "refund" }]} />
        </ChartCard>
        <ChartCard title="Pemasukan per metode pembayaran" subtitle="Deposit berhasil per hari">
          <StackedBars loading={loading} label="Grafik pemasukan per metode pembayaran" data={r.byMethod} keys={r.methods} />
        </ChartCard>
      </div>
      <SortTable ariaLabel="Total harian" columns={columns} rows={[...r.series].reverse()} rowKey={(d) => d.date} initialSort={{ key: "date", dir: "desc" }}
        mobileCard={(d) => <MobileRow title={d.label} items={[["Pesanan", num.format(d.orders)], ["Pendapatan", formatIdr(d.revenue)], ["Biaya provider", formatIdr(d.providerCost)], ["Refund", formatIdr(d.refund)], ["Profit", formatIdr(d.profit)], ["Margin", pct(d.margin)]]} />} />
    </>
  );
}

type Lay = NonNullable<StatsResult["layanan"]>;
function Layanan({ r, loading, thinOnly, highOnly, setThin, setHigh }: { r: Lay; loading: boolean; thinOnly: boolean; highOnly: boolean; setThin: (v: boolean) => void; setHigh: (v: boolean) => void }) {
  type Row = Lay["rows"][number];
  const rows = r.rows.filter((x) => (!thinOnly || x.thin) && (!highOnly || x.highRefund));
  const chip = (active: boolean) => `h-8 rounded-full border px-4 text-[10px] font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${active ? "border-primary-300 bg-primary-50 text-primary-accent dark:border-primary-border dark:bg-primary-soft" : "border-slate-200 text-ink hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"}`;
  const columns: SortCol<Row>[] = [
    { key: "id", header: "ID", cell: (x) => <Link href="/admin/services" className="font-semibold text-primary-accent hover:underline">{x.serviceId}</Link>, sort: (x) => Number(x.serviceId) },
    { key: "name", header: "Nama", cell: (x) => <span className="block max-w-[260px] truncate" title={x.name}>{x.name}</span>, sort: (x) => x.name },
    { key: "platform", header: "Platform", cell: (x) => <span className="capitalize">{x.platform}</span>, sort: (x) => x.platform },
    { key: "orders", header: "Pesanan", cell: (x) => num.format(x.orders), className: right, sort: (x) => x.orders },
    { key: "revenue", header: "Pendapatan", cell: (x) => formatIdr(x.revenue), className: right, sort: (x) => x.revenue },
    { key: "profit", header: "Profit", cell: (x) => <span className={x.profit < 0 ? "font-semibold text-red-500" : ""}>{formatIdr(x.profit)}</span>, className: right, sort: (x) => x.profit },
    { key: "margin", header: "Margin", cell: (x) => (x.thin ? <Link href="/admin/services?margin=low" className="hover:underline">{marginCell(x.margin)}</Link> : pct(x.margin)), className: right, sort: (x) => x.margin },
    { key: "refund", header: "Rasio refund", cell: (x) => (x.highRefund ? <Link href="/admin/refunds" className="font-semibold text-amber-600 hover:underline dark:text-amber-300">{pct(x.refundRate)}</Link> : pct(x.refundRate)), className: right, sort: (x) => x.refundRate },
  ];
  return (
    <>
      <ChartCard title="10 layanan teratas" subtitle="Berdasarkan pendapatan pada periode yang dipilih">
        <HorizontalBars loading={loading} label="Grafik 10 layanan teratas berdasarkan pendapatan" data={r.top10.map((x) => ({ name: x.name, value: x.revenue }))} />
      </ChartCard>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-pressed={thinOnly} onClick={() => setThin(!thinOnly)} className={chip(thinOnly)}>Margin tipis / rugi</button>
        <button type="button" aria-pressed={highOnly} onClick={() => setHigh(!highOnly)} className={chip(highOnly)}>Refund tinggi</button>
        <span className="text-[10px] text-[#5B6B8C] dark:text-slate-400">{rows.length} layanan</span>
      </div>
      <SortTable ariaLabel="Layanan teratas" columns={columns} rows={rows} rowKey={(x) => x.serviceId} initialSort={{ key: "revenue", dir: "desc" }}
        mobileCard={(x) => <MobileRow title={`${x.serviceId} - ${x.name}`} items={[["Platform", x.platform], ["Pesanan", num.format(x.orders)], ["Pendapatan", formatIdr(x.revenue)], ["Profit", formatIdr(x.profit)], ["Margin", marginCell(x.margin)], ["Rasio refund", pct(x.refundRate)]]} />} />
    </>
  );
}

type Pen = NonNullable<StatsResult["pengguna"]>;
function Pengguna({ r, loading }: { r: Pen; loading: boolean }) {
  type Row = Pen["spenders"][number];
  const columns: SortCol<Row>[] = [
    { key: "user", header: "Username", cell: (u) => <span className="font-medium">{u.username}</span>, sort: (u) => u.username },
    { key: "spent", header: "Total belanja", cell: (u) => formatIdr(u.totalSpent), className: right, sort: (u) => u.totalSpent },
    { key: "orders", header: "Jumlah order", cell: (u) => num.format(u.orders), className: right, sort: (u) => u.orders },
    { key: "ratio", header: "Rasio refund", cell: (u) => pct(Math.round(u.refundRatio * 1000) / 10), className: right, sort: (u) => u.refundRatio },
    { key: "status", header: "Status", cell: (u) => (u.status === "aktif" ? <StatusChip label="Aktif" tone="emerald" /> : <StatusChip label="Diblokir" tone="red" />), sort: (u) => u.status },
  ];
  return (
    <>
      <CardGrid cards={r.cards} cols="lg:grid-cols-4" />
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Pendaftar baru" subtitle="Jumlah akun baru per hari" className="lg:col-span-2">
          <SeriesLine loading={loading} unit="akun" label="Grafik pendaftar baru per hari" data={r.signups} series={[{ key: "signups", label: "Pendaftar" }]} />
        </ChartCard>
        <ChartCard title="Perlu ditinjau" subtitle="Rasio refund 40% atau lebih">
          {r.review.length === 0 ? (
            <p className="text-[10px] text-[#5B6B8C] dark:text-slate-400">Tidak ada pengguna yang perlu ditinjau.</p>
          ) : (
            <ul className="space-y-2">
              {r.review.slice(0, 6).map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200/70 px-3 py-2 dark:border-slate-800">
                  <span className="text-[11px] font-medium text-ink dark:text-white">{u.username}</span>
                  <span className="text-[10px] text-amber-600 dark:text-amber-300">{pct(Math.round(u.refundRatio * 1000) / 10)}</span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/admin/users?status=review" className="mt-3 inline-block rounded text-[10px] font-medium text-primary-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">Buka daftar pengguna</Link>
        </ChartCard>
      </div>
      <h2 className="text-[12px] font-semibold text-ink dark:text-white">Pembelanja teratas</h2>
      <SortTable ariaLabel="Pembelanja teratas" columns={columns} rows={r.spenders} rowKey={(u) => u.id} initialSort={{ key: "spent", dir: "desc" }}
        mobileCard={(u) => <MobileRow title={u.username} items={[["Total belanja", formatIdr(u.totalSpent)], ["Jumlah order", num.format(u.orders)], ["Rasio refund", pct(Math.round(u.refundRatio * 1000) / 10)], ["Status", u.status === "aktif" ? "Aktif" : "Diblokir"]]} />} />
    </>
  );
}

type Prov = NonNullable<StatsResult["provider"]>;
function Provider({ r, loading }: { r: Prov; loading: boolean }) {
  type Row = Prov["rows"][number];
  const syncChip = (s: Row["syncStatus"]) => <StatusChip label={s} tone={s === "Normal" ? "emerald" : s === "Terhenti" ? "red" : "amber"} />;
  const columns: SortCol<Row>[] = [
    { key: "name", header: "Provider", cell: (p) => <Link href="/admin/providers" className="font-semibold text-primary-accent hover:underline">{p.name}</Link>, sort: (p) => p.name },
    { key: "orders", header: "Pesanan", cell: (p) => <Link href="/admin/orders" className="hover:underline">{num.format(p.orders)}</Link>, className: right, sort: (p) => p.orders },
    { key: "success", header: "Success rate", cell: (p) => pct(p.successRate), className: right, sort: (p) => p.successRate },
    { key: "partial", header: "Partial", cell: (p) => pct(p.partialRate), className: right, sort: (p) => p.partialRate },
    { key: "cancel", header: "Cancel", cell: (p) => pct(p.cancelRate), className: right, sort: (p) => p.cancelRate },
    { key: "avg", header: "Rata-rata selesai", cell: (p) => `${num.format(p.avgMinutes)} menit`, className: right, sort: (p) => p.avgMinutes },
    { key: "cost", header: "Biaya total", cell: (p) => formatIdr(p.cost), className: right, sort: (p) => p.cost },
    { key: "balance", header: "Saldo", cell: (p) => formatIdr(p.balance), className: right, sort: (p) => p.balance },
    { key: "sync", header: "Sinkron", cell: (p) => syncChip(p.syncStatus), sort: (p) => p.syncStatus },
  ];
  return (
    <>
      <ChartCard title="Perbandingan success rate" subtitle="Pesanan selesai penuh dibanding semua pesanan">
        <ColumnBars loading={loading} data={r.rows} xKey="name" dataKey="successRate" unit="%" label="Grafik success rate per provider" />
      </ChartCard>
      <SortTable ariaLabel="Statistik provider" columns={columns} rows={r.rows} rowKey={(p) => p.id} initialSort={{ key: "orders", dir: "desc" }}
        mobileCard={(p) => <MobileRow title={p.name} items={[["Pesanan", num.format(p.orders)], ["Success rate", pct(p.successRate)], ["Partial / cancel", `${pct(p.partialRate)} / ${pct(p.cancelRate)}`], ["Rata-rata selesai", `${num.format(p.avgMinutes)} menit`], ["Biaya total", formatIdr(p.cost)], ["Saldo", formatIdr(p.balance)], ["Sinkron", syncChip(p.syncStatus)]]} />} />
    </>
  );
}

type Ops = NonNullable<StatsResult["operasional"]>;
function Operasional({ r, loading }: { r: Ops; loading: boolean }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartCard title="Rata-rata waktu selesai per platform" subtitle="Menit dari pesanan dibuat sampai selesai">
        <HorizontalBars loading={loading} money={false} unit="menit" height={240} label="Grafik rata-rata waktu selesai per platform" data={r.completion.map((c) => ({ name: c.platform.charAt(0).toUpperCase() + c.platform.slice(1), value: c.avgMinutes }))} />
      </ChartCard>
      <ChartCard title="Tren pesanan macet" subtitle="Jumlah pesanan macet per hari">
        <SeriesLine loading={loading} unit="pesanan" label="Grafik tren pesanan macet" data={r.stuck} series={[{ key: "stuck", label: "Macet", color: "amber" }]} />
      </ChartCard>
      <ChartCard title="Tiket per hari" subtitle="Tiket baru yang masuk">
        <ColumnBars loading={loading} data={r.tickets} xKey="label" dataKey="tickets" unit="tiket" label="Grafik tiket per hari" />
      </ChartCard>
      <ChartCard title="Respons pertama tiket" subtitle="Rata-rata menit sampai balasan pertama">
        <SeriesLine loading={loading} unit="menit" label="Grafik rata-rata respons pertama" data={r.tickets} series={[{ key: "firstResponseMin", label: "Respons pertama" }]} />
      </ChartCard>
      <ChartCard title="Error sinkronisasi per hari" subtitle="Panggilan ke provider yang gagal" className="lg:col-span-2">
        <ColumnBars loading={loading} data={r.syncErrors} xKey="label" dataKey="syncErrors" unit="error" label="Grafik error sinkronisasi per hari" />
      </ChartCard>
    </div>
  );
}
