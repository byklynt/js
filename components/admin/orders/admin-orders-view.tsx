"use client";

import { useMemo, useState } from "react";
import { Ban, Gauge, ListOrdered, RefreshCcw, RotateCw, Server, TriangleAlert, Undo2, User } from "lucide-react";
import { orderStatusFilters, orderStatusLabels, type OrderStatus } from "@/lib/orders-data";
import type { AdminOrder } from "@/lib/admin-data";
import {
  bulkUpdateOrderStatus,
  cancelOrder,
  releaseHeldOrder,
  cancelOrderViolation,
  syncOrderNowAction,
  resendOrder,
  resolveOrderManualCheck,
  setOrderCounts,
  updateOrderStatus,
} from "@/lib/admin-actions";
import { formatDateTime, formatIdr } from "@/lib/balance";
import { PageHeader } from "@/components/shell/page-header";
import { DataToolbar } from "@/components/ui/data-toolbar";
import { RecordCard } from "@/components/ui/record-card";
import { InfoChip } from "@/components/ui/info-chip";
import { ActionMenu } from "@/components/ui/action-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { RowsSkeleton } from "@/components/ui/list-states";
import { Pagination } from "@/components/ui/pagination";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { VIOLATION_REASONS } from "@/lib/account-status";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PasswordField, TextField } from "@/components/ui/text-field";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { OrderChips } from "@/components/orders/order-chips";
import { OrderStatusChip } from "@/components/orders/order-status-chip";
import { PackageSearch } from "lucide-react";
import { useListState, useParamFilter } from "@/lib/use-list-state";
import { cn } from "@/lib/utils";
import { useAdminRunner } from "../use-admin-runner";
import { OrderComments } from "@/components/orders/order-comments";
import { loadOrderCommentsAction } from "@/lib/admin-list-actions";

type Filter = OrderStatus | "semua" | "macet";

const filterOptions: { id: Filter; label: string }[] = [...orderStatusFilters, { id: "macet", label: "Macet" }];
type Dialogs =
  | { kind: "status"; order: AdminOrder }
  | { kind: "counts"; order: AdminOrder }
  | { kind: "cancel"; order: AdminOrder }
  | { kind: "violation"; order: AdminOrder }
  | { kind: "check"; order: AdminOrder };

const statusOptions = orderStatusFilters.filter((f) => f.id !== "semua") as { id: OrderStatus; label: string }[];

/** An order whose submit to the provider ended in an unknown state: look at the provider panel, then decide. */
function ManualCheckDialog({ order, onClose, onSave }: { order: AdminOrder | null; onClose: () => void; onSave: (outcome: "refund" | "sent", providerOrderId: string, password: string) => Promise<string | null> }) {
  const [outcome, setOutcome] = useState<"refund" | "sent">("refund");
  const [providerOrderId, setProviderOrderId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const err = await onSave(outcome, providerOrderId, password);
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <Dialog
      open={Boolean(order)}
      onClose={onClose}
      title={`Cek manual pesanan #${order?.id ?? ""}`}
      description="Pengiriman ke provider tidak jelas hasilnya (timeout atau error server). Buka panel provider dan cari pesanan dengan link yang sama, lalu pilih hasilnya."
      maxWidth="max-w-md"
    >
      <form noValidate onSubmit={submit} className="space-y-3.5">
        <SegmentedControl<"refund" | "sent">
          items={[{ value: "refund", label: "Tidak ada di provider" }, { value: "sent", label: "Ada di provider" }]}
          value={outcome}
          onChange={setOutcome}
          ariaLabel="Hasil pengecekan"
        />
        {outcome === "sent" ? (
          <TextField label="ID pesanan di provider" value={providerOrderId} onChange={(e) => setProviderOrderId(e.target.value)} hint="Status akan disinkronkan otomatis setelah ini." />
        ) : (
          <p className="text-[10px] text-[#5B6B8C] dark:text-slate-400">Saldo pengguna dikembalikan penuh{order ? ` (${formatIdr(order.charge)})` : ""}.</p>
        )}
        <PasswordField label="Password admin" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error ? <p role="alert" className="text-[9.5px] font-medium text-red-500">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" loading={busy}>Simpan</Button>
        </div>
      </form>
    </Dialog>
  );
}

