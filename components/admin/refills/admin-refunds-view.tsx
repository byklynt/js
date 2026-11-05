"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, Check, Eye, Plus, ReceiptText, TriangleAlert, X } from "lucide-react";
import { motion } from "framer-motion";
import { createRefund, reviewRefund } from "@/lib/admin-actions";
import { formatDateTime, formatIdr } from "@/lib/balance";
import { refundFormula } from "@/lib/refund-formula";
import { orderStatusLabels } from "@/lib/orders-data";
import type { RefundRow } from "@/lib/server/views";
import { PageHeader } from "@/components/shell/page-header";
import { DataToolbar } from "@/components/ui/data-toolbar";
import { ActionMenu } from "@/components/ui/action-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { ListSkeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/ui/pagination";
import { FilterPill } from "@/components/ui/filter-pill";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TextField } from "@/components/ui/text-field";
import { useSearchParams } from "next/navigation";
import { useListState, useParamFilter } from "@/lib/use-list-state";
import { useAdminRunner } from "../use-admin-runner";
import { RefundStatusPair } from "../admin-chips";

type RefundFilter = RefundRow["status"] | "semua";
type OrderFilter = "semua" | "dibatalkan" | "sebagian" | "gagal_kirim";

// Filter pill = REFUND status (what an admin acts on). The small second pill filters the ORDER status.
const refundFilters: { id: RefundFilter; label: string }[] = [
  { id: "semua", label: "Semua" },
  { id: "menunggu", label: "Menunggu" },
  { id: "selesai", label: "Selesai" },
  { id: "ditolak", label: "Ditolak" },
];
const orderFilters: { id: OrderFilter; label: string }[] = [
  { id: "semua", label: "Semua pesanan" },
  { id: "dibatalkan", label: "Pesanan dibatalkan" },
  { id: "sebagian", label: "Pesanan sebagian" },
  { id: "gagal_kirim", label: "Pesanan gagal kirim" },
];

const reasonLabel: Record<RefundRow["reason"], string> = { dibatalkan: "Dibatalkan", sebagian: "Sebagian", gagal_kirim: "Gagal kirim", manual: "Manual", user_cancel: "Pembatalan pengguna" };
const sourceLabel: Record<RefundRow["source"], string> = { auto: "Otomatis", admin: "Admin", user_request: "Permintaan pengguna" };

type Dlg = { kind: "approve" | "reject"; refund: RefundRow };

