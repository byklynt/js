"use client";

import { useMemo, useState } from "react";
import { Check, Eye, RefreshCw, WalletCards, X } from "lucide-react";
import type { AdminDeposit, DepositStatus } from "@/lib/admin-data";
import { cancelDepositGateway, checkDepositWithPaymenku, confirmDeposit, rejectDeposit } from "@/lib/admin-actions";
import { formatDateTime, formatIdr } from "@/lib/balance";
import { PageHeader } from "@/components/shell/page-header";
import { DataToolbar } from "@/components/ui/data-toolbar";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ActionMenu } from "@/components/ui/action-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { ListSkeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/ui/pagination";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useListState, useParamFilter } from "@/lib/use-list-state";
import { useAdminRunner } from "../use-admin-runner";
import { DepositStatusChip } from "../admin-chips";

type Filter = DepositStatus | "semua" | "perlu_dicek";
const filters: { id: Filter; label: string }[] = [
  { id: "semua", label: "Semua" },
  { id: "menunggu", label: "Menunggu" },
  { id: "berhasil", label: "Berhasil" },
  { id: "gagal", label: "Gagal" },
  { id: "kedaluwarsa", label: "Kedaluwarsa" },
  { id: "dibatalkan", label: "Dibatalkan" },
  { id: "perlu_dicek", label: "Perlu dicek" },
];

type Dialogs =
  | { kind: "detail"; deposit: AdminDeposit }
  | { kind: "cancel"; deposit: AdminDeposit }
  | { kind: "confirm"; deposit: AdminDeposit }
  | { kind: "reject"; deposit: AdminDeposit };

function RejectDialog({ deposit, onClose, onSubmit }: { deposit: AdminDeposit | null; onClose: () => void; onSubmit: (reason: string) => Promise<boolean> }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={Boolean(deposit)} onClose={onClose} title={`Tolak deposit #${deposit?.id ?? ""}`} description="Alasan akan tercatat di log aktivitas." maxWidth="max-w-sm">
      <form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          if (reason.trim().length < 3) { setError("Alasan minimal 3 karakter."); return; }
          setError("");
          setBusy(true);
          const ok = await onSubmit(reason);
          setBusy(false);
          if (ok) setReason("");
        }}
        className="space-y-4"
      >
        <Textarea label="Alasan penolakan" value={reason} onChange={(e) => setReason(e.target.value)} error={error} className="min-h-[72px]" />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" variant="danger" loading={busy}>Tolak deposit</Button>
        </div>
      </form>
    </Dialog>
  );
}

function DepositDetail({ deposit: d, onClose }: { deposit: AdminDeposit | null; onClose: () => void }) {
  const row = (k: string, v: React.ReactNode) => (
    <div className="flex justify-between gap-3 border-b border-slate-200/60 py-1.5 last:border-0 dark:border-slate-800">
      <dt className="text-[#5B6B8C] dark:text-slate-400">{k}</dt>
      <dd className="min-w-0 break-all text-right font-medium text-ink dark:text-white">{v}</dd>
    </div>
  );
  return (
    <Dialog open={Boolean(d)} onClose={onClose} title={`Deposit #${d?.id.slice(0, 8) ?? ""}`} description="Status dan data dari Paymenku." maxWidth="max-w-lg">
      {d ? (
        <div data-testid="deposit-detail">
          <dl className="text-[10px]">
            {row("Pengguna", d.username)}
            {row("Status kami", <DepositStatusChip status={d.status} />)}
            {row("Status Paymenku", d.gatewayStatus ?? "-")}
            {row("Mode", d.isSandbox ? "SANDBOX (tanpa uang nyata)" : "Live")}
            {row("Kanal", `${d.method} (${d.channelCode ?? "-"})`)}
            {row("ID transaksi (trx_id)", d.externalId ?? "-")}
            {row("Saldo yang masuk", formatIdr(d.amount))}
            {row("Dibayar pelanggan", d.payAmount ? formatIdr(d.payAmount) : "-")}
            {row("Biaya", d.feePassthrough ? `${formatIdr(d.feeAmount ?? 0)} (diteruskan ke pelanggan)` : formatIdr(d.feeAmount ?? 0))}
            {row("Dibuat", formatDateTime(d.createdAt))}
            {row("Kedaluwarsa", d.expiresAt ? formatDateTime(d.expiresAt) : "-")}
            {row("Dibayar", d.paidAt ? formatDateTime(d.paidAt) : "-")}
            {d.needsReview ? row("Perlu dicek", d.reviewReason ?? "Ya") : null}
          </dl>
          <p className="mt-3 text-[10px] font-semibold text-ink dark:text-white">Data pembayaran (sudah disaring)</p>
          <pre className="thin-scroll mt-1 max-h-48 overflow-auto rounded-xl bg-[#F1F6FB] p-3 text-[9.5px] dark:bg-[#161b20]">{JSON.stringify(d.paymentInfo ?? {}, null, 2)}</pre>
        </div>
      ) : null}
    </Dialog>
  );
}

