"use client";

import { useState } from "react";
import Link from "next/link";
import { applyProviderSync, bulkMarkup, previewProviderSync } from "@/lib/admin-actions";
import type { MarkupType } from "@/lib/admin-data";
import { formatIdr } from "@/lib/balance";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { TextField } from "@/components/ui/text-field";
import { StatusChip, type ChipTone } from "@/components/ui/status-chip";
import { useToast } from "@/components/shared/toast";
import { useAdminRunner } from "../use-admin-runner";
import type { SyncChange, SyncPreview } from "@/lib/server/providers/catalog";
import { ReviewBadge } from "./review-badge";

type Change = SyncChange;

const kindLabel: Record<Change["kind"], string> = { naik: "Harga naik", turun: "Harga turun", baru: "Layanan baru", dihapus: "Dinonaktifkan" };
const kindTone: Record<Change["kind"], ChipTone> = { naik: "red", turun: "emerald", baru: "sky", dihapus: "slate" };
/** A real catalogue has thousands of services: only the first rows are drawn, everything is still applied. */
const MAX_ROWS = 200;
const kindOrder: Change["kind"][] = ["baru", "naik", "turun", "dihapus"];

/** Preview of what the provider changed (from the real adapter); applying needs a password re-entry. */
export function SyncModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const run = useAdminRunner();
  const toast = useToast();
  const [preview, setPreview] = useState<SyncPreview | null>(null);
  const [mode, setMode] = useState<"mock" | "live" | "off">("live");
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function load() {
    setLoading(true);
    const result = await previewProviderSync();
    setLoading(false);
    if (result.ok) {
      const data = result.data as { preview: SyncPreview; mode: "mock" | "live" | "off" };
      setPreview(data.preview);
      setMode(data.mode);
    } else toast(result.error, "error");
  }

  function close() {
    setPreview(null);
    setConfirming(false);
    onClose();
  }

  const changes = preview?.changes ?? [];
  const grouped = kindOrder.map((k) => ({ kind: k, items: changes.filter((c) => c.kind === k) })).filter((g) => g.items.length > 0);

  return (
    <>
      <Dialog
        open={open && !confirming}
        onClose={close}
        title="Sinkronkan dari provider"
        description="Lihat perubahan dari Likeo sebelum diterapkan. Hanya layanan bertipe Default yang diimpor; layanan dihapus provider dinonaktifkan, tidak dihapus."
        maxWidth="max-w-2xl"
      >
        {preview === null ? (
          <Button loading={loading} onClick={load}>
            Cek perubahan
          </Button>
        ) : (
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-[9.5px] text-[#5B6B8C] dark:text-slate-400">
              <StatusChip label={mode === "mock" ? "MODE MOCK" : "MODE LIVE"} tone={mode === "mock" ? "amber" : "emerald"} />
              <span>
                {preview.total} layanan di provider &middot; {preview.unchanged} tidak berubah &middot; kurs 1 {preview.rate.currency} = {formatIdr(preview.rate.rateIdr)} &middot; pembulatan Rp {preview.roundTo}
              </span>
            </div>

            {preview.blocked ? (
              <div role="alert" className="mb-3 rounded-2xl border border-amber-200/80 bg-amber-50 px-3 py-2.5 text-[10.5px] text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                <p className="font-semibold">{preview.blocked}</p>
                <p className="mt-0.5 text-[10px]">
                  Buka{" "}
                  <Link href="/admin/providers" className="font-semibold underline underline-offset-2">Provider &gt; Kurs &amp; markup</Link>, simpan, lalu cek perubahan lagi. Layanan tidak diimpor sebelum harga jelas.
                </p>
              </div>
            ) : null}

            {grouped.length === 0 ? (
              <p className="rounded-2xl border border-slate-200/70 px-3 py-6 text-center text-[10.5px] text-[#5B6B8C] dark:border-slate-800 dark:text-slate-400">
                Tidak ada perubahan. Katalog sudah sama dengan provider.
              </p>
            ) : (
              <div className="max-h-[46vh] space-y-4 overflow-y-auto pr-1">
                {grouped.map((g) => (
                  <section key={g.kind} aria-label={kindLabel[g.kind]}>
                    <div className="mb-1.5 flex items-center gap-2">
                      <StatusChip label={kindLabel[g.kind]} tone={kindTone[g.kind]} />
                      <span className="text-[9.5px] text-[#5B6B8C] dark:text-slate-400">{g.items.length} layanan</span>
                    </div>
                    <ul className="space-y-1.5">
                      {g.items.slice(0, MAX_ROWS).map((c) => (
                        <li key={`${c.kind}-${c.providerServiceId}`} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200/70 px-3 py-2 dark:border-slate-800">
                          <div className="min-w-0">
                            <p className="truncate text-[10.5px] font-medium text-ink dark:text-white" title={c.name}>
                              {c.name}
                              {c.review?.length ? <ReviewBadge reasons={c.review} threshold={preview?.reviewThreshold} /> : null}
                              {c.kind === "baru" && c.startsInactive ? <span className="ml-2 text-[9px] font-semibold text-slate-500 dark:text-slate-400">masuk nonaktif</span> : null}
                            </p>
                            <p className="text-[9.5px] text-[#5B6B8C] dark:text-slate-400">
                              {c.category} &middot; ID provider {c.providerServiceId}
                              {c.restored ? " · muncul lagi di provider" : ""}
                            </p>
                          </div>
                          <div className="text-right text-[9.5px] text-[#5B6B8C] dark:text-slate-400">
                            {c.kind === "dihapus" ? (
                              <span>Tidak ada di provider</span>
                            ) : (
                              <>
                                <p>
                                  Modal {c.kind === "baru" && !c.restored ? formatIdr(c.newCost) : `${formatIdr(c.oldCost)} → ${formatIdr(c.newCost)}`}
                                </p>
                                <p>
                                  Jual {c.kind === "baru" && !c.restored ? formatIdr(c.newPrice) : `${formatIdr(c.oldPrice)} → ${formatIdr(c.newPrice)}`}
                                  {c.margin !== null ? ` · margin ${c.margin}%` : ""}
                                </p>
                                {c.thinMargin ? <p className="font-semibold text-amber-600 dark:text-amber-300">Margin di bawah minimum</p> : null}
                              </>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                    {g.items.length > MAX_ROWS ? <p className="mt-1.5 text-[9.5px] text-[#5B6B8C] dark:text-slate-400">dan {(g.items.length - MAX_ROWS).toLocaleString("id-ID")} layanan lainnya (semuanya ikut diterapkan).</p> : null}
                  </section>
                ))}
              </div>
            )}

            {preview.unsupported.length > 0 ? (
              <details className="mt-3 rounded-2xl border border-slate-200/70 px-3 py-2 text-[10px] dark:border-slate-800">
                <summary className="cursor-pointer font-medium text-ink dark:text-white">Tidak didukung ({preview.unsupported.length})</summary>
                <ul className="mt-2 space-y-1 text-[9.5px] text-[#5B6B8C] dark:text-slate-400">
                  {preview.unsupported.map((u) => (
                    <li key={u.providerServiceId}>
                      {u.name} <span className="text-slate-400">({u.type})</span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={close}>
                Batal
              </Button>
              <Button disabled={changes.length === 0 || Boolean(preview.blocked)} onClick={() => setConfirming(true)}>
                Terapkan
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={open && confirming}
        onClose={() => setConfirming(false)}
        title="Terapkan perubahan provider?"
        description="Layanan baru, harga dan status akan berubah, dan perubahan harga tercatat di halaman Pembaruan pengguna. Masukkan password adminmu."
        confirmLabel="Terapkan"
        tone="primary"
        requirePassword
        onConfirm={async (password) => {
          const result = await run(applyProviderSync({ password, fingerprint: preview?.fingerprint ?? "" }));
          if (result.ok) close();
        }}
      />
    </>
  );
}

export function BulkMarkupModal({
  open,
  onClose,
  categories,
}: {
  open: boolean;
  onClose: () => void;
  categories: { id: string; label: string }[];
}) {
  const run = useAdminRunner();
  const [scope, setScope] = useState("semua");
  const [type, setType] = useState<MarkupType>("persen");
  const [value, setValue] = useState("40");
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);

  function next(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
      setError("Masukkan angka 0 atau lebih.");
      return;
    }
    setError("");
    setConfirming(true);
  }

  return (
    <>
      <Dialog
        open={open && !confirming}
        onClose={onClose}
        title="Atur markup massal"
        description="Terapkan markup yang sama ke banyak layanan sekaligus."
        maxWidth="max-w-sm"
      >
        <form noValidate onSubmit={next} className="space-y-4">
          <div>
            <label htmlFor="bm-scope" className="mb-1.5 block text-[10.5px] font-semibold text-ink dark:text-slate-200">
              Cakupan
            </label>
            <select
              id="bm-scope"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="h-[34px] w-full rounded-xl border border-slate-200 bg-white px-3 text-[10px] text-ink outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            >
              <option value="semua">Semua layanan</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <SegmentedControl<MarkupType>
            items={[{ value: "persen", label: "Persen (%)" }, { value: "tetap", label: "Tetap (Rp)" }]}
            value={type}
            onChange={setType}
            ariaLabel="Jenis markup"
            className="h-10"
          />
          <TextField label={type === "persen" ? "Markup (%)" : "Markup (Rp)"} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} error={error} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit">Lanjutkan</Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={open && confirming}
        onClose={() => setConfirming(false)}
        title="Terapkan markup massal?"
        description="Harga akhir banyak layanan akan berubah. Masukkan password adminmu untuk konfirmasi."
        confirmLabel="Terapkan markup"
        requirePassword
        onConfirm={async (password) => {
          const result = await run(bulkMarkup({ scope, markupType: type, markup: Number(value), password }));
          if (result.ok) {
            setConfirming(false);
            onClose();
          }
        }}
      />
    </>
  );
}