export function AdminRefundsView({ refunds }: { refunds: RefundRow[] }) {
  const run = useAdminRunner();
  const mismatchOnly = useSearchParams().get("mismatch") === "1";
  const list = useListState<RefundFilter>(useParamFilter<RefundFilter>(refundFilters.map((f) => f.id), "semua"));
  const [prefill, setPrefill] = useState<{ orderId: string; amount: number } | null>(null);
  const [orderFilter, setOrderFilter] = useState<OrderFilter>("semua");
  const [dialog, setDialog] = useState<Dlg | null>(null);
  const [detail, setDetail] = useState<RefundRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [override, setOverride] = useState(false);
  const [overrideAmount, setOverrideAmount] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  const filtered = useMemo(
    () =>
      refunds.filter((r) => {
        if (r.virtual !== undefined && !mismatchOnly) return false;
        if (mismatchOnly && !r.order.mismatch) return false;
        if (list.filter !== "semua" && r.status !== list.filter) return false;
        if (orderFilter !== "semua" && r.order.status !== orderFilter) return false;
        if (!list.debounced) return true;
        return r.orderId.includes(list.debounced) || r.username.toLowerCase().includes(list.debounced);
      }),
    [refunds, list.filter, orderFilter, list.debounced, mismatchOnly]
  );
  const shown = filtered.slice(0, list.visible);

  function menuFor(r: RefundRow) {
    if (r.virtual) {
      return <ActionMenu label={`Aksi untuk pesanan ${r.orderId}`} items={[{ label: "Buat refund", icon: Check, onSelect: () => { setPrefill({ orderId: r.orderId, amount: r.amount }); setCreating(true); } }]} />;
    }
    const items = [
      { label: "Lihat detail", icon: Eye, onSelect: () => setDetail(r) },
      ...(r.status === "menunggu"
        ? [
            { label: "Setujui dan kembalikan saldo", icon: Check, onSelect: () => setDialog({ kind: "approve" as const, refund: r }) },
            { label: "Tolak", icon: X, tone: "danger" as const, onSelect: () => { setRejectReason(""); setDialog({ kind: "reject" as const, refund: r }); } },
          ]
        : []),
    ];
    return <ActionMenu label={`Aksi untuk refund pesanan ${r.orderId}`} items={items} />;
  }

  const target = dialog?.refund;

  return (
    <div>
      <PageHeader title="Refund" subtitle="Refund otomatis langsung selesai. Antrean Menunggu hanya berisi refund manual atau permintaan pengguna." />
      <DataToolbar
        filter={{ options: refundFilters, value: list.filter, onChange: list.setFilter, ariaLabel: "Filter status refund" }}
        query={list.query}
        onQueryChange={list.setQuery}
        searchLabel="Cari refund berdasarkan ID pesanan atau pengguna"
        actions={
          <>
            <FilterPill options={orderFilters} value={orderFilter} onChange={(next) => setOrderFilter(next)} ariaLabel="Filter status pesanan" />
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              Refund manual
            </Button>
          </>
        }
      />
      <section aria-label="Daftar refund" className="mt-5">
        {list.loading ? (
          <ListSkeleton label="Memuat refund" />
        ) : filtered.length === 0 ? (
          <EmptyState icon={ReceiptText} title="Belum ada refund" />
        ) : (
          <>
            <ul className="space-y-3">
              {shown.map((r, i) => (
                <motion.li
                  key={r.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: Math.min(i, 10) * 0.03, ease: "easeOut" }}
                  className={`flex list-none flex-col gap-2.5 rounded-2xl border bg-white px-3 py-3 md:min-h-[54px] md:flex-row md:items-center md:justify-between md:py-2 dark:bg-slate-900 ${r.order.mismatch ? "border-amber-300 dark:border-amber-500/50" : "border-slate-200/70 dark:border-slate-800"}`}
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                    <Link href="/admin/orders" aria-label={`Lihat pesanan ${r.orderId}`} className="shrink-0 rounded text-[11px] font-medium text-primary-600 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:text-primary-300">
                      {r.orderId}
                    </Link>
                    <span className="text-[11px] font-medium text-ink dark:text-slate-100">{r.username}</span>
                    {r.source === "auto" ? <span className="text-[9px] font-medium text-[#5B6B8C] dark:text-slate-400">otomatis</span> : null}
                    {r.cancel ? (
                      <span className="text-[9.5px] font-medium text-[#5B6B8C] dark:text-slate-400" data-testid="cancel-meta">
                        Batal oleh pengguna: usia {r.cancel.ageHours} jam, sisa {r.cancel.remains.toLocaleString("id-ID")}/{r.cancel.quantity.toLocaleString("id-ID")}, hitungan {formatIdr(r.cancel.calculated)} ({r.cancel.percent}%)
                      </span>
                    ) : null}
                    <FormulaLine r={r} />
                    <time dateTime={r.createdAt} className="flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-ink dark:text-slate-100">
                      <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                      {formatDateTime(r.createdAt)}
                    </time>
                    {r.order.mismatch ? (
                      <span className="inline-flex items-center gap-1 text-[9.5px] font-medium text-amber-600 dark:text-amber-300" title={`Seharusnya ${formatIdr(r.order.expected)}, sudah direfund ${formatIdr(r.order.refundedAmount)}`}>
                        <TriangleAlert className="h-3 w-3" aria-hidden />
                        Selisih
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-start gap-2.5 md:flex-row md:items-center md:gap-3">
                    <span className="inline-flex h-8 items-center rounded-full bg-primary-soft px-3 text-[10px] font-semibold text-primary-600 dark:text-primary-accent">
                      +{formatIdr(r.amount)}
                    </span>
                    <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 md:w-auto md:flex-nowrap">
                      <RefundStatusPair orderStatus={r.order.status} review={r.status} />
                      <span className="ml-auto md:ml-0">{menuFor(r)}</span>
                    </div>
                  </div>
                </motion.li>
              ))}
            </ul>
            <Pagination total={filtered.length} visible={list.visible} onMore={list.showMore} />
          </>
        )}
      </section>

      <ConfirmDialog
        open={dialog?.kind === "approve"}
        onClose={() => { setDialog(null); setOverride(false); setOverrideAmount(""); setOverrideReason(""); }}
        title={target?.reason === "user_cancel" ? "Setujui pembatalan dan kembalikan saldo?" : "Setujui dan kembalikan saldo?"}
        description={
          target?.cancel
            ? `Pesanan #${target.orderId} dibatalkan. Rumus: biaya pesanan x sisa / jumlah x ${target.cancel.percent}%, dibulatkan ke bawah. Sekarang sisa ${target.cancel.remains.toLocaleString("id-ID")} dari ${target.cancel.quantity.toLocaleString("id-ID")}, jadi ${target.username} menerima ${formatIdr(target.cancel.calculated)}. Masukkan password adminmu untuk konfirmasi.`
            : target ? `${formatIdr(target.amount)} akan dikembalikan ke saldo ${target.username}. Masukkan password adminmu untuk konfirmasi.` : ""
        }
        confirmLabel={target?.reason === "user_cancel" ? "Setujui pembatalan" : "Kembalikan saldo"}
        tone="primary"
        requirePassword
        onConfirm={async (password) => {
          if (dialog?.kind !== "approve") return;
          const payload = { id: dialog.refund.id, action: "setujui" as const, password, ...(override ? { overrideAmount: Number(overrideAmount), overrideReason } : {}) };
          const result = await run(reviewRefund(payload));
          if (result.ok) { setDialog(null); setOverride(false); setOverrideAmount(""); setOverrideReason(""); }
        }}
      >
        <p className="text-[10px] text-[#5B6B8C] dark:text-slate-400">Menyetujui dua kali tidak akan menambah saldo dua kali.</p>
        {target?.reason === "user_cancel" ? (
          <div className="mt-3 space-y-2.5">
            <label className="flex items-center gap-2 text-[10.5px] font-medium text-ink dark:text-white">
              <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} className="h-4 w-4 accent-primary" />
              Ubah nominal (butuh alasan)
            </label>
            {override ? (
              <>
                <TextField label="Nominal (Rp)" inputMode="numeric" value={overrideAmount} onChange={(e) => setOverrideAmount(e.target.value.replace(/\D/g, ""))} />
                <Textarea label="Alasan mengubah nominal" value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} maxLength={300} hint="Minimal 10 karakter. Tercatat di log audit." />
              </>
            ) : null}
          </div>
        ) : null}
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog?.kind === "reject"}
        onClose={() => setDialog(null)}
        title="Tolak refund?"
        description={target ? `Refund ${formatIdr(target.amount)} untuk ${target.username} akan ditolak dan saldo tidak dikembalikan. Pengguna akan diberi tahu.` : ""}
        confirmLabel="Tolak refund"
        onConfirm={async () => {
          if (dialog?.kind !== "reject") return;
          if (rejectReason.trim().length < 3) return;
          const result = await run(reviewRefund({ id: dialog.refund.id, action: "tolak", reason: rejectReason }));
          if (result.ok) setDialog(null);
        }}
      >
        <Textarea label="Alasan penolakan" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} maxLength={300} placeholder="Contoh: pesanan sudah terkirim penuh." />
      </ConfirmDialog>

      <Drawer open={Boolean(detail)} onClose={() => setDetail(null)} title={`Detail refund pesanan ${detail?.orderId ?? ""}`} icon={ReceiptText}>
        {detail ? <RefundDetail row={detail} /> : null}
      </Drawer>

      <ManualRefundDialog key={prefill?.orderId ?? "new"} open={creating} prefill={prefill} onClose={() => { setCreating(false); setPrefill(null); }} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-[#5B6B8C] dark:text-slate-400">{label}</dt>
      <dd className="text-right font-medium text-ink dark:text-white">{value}</dd>
    </div>
  );
}