function StatusDialog({
  order,
  onClose,
  onSave,
}: {
  order: AdminOrder | null;
  onClose: () => void;
  onSave: (status: OrderStatus) => Promise<boolean>;
}) {
  const [picked, setPicked] = useState<OrderStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const value = picked ?? order?.status ?? "menunggu";

  return (
    <Dialog
      open={Boolean(order)}
      onClose={onClose}
      title={`Ubah status #${order?.id ?? ""}`}
      description="Pilih status baru untuk pesanan ini."
      maxWidth="max-w-sm"
    >
      <div role="radiogroup" aria-label="Status pesanan" className="grid grid-cols-2 gap-2">
        {statusOptions.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={value === o.id}
            onClick={() => setPicked(o.id)}
            className={cn(
              "h-9 rounded-xl border text-[10px] font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
              value === o.id
                ? "border-primary-300 bg-primary-50 text-primary-accent dark:border-primary-border dark:bg-primary-soft"
                : "border-slate-200 text-ink hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Batal
        </Button>
        <Button
          loading={busy}
          onClick={async () => {
            setBusy(true);
            const ok = await onSave(value);
            setBusy(false);
            if (ok) setPicked(null);
          }}
        >
          Simpan
        </Button>
      </div>
    </Dialog>
  );
}

function CountsDialog({
  order,
  onClose,
  onSave,
}: {
  order: AdminOrder | null;
  onClose: () => void;
  onSave: (startCount: number, remains: number) => Promise<boolean>;
}) {
  const [start, setStart] = useState<string | null>(null);
  const [remains, setRemains] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const startValue = start ?? String(order?.startCount ?? 0);
  const remainsValue = remains ?? String(order?.remains ?? 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const s = Number(startValue);
    const r = Number(remainsValue);
    if (!Number.isInteger(s) || s < 0 || !Number.isInteger(r) || r < 0) {
      setError("Isi dengan angka bulat 0 atau lebih.");
      return;
    }
    if (order && r > order.quantity) {
      setError("Sisa tidak boleh melebihi jumlah pesanan.");
      return;
    }
    setError("");
    setBusy(true);
    const ok = await onSave(s, r);
    setBusy(false);
    if (ok) {
      setStart(null);
      setRemains(null);
    }
  }

  return (
    <Dialog open={Boolean(order)} onClose={onClose} title={`Awal dan sisa #${order?.id ?? ""}`} maxWidth="max-w-sm">
      <form noValidate onSubmit={submit} className="space-y-4">
        <TextField label="Awal (start count)" inputMode="numeric" value={startValue} onChange={(e) => setStart(e.target.value)} />
        <TextField
          label="Sisa (remains)"
          inputMode="numeric"
          value={remainsValue}
          onChange={(e) => setRemains(e.target.value)}
          error={error}
          hint={order ? `Jumlah pesanan ${order.quantity.toLocaleString("id-ID")}.` : undefined}
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" loading={busy}>
            Simpan
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function AdminOrdersView({ orders, stuckIds = [], sync }: { orders: AdminOrder[]; stuckIds?: string[]; sync?: { lastSuccessAt: string | null; stalled: boolean } }) {
  const run = useAdminRunner();
  const initial = useParamFilter<Filter>(filterOptions.map((f) => f.id), "semua");
  const list = useListState<Filter>(initial);
  const stuck = useMemo(() => new Set(stuckIds), [stuckIds]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkStatus, setBulkStatus] = useState<OrderStatus>("selesai");
  const [dialog, setDialog] = useState<Dialogs | null>(null);
  const [violationReason, setViolationReason] = useState("");
  const [violationNote, setViolationNote] = useState("");

  const filtered = useMemo(
    () =>
      orders.filter((o) => {
        if (list.filter === "macet") {
          if (!stuck.has(o.id)) return false;
        } else if (list.filter !== "semua" && o.status !== list.filter) return false;
        if (!list.debounced) return true;
        const q = list.debounced;
        return (
          o.id.includes(q) ||
          o.link.toLowerCase().includes(q) ||
          o.username.toLowerCase().includes(q) ||
          o.providerOrderId.toLowerCase().includes(q) ||
          o.name.toLowerCase().includes(q)
        );
      }),
    [orders, list.filter, list.debounced, stuck]
  );
  const shown = filtered.slice(0, list.visible);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      <PageHeader title="Pesanan" subtitle="Pantau dan tangani pesanan pengguna." />
      {sync ? (
        <p className="-mt-2 mb-3 flex flex-wrap items-center gap-2 text-[11px] text-[#5B6B8C] dark:text-slate-400" data-testid="sync-indicator">
          <span>
            Sinkronisasi terakhir:{" "}
            {sync.lastSuccessAt ? <time dateTime={sync.lastSuccessAt}>{formatDateTime(sync.lastSuccessAt)}</time> : "belum pernah berhasil"}
          </span>
          {sync.stalled ? <span className="inline-flex h-6 items-center rounded-full bg-red-50 px-2.5 text-[10px] font-medium text-red-500 dark:bg-red-500/15 dark:text-red-300">Sinkronisasi terhenti</span> : null}
        </p>
      ) : null}

      <DataToolbar
        filter={{ options: filterOptions, value: list.filter, onChange: list.setFilter, ariaLabel: "Filter status pesanan" }}
        query={list.query}
        onQueryChange={list.setQuery}
        searchLabel="Cari pesanan berdasarkan ID, link, pengguna, atau ID pesanan provider"
      />

      <section aria-label="Daftar pesanan" className="mt-5">
        {list.loading ? (
          <RowsSkeleton label="Memuat pesanan" tall />
        ) : filtered.length === 0 ? (
          <EmptyState icon={PackageSearch} title="Pesanan tidak ditemukan" />
        ) : (
          <>
            <ul className="space-y-3">
              {shown.map((order, i) => (
                <RecordCard
                  key={order.id}
                  index={i}
                  platform={order.platform}
                  idLabel={`ID: ${order.id}`}
                  checkboxLabel={`Pilih pesanan ${order.id}`}
                  selected={selected.has(order.id)}
                  onToggleSelect={() => toggle(order.id)}
                  name={order.name}
                  dateIso={order.createdAt}
                  status={<OrderStatusChip status={order.status} />}
                  actions={
                    <ActionMenu
                      label={`Aksi untuk pesanan ${order.id}`}
                      items={[
                        ...(order.held ? [{ label: "Setujui dan kirim", icon: RefreshCcw, onSelect: () => void run(releaseHeldOrder({ orderId: order.id })) }] : []),
                        ...(order.providerOrderId ? [{ label: "Sinkronkan sekarang", icon: RefreshCcw, onSelect: () => void run(syncOrderNowAction({ orderId: order.id })) }] : []),
                        { label: "Ubah status", icon: ListOrdered, onSelect: () => setDialog({ kind: "status", order }) },
                        { label: "Atur awal dan sisa", icon: Gauge, onSelect: () => setDialog({ kind: "counts", order }) },
                        ...(order.needsManualCheck ? [{ label: "Cek manual di provider", icon: TriangleAlert, onSelect: () => setDialog({ kind: "check", order }) }] : []),
                        {
                          label: "Kirim ulang ke provider",
                          icon: RefreshCcw,
                          disabled: order.status !== "gagal_kirim",
                          onSelect: () => void run(resendOrder({ orderId: order.id })),
                        },
                        {
                          label: "Batalkan tanpa refund (pelanggaran)",
                          icon: Ban,
                          tone: "danger" as const,
                          disabled: !["menunggu", "diproses", "berjalan"].includes(order.status),
                          onSelect: () => setDialog({ kind: "violation", order }),
                        },
                        {
                          label: "Batalkan dan refund",
                          icon: Ban,
                          tone: "danger",
                          disabled: order.status === "dibatalkan" || order.status === "selesai" || order.status === "gagal_kirim" || order.status === "sebagian",
                          onSelect: () => setDialog({ kind: "cancel", order }),
                        },
                      ]}
                    />
                  }
                >
                  <OrderChips order={order} />
                  <InfoChip icon={User}>Pengguna: {order.username}</InfoChip>
                  <InfoChip icon={Server}>Provider: {order.providerId.replace("prv_", "#")}</InfoChip>
                  <InfoChip icon={RotateCw}>ID provider: {order.providerOrderId || "-"}</InfoChip>
                  {order.violationReason ? <InfoChip icon={Ban}>Dibatalkan karena pelanggaran: {order.violationReason}</InfoChip> : null}
                  {order.refundedAmount > 0 ? <InfoChip icon={Undo2}>Refund: {formatIdr(order.refundedAmount)}</InfoChip> : null}
                  {stuck.has(order.id) ? <InfoChip icon={TriangleAlert}>Macet</InfoChip> : null}
                  {order.commentCount ? <OrderComments orderId={order.id} count={order.commentCount} load={loadOrderCommentsAction} /> : null}
                  {order.held ? <InfoChip icon={TriangleAlert}>Menunggu persetujuan</InfoChip> : null}
                  {order.needsManualCheck ? <InfoChip icon={TriangleAlert}>Perlu dicek manual</InfoChip> : null}
                </RecordCard>
              ))}
            </ul>
            <Pagination total={filtered.length} visible={list.visible} onMore={list.showMore} />
          </>
        )}
      </section>

      {selected.size > 0 ? (
        <div
          role="region"
          aria-label="Aksi pesanan terpilih"
          className="sticky bottom-4 z-20 mx-auto mt-5 flex w-fit max-w-full flex-wrap items-center gap-2 rounded-2xl border border-slate-200/70 bg-white p-2 pl-4 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          <span className="text-[10.5px] font-semibold text-ink dark:text-white">{selected.size} dipilih</span>
          <label htmlFor="bulk-status" className="sr-only">
            Status massal
          </label>
          <select
            id="bulk-status"
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value as OrderStatus)}
            className="h-8 rounded-full border border-slate-200 bg-white px-3 text-[10px] font-medium text-ink outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          >
            {statusOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {orderStatusLabels[o.id]}
              </option>
            ))}
          </select>
          <Button
            className="h-8 rounded-full px-4"
            onClick={async () => {
              const result = await run(bulkUpdateOrderStatus({ orderIds: Array.from(selected), status: bulkStatus }));
              if (result.ok) setSelected(new Set());
            }}
          >
            Terapkan
          </Button>
          <Button variant="outline" className="h-8 rounded-full px-4" onClick={() => setSelected(new Set())}>
            Batal pilih
          </Button>
        </div>
      ) : null}

      <StatusDialog
        key={dialog?.kind === "status" ? dialog.order.id : "status-closed"}
        order={dialog?.kind === "status" ? dialog.order : null}
        onClose={() => setDialog(null)}
        onSave={async (status) => {
          if (dialog?.kind !== "status") return false;
          const result = await run(updateOrderStatus({ orderId: dialog.order.id, status }));
          if (result.ok) setDialog(null);
          return result.ok;
        }}
      />
      <CountsDialog
        key={dialog?.kind === "counts" ? dialog.order.id : "counts-closed"}
        order={dialog?.kind === "counts" ? dialog.order : null}
        onClose={() => setDialog(null)}
        onSave={async (startCount, remains) => {
          if (dialog?.kind !== "counts") return false;
          const result = await run(setOrderCounts({ orderId: dialog.order.id, startCount, remains }));
          if (result.ok) setDialog(null);
          return result.ok;
        }}
      />
      <ManualCheckDialog
        key={dialog?.kind === "check" ? dialog.order.id : "check-closed"}
        order={dialog?.kind === "check" ? dialog.order : null}
        onClose={() => setDialog(null)}
        onSave={async (outcome, providerOrderId, password) => {
          if (dialog?.kind !== "check") return "Pilih pesanan lagi.";
          const result = await run(resolveOrderManualCheck({ orderId: dialog.order.id, outcome, providerOrderId, password }));
          if (result.ok) {
            setDialog(null);
            return null;
          }
          return result.error;
        }}
      />
      <ConfirmDialog
        open={dialog?.kind === "violation"}
        onClose={() => setDialog(null)}
        title={`Batalkan pesanan #${dialog?.kind === "violation" ? dialog.order.id : ""} tanpa refund?`}
        description={
          dialog?.kind === "violation"
            ? `Pesanan dibatalkan karena melanggar ketentuan layanan. ${formatIdr(dialog.order.charge)} milik ${dialog.order.username} TIDAK dikembalikan. Pengguna diberi tahu dengan pesan umum dan tindakan ini dicatat di log audit.`
            : ""
        }
        confirmLabel="Batalkan tanpa refund"
        requireText="BATAL"
        requirePassword
        onConfirm={async (password) => {
          if (dialog?.kind !== "violation") return;
          const result = await run(cancelOrderViolation({ orderId: dialog.order.id, reason: violationReason || undefined, note: violationNote.trim() || undefined, password }));
          if (result.ok) {
            setDialog(null);
            setViolationReason("");
            setViolationNote("");
          }
          return result.ok; // false keeps the typed BATAL, the password and the reason
        }}
      >
        <div className="space-y-3">
          <label className="block text-[11px] font-medium text-ink dark:text-slate-100">
            Alasan pembatalan
            <select
              value={violationReason}
              onChange={(e) => setViolationReason(e.target.value)}
              className="mt-1 block h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[12px] text-ink dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">Pilih alasan</option>
              {VIOLATION_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[11px] font-medium text-ink dark:text-slate-100">
            Catatan (opsional)
            <textarea
              value={violationNote}
              onChange={(e) => setViolationNote(e.target.value)}
              maxLength={300}
              rows={2}
              className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12px] text-ink dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
        </div>
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog?.kind === "cancel"}
        onClose={() => setDialog(null)}
        title={`Batalkan pesanan #${dialog?.kind === "cancel" ? dialog.order.id : ""}?`}
        description={
          dialog?.kind === "cancel"
            ? `Pesanan dibatalkan dan ${formatIdr(dialog.order.charge)} dikembalikan ke saldo ${dialog.order.username}. Masukkan password adminmu untuk konfirmasi.`
            : ""
        }
        confirmLabel="Batalkan dan refund"
        requirePassword
        onConfirm={async (password) => {
          if (dialog?.kind !== "cancel") return;
          const result = await run(cancelOrder({ orderId: dialog.order.id, password }));
          if (result.ok) setDialog(null);
        }}
      />
    </div>
  );
}
