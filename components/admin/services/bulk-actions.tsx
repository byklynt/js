"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { BULK_CONFIRM_WORD } from "@/lib/bulk-services";
import type { BulkServicesCounts } from "@/lib/admin-actions";

export type BulkRequest = {
  active: boolean;
  scope: "ids" | "filter" | "all" | "category" | "platform";
  ids?: string[];
  category?: string;
  platform?: string;
  search?: string;
  thin?: boolean;
};

const n = (x: number) => x.toLocaleString("id-ID");

/** "Aksi massal": the scoped actions (whole catalogue, this category, this platform), each for Aktifkan and Nonaktifkan. */
export function BulkScopeDialog({
  open,
  onClose,
  category,
  platform,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  category: { id: string; label: string } | null;
  platform: { id: string; label: string } | null;
  onPick: (req: BulkRequest) => void;
}) {
  const rows: { label: string; scope: BulkRequest["scope"]; extra: Partial<BulkRequest>; disabled?: boolean }[] = [
    { label: "Semua layanan", scope: "all", extra: {} },
    { label: category ? `Semua di kategori ${category.label}` : "Semua di kategori ini (pilih kategori dulu)", scope: "category", extra: { category: category?.id }, disabled: !category },
    { label: platform ? `Semua di platform ${platform.label}` : "Semua di platform ini (pilih kategori dulu)", scope: "platform", extra: { platform: platform?.id }, disabled: !platform },
  ];
  return (
    <Dialog open={open} onClose={onClose} title="Aksi massal" description="Pilih cakupan, lalu aktifkan atau nonaktifkan. Kamu akan diminta konfirmasi sebelum diterapkan." maxWidth="max-w-md">
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.scope} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200/70 px-3 py-2 dark:border-slate-800">
            <p className="min-w-0 text-[10.5px] font-medium text-ink dark:text-white">{r.label}</p>
            <div className="flex gap-2">
              <Button variant="outline" className="h-8" disabled={r.disabled} onClick={() => onPick({ active: true, scope: r.scope, ...r.extra })}>
                Aktifkan
              </Button>
              <Button variant="outline" className="h-8" disabled={r.disabled} onClick={() => onPick({ active: false, scope: r.scope, ...r.extra })}>
                Nonaktifkan
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

/** Confirmation for a bulk action: the count and the action, the "Perlu dicek" choice when activating, and the typed word for a scoped deactivation. */
export function BulkConfirm({
  pending,
  onClose,
  onConfirm,
}: {
  pending: { req: BulkRequest; counts: BulkServicesCounts; summary: string } | null;
  onClose: () => void;
  onConfirm: (req: BulkRequest, extra: { includeReview: boolean }) => Promise<void>;
}) {
  const [includeReview, setIncludeReview] = useState(false);
  if (!pending) return null;
  const { req, counts, summary } = pending;
  const verb = req.active ? "diaktifkan" : "dinonaktifkan";
  const needsWord = !req.active && req.scope !== "ids" && req.scope !== "filter";
  const total = counts.changed + (includeReview ? counts.skippedReview : 0);
  return (
    <ConfirmDialog
      open
      onClose={onClose}
      title={`${req.active ? "Aktifkan" : "Nonaktifkan"} ${n(total)} layanan?`}
      description={`${n(total)} layanan akan ${verb} (${summary}).${counts.unchanged > 0 ? ` ${n(counts.unchanged)} sudah ${req.active ? "aktif" : "nonaktif"} dan tidak diubah.` : ""} Pesanan, refund, dan sinkronisasi yang sudah ada tidak terpengaruh.`}
      confirmLabel={req.active ? "Aktifkan" : "Nonaktifkan"}
      tone={req.active ? "primary" : "danger"}
      requireText={needsWord ? BULK_CONFIRM_WORD : undefined}
      onConfirm={async () => {
        await onConfirm(req, { includeReview: req.active && includeReview });
      }}
    >
      {req.active && counts.skippedReview > 0 ? (
        <label className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-[10.5px] text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
          <input type="checkbox" checked={includeReview} onChange={(e) => setIncludeReview(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
          <span>
            <span className="font-semibold">{n(counts.skippedReview)} layanan Perlu dicek akan dilewati.</span> Centang untuk mengaktifkannya juga (harga sangat tinggi atau nama / kategori terlalu pendek).
          </span>
        </label>
      ) : null}
    </ConfirmDialog>
  );
}
