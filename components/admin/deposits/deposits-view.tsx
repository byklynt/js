"use client";

import { useMemo, useState } from "react";
import { Check, Eye, WalletCards, X } from "lucide-react";
import type { AdminDeposit, DepositStatus } from "@/lib/admin-data";
import { confirmDeposit, rejectDeposit } from "@/lib/admin-actions";
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

type Filter = DepositStatus | "semua";
const filters: { id: Filter; label: string }[] = [
  { id: "semua", label: "Semua" },
  { id: "menunggu", label: "Menunggu" },
  { id: "berhasil", label: "Berhasil" },
  { id: "gagal", label: "Gagal" },
  { id: "kedaluwarsa", label: "Kedaluwarsa" },
];

type Dialogs =
  | { kind: "confirm"; deposit: AdminDeposit }
  | { kind: "reject"; deposit: AdminDeposit }
  | { kind: "proof"; deposit: AdminDeposit };

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

export function DepositsView({ deposits }: { deposits: AdminDeposit[] }) {
  const run = useAdminRunner();
  const list = useListState<Filter>(useParamFilter<Filter>(filters.map((f) => f.id), "semua"));
  const [dialog, setDialog] = useState<Dialogs | null>(null);

  const filtered = useMemo(
    () =>
      deposits.filter((d) => {
        if (list.filter !== "semua" && d.status !== list.filter) return false;
        if (!list.debounced) return true;
        return d.id.includes(list.debounced) || d.username.toLowerCase().includes(list.debounced) || d.method.toLowerCase().includes(list.debounced);
      }),
    [deposits, list.filter, list.debounced]
  );
  const shown = filtered.slice(0, list.visible);

  function menuFor(d: AdminDeposit) {
    const pending = d.status === "menunggu";
    return (
      <ActionMenu
        label={`Aksi untuk deposit ${d.id}`}
        items={[
          { label: "Konfirmasi manual", icon: Check, disabled: !pending, onSelect: () => setDialog({ kind: "confirm", deposit: d }) },
          { label: "Tolak", icon: X, tone: "danger", disabled: !pending, onSelect: () => setDialog({ kind: "reject", deposit: d }) },
          { label: "Lihat bukti", icon: Eye, onSelect: () => setDialog({ kind: "proof", deposit: d }) },
        ]}
      />
    );
  }

  const columns: Column<AdminDeposit>[] = [
    { key: "id", header: "ID", cell: (d) => <span className="font-semibold text-primary-accent">#{d.id}</span> },
    { key: "user", header: "Pengguna", cell: (d) => d.username },
    { key: "method", header: "Metode", cell: (d) => d.method, hideBelowLg: true },
    { key: "amount", header: "Jumlah", cell: (d) => <span className="font-semibold">{formatIdr(d.amount)}</span>, className: "whitespace-nowrap" },
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
      <Dialog
        open={dialog?.kind === "proof"}
        onClose={() => setDialog(null)}
        title={`Bukti deposit #${dialog?.kind === "proof" ? dialog.deposit.id : ""}`}
        description="Pratinjau bukti pembayaran (contoh). Berkas asli akan dimuat dari penyimpanan aman."
        maxWidth="max-w-sm"
      >
        <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 text-center dark:border-slate-600">
          <WalletCards className="h-6 w-6 text-primary-accent" aria-hidden />
          <p className="text-[10.5px] font-medium text-ink dark:text-white">{dialog?.kind === "proof" ? dialog.deposit.proof : ""}</p>
          <p className="text-[9.5px] text-[#5B6B8C] dark:text-slate-400">Tidak ada gambar yang dimuat di versi contoh.</p>
        </div>
      </Dialog>
    </div>
  );
}