export function DepositsView({ deposits }: { deposits: AdminDeposit[] }) {
  const run = useAdminRunner();
  const list = useListState<Filter>(useParamFilter<Filter>(filters.map((f) => f.id), "semua"));
  const [dialog, setDialog] = useState<Dialogs | null>(null);

  const filtered = useMemo(
    () =>
      deposits.filter((d) => {
        if (list.filter === "perlu_dicek" ? !d.needsReview : list.filter !== "semua" && d.status !== list.filter) return false;
        if (!list.debounced) return true;
        return (
          d.id.includes(list.debounced) || d.username.toLowerCase().includes(list.debounced) || d.method.toLowerCase().includes(list.debounced) ||
          (d.externalId ?? "").toLowerCase().includes(list.debounced) || String(d.amount) === list.debounced.replace(/[^0-9]/g, "")
        );
      }),
    [deposits, list.filter, list.debounced]
  );
  const shown = filtered.slice(0, list.visible);

  function menuFor(d: AdminDeposit) {
    const pending = d.status === "menunggu";
    // Paymenku deposits are never confirmed by hand: only a status Paymenku itself reports can credit them
    const items = d.gateway
      ? [
          { label: "Detail", icon: Eye, onSelect: () => setDialog({ kind: "detail", deposit: d }) },
          { label: "Cek status ke Paymenku", icon: RefreshCw, disabled: d.status === "gagal", onSelect: () => void run(checkDepositWithPaymenku({ id: d.id })) },
          { label: "Batalkan", icon: X, tone: "danger" as const, disabled: !pending, onSelect: () => setDialog({ kind: "cancel", deposit: d }) },
        ]
      : [
          { label: "Konfirmasi manual", icon: Check, disabled: !pending, onSelect: () => setDialog({ kind: "confirm", deposit: d }) },
          { label: "Tolak", icon: X, tone: "danger" as const, disabled: !pending, onSelect: () => setDialog({ kind: "reject", deposit: d }) },
        ];
    return <ActionMenu label={`Aksi untuk deposit ${d.id}`} items={items} />;
  }

  const columns: Column<AdminDeposit>[] = [
    {
      key: "id",
      header: "ID",
      cell: (d) => (
        <span className="font-semibold text-primary-accent">
          #{d.id.slice(0, 8)}
          {d.needsReview ? <span data-testid="review-flag" className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-[9px] font-semibold text-red-600 dark:bg-red-500/15 dark:text-red-300">Perlu dicek</span> : null}
          {d.gateway && d.isSandbox ? <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">Sandbox</span> : null}
        </span>
      ),
    },
    { key: "user", header: "Pengguna", cell: (d) => d.username },
    { key: "method", header: "Metode", cell: (d) => d.method, hideBelowLg: true },
    { key: "amount", header: "Jumlah", cell: (d) => <span className="font-semibold">{formatIdr(d.amount)}</span>, className: "whitespace-nowrap" },
    { key: "pay", header: "Dibayar", cell: (d) => (d.gateway && d.payAmount ? formatIdr(d.payAmount) : "-"), className: "whitespace-nowrap", hideBelowLg: true },
    { key: "fee", header: "Biaya", cell: (d) => (d.gateway ? formatIdr(d.feeAmount ?? 0) : "-"), className: "whitespace-nowrap", hideBelowLg: true },
    { key: "status", header: "Status", cell: (d) => <DepositStatusChip status={d.status} /> },
    { key: "date", header: "Tanggal", cell: (d) => <time dateTime={d.createdAt}>{formatDateTime(d.createdAt)}</time>, className: "whitespace-nowrap", hideBelowLg: true },
    { key: "actions", header: "Aksi", cell: menuFor, className: "w-16 text-right" },
  ];

  return (
    <div>
      <PageHeader title="Deposit" subtitle="Konfirmasi dan pantau deposit pengguna." />
      <DataToolbar
        filter={{ options: filters, value: list.filter, onChange: list.setFilter, ariaLabel: "Filter status deposit" }}
        query={list.query}
        onQueryChange={list.setQuery}
        searchLabel="Cari deposit berdasarkan ID, pengguna, atau metode"
      />
      <section aria-label="Daftar deposit" className="mt-5">
        {list.loading ? (
          <ListSkeleton label="Memuat deposit" />
        ) : filtered.length === 0 ? (
          <EmptyState icon={WalletCards} title="Deposit tidak ditemukan" />
        ) : (
          <>
            <DataTable
              ariaLabel="Tabel deposit"
              columns={columns}
              rows={shown}
              rowKey={(d) => d.id}
              mobileCard={(d) => (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold text-ink dark:text-white">
                      <span className="text-primary-accent">#{d.id}</span> - {d.username}
                    </p>
                    {menuFor(d)}
                  </div>
                  <p className="text-[10px] text-[#5B6B8C] dark:text-slate-400">
                    {d.method} - <span className="font-semibold text-ink dark:text-white">{formatIdr(d.amount)}</span>
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <DepositStatusChip status={d.status} />
                    <time dateTime={d.createdAt} className="text-[9.5px] text-[#5B6B8C] dark:text-slate-400">{formatDateTime(d.createdAt)}</time>
                  </div>
                </div>
              )}
            />
            <Pagination total={filtered.length} visible={list.visible} onMore={list.showMore} />
          </>
        )}
      </section>

      <DepositDetail deposit={dialog?.kind === "detail" ? dialog.deposit : null} onClose={() => setDialog(null)} />
      <ConfirmDialog
        open={dialog?.kind === "cancel"}
        onClose={() => setDialog(null)}
        title="Batalkan deposit Paymenku?"
        description="Deposit ditutup. Bila pelanggan sudah membayar, saldo tetap masuk setelah pembayaran terkonfirmasi di Paymenku (dikreditkan satu kali dan ditandai Perlu dicek)."
        confirmLabel="Batalkan deposit"
        tone="danger"
        onConfirm={async () => {
          if (dialog?.kind !== "cancel") return;
          const result = await run(cancelDepositGateway({ id: dialog.deposit.id }));
          if (result.ok) setDialog(null);
          return result.ok;
        }}
      />
      <ConfirmDialog
        open={dialog?.kind === "confirm"}
        onClose={() => setDialog(null)}
        title={`Konfirmasi deposit #${dialog?.kind === "confirm" ? dialog.deposit.id : ""}?`}
        description={dialog?.kind === "confirm" ? `Saldo ${dialog.deposit.username} akan bertambah ${formatIdr(dialog.deposit.amount)}. Masukkan password adminmu.` : ""}
        confirmLabel="Konfirmasi deposit"
        tone="primary"
        requirePassword
        onConfirm={async (password) => {
          if (dialog?.kind !== "confirm") return;
          const result = await run(confirmDeposit({ id: dialog.deposit.id, password }));
          if (result.ok) setDialog(null);
        }}
      />
      <RejectDialog
        key={dialog?.kind === "reject" ? dialog.deposit.id : "reject-closed"}
        deposit={dialog?.kind === "reject" ? dialog.deposit : null}
        onClose={() => setDialog(null)}
        onSubmit={async (reason) => {
          if (dialog?.kind !== "reject") return false;
          const result = await run(rejectDeposit({ id: dialog.deposit.id, reason }));
          if (result.ok) setDialog(null);
          return result.ok;
        }}
      />
    </div>
  );
}