function FormulaLine({ r }: { r: RefundRow }) {
  const f = refundFormula({ reason: r.reason, amount: r.amount, charge: r.order.charge, quantity: r.order.quantity, remains: r.order.remains, percent: r.cancel?.percent });
  return (
    <span className={`basis-full text-[9.5px] font-medium ${f.matches === false ? "text-amber-600 dark:text-amber-300" : "text-[#5B6B8C] dark:text-slate-400"}`} data-testid="refund-formula">
      {f.text}
      {f.matches === false ? ` Tidak sama dengan refund yang dibuat (${formatIdr(r.amount)}).` : ""}
    </span>
  );
}

function RefundDetail({ row }: { row: RefundRow }) {
  const o = row.order;
  return (
    <div className="space-y-5 text-[10.5px]">
      <dl className="space-y-3">
        <Row label="Pengguna" value={row.username} />
        <Row label="Jumlah refund" value={formatIdr(row.amount)} />
        <Row label="Alasan" value={reasonLabel[row.reason]} />
        <Row label="Sumber" value={sourceLabel[row.source]} />
        {row.cancel ? <Row label="Kebijakan" value={`${row.cancel.percent}% dari bagian yang belum terkirim (usia ${row.cancel.ageHours} jam)`} /> : null}
        <Row label="Dibuat" value={formatDateTime(row.createdAt)} />
        {row.processedAt ? <Row label="Diproses" value={`${formatDateTime(row.processedAt)}${row.processedBy ? ` oleh ${row.processedBy}` : ""}`} /> : null}
        {row.note ? <Row label="Catatan" value={row.note} /> : null}
        {row.rejectReason ? <Row label="Alasan ditolak" value={row.rejectReason} /> : null}
        <div className="flex items-center justify-between gap-3 pt-1">
          <dt className="sr-only">Status</dt>
          <dd className="flex flex-wrap items-center gap-3"><RefundStatusPair orderStatus={o.status} review={row.status} /></dd>
        </div>
      </dl>

      <section aria-label="Pesanan">
        <h3 className="mb-2 text-[10.5px] font-semibold text-ink dark:text-white">Pesanan #{row.orderId}</h3>
        <dl className="space-y-3">
          <Row label="Status pesanan" value={orderStatusLabels[o.status]} />
          <Row label="Status di provider" value={o.providerStatus} />
          <Row label="Biaya (charge)" value={formatIdr(o.charge)} />
          <Row label="Terkirim" value={`${o.delivered.toLocaleString("id-ID")} dari ${o.quantity.toLocaleString("id-ID")}`} />
          <Row label="Sisa" value={o.remains.toLocaleString("id-ID")} />
          <Row label="Refund seharusnya" value={formatIdr(o.expected)} />
          <Row label="Sudah direfund" value={formatIdr(o.refundedAmount)} />
        </dl>
        {o.mismatch ? (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[10px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
            <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            Jumlah yang sudah direfund berbeda dari perhitungan. Periksa sebelum menyetujui.
          </p>
        ) : null}
      </section>

      <section aria-label="Mutasi saldo">
        <h3 className="mb-2 text-[10.5px] font-semibold text-ink dark:text-white">Entri buku besar</h3>
        {row.ledger.length === 0 ? (
          <p className="text-[#5B6B8C] dark:text-slate-400">Belum ada entri. Saldo baru dicatat setelah refund disetujui.</p>
        ) : (
          <ul className="space-y-2">
            {row.ledger.map((l) => (
              <li key={l.id} className="rounded-xl border border-slate-200/70 px-3 py-2 dark:border-slate-800">
                <div className="flex justify-between gap-3 font-medium text-ink dark:text-white">
                  <span>{l.amount > 0 ? "+" : ""}{formatIdr(l.amount)}</span>
                  <time dateTime={l.createdAt}>{formatDateTime(l.createdAt)}</time>
                </div>
                <p className="mt-0.5 text-[#5B6B8C] dark:text-slate-400">Saldo {formatIdr(l.balanceBefore)} menjadi {formatIdr(l.balanceAfter)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ManualRefundDialog({ open, onClose, prefill }: { open: boolean; onClose: () => void; prefill: { orderId: string; amount: number } | null }) {
  const run = useAdminRunner();
  const [orderId, setOrderId] = useState(prefill?.orderId ?? "");
  const [amount, setAmount] = useState(prefill ? String(prefill.amount) : "");
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!orderId.trim()) return setError("ID pesanan wajib diisi.");
    if (!Number(amount) || Number(amount) <= 0) return setError("Nominal harus lebih dari 0.");
    if (reason.trim().length < 10) return setError("Alasan minimal 10 karakter.");
    if (!password) return setError("Password wajib diisi untuk konfirmasi.");
    setError("");
    setBusy(true);
    const result = await run(createRefund({ orderId: orderId.trim(), amount: Number(amount), reason, password }));
    setBusy(false);
    if (result.ok) {
      setOrderId(""); setAmount(""); setReason(""); setPassword("");
      onClose();
    } else {
      setError(result.error);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Buat refund manual" description="Saldo langsung dikembalikan. Nominal tidak boleh melebihi biaya pesanan dikurangi refund sebelumnya.">
      <form onSubmit={submit} className="space-y-3" noValidate>
        <TextField label="ID pesanan" value={orderId} onChange={(e) => setOrderId(e.target.value)} inputMode="numeric" />
        <TextField label="Nominal (Rp)" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} inputMode="numeric" />
        <Textarea label="Alasan" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} hint="Minimal 10 karakter. Tercatat di log audit." />
        <TextField label="Password admin" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" error={error || undefined} />
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" loading={busy}>Kembalikan saldo</Button>
        </div>
      </form>
    </Dialog>
  );
}
