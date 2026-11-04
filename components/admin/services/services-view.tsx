"use client";

import { useMemo, useRef, useState } from "react";
import { Download, LayoutGrid, Pencil, Plus, RefreshCw, SlidersHorizontal, Upload } from "lucide-react";
import { finalPrice, type AdminService, type PublicProvider } from "@/lib/admin-data";
import { importServicesCsv, updateService } from "@/lib/admin-actions";
import { formatIdr } from "@/lib/balance";
import { PageHeader } from "@/components/shell/page-header";
import { DataToolbar } from "@/components/ui/data-toolbar";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ListSkeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/ui/pagination";
import { Button } from "@/components/ui/button";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { useToast } from "@/components/shared/toast";
import { useListState } from "@/lib/use-list-state";
import { useAdminRunner } from "../use-admin-runner";
import { ServiceFormModal } from "./service-form-modal";
import { useSearchParams } from "next/navigation";
import { marginPercent } from "@/lib/server/pricing";
import { BulkMarkupModal, SyncModal } from "./sync-and-markup";
import { MarginFixModal } from "./margin-fix-modal";

type FormTarget = { service: AdminService | null; categoryId: string };

export function ServicesView({ services, providers, minMargin = 5 }: { services: AdminService[]; providers: PublicProvider[]; minMargin?: number }) {
  const run = useAdminRunner();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const marginParam = ["thin", "low"].includes(useSearchParams().get("margin") ?? "");
  const list = useListState<string>(marginParam ? "margin" : "semua", { pageSize: 15 });
  const [fixOpen, setFixOpen] = useState(false);
  const thinCount = useMemo(() => services.filter((s) => s.active && marginPercent(s) < minMargin).length, [services, minMargin]);
  const [form, setForm] = useState<FormTarget | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const [markupOpen, setMarkupOpen] = useState(false);

  const categories = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of services) map.set(s.categoryId, s.categoryLabel);
    return Array.from(map, ([id, label]) => ({ id, label }));
  }, [services]);

  const filtered = useMemo(
    () =>
      services
        .filter((s) => list.filter === "semua" || (list.filter === "margin" ? s.active && marginPercent(s) < minMargin : s.categoryId === list.filter))
        .filter((s) => !list.debounced || s.id.includes(list.debounced) || s.name.toLowerCase().includes(list.debounced))
        .sort((a, b) => a.sort - b.sort),
    [services, list.filter, list.debounced, minMargin]
  );
  const shown = filtered.slice(0, list.visible);
  const groups = useMemo(() => {
    const map = new Map<string, AdminService[]>();
    for (const s of shown) map.set(s.categoryId, [...(map.get(s.categoryId) ?? []), s]);
    return Array.from(map, ([categoryId, items]) => ({ categoryId, label: items[0].categoryLabel, items }));
  }, [shown]);

  const providerName = (id: string) => providers.find((p) => p.id === id)?.name ?? id;

  function save(s: AdminService, patch: Partial<AdminService>) {
    const next = { ...s, ...patch };
    return run(
      updateService({
        id: next.id, name: next.name, providerId: next.providerId, providerServiceId: next.providerServiceId,
        providerPrice: next.providerPrice, markupType: next.markupType, markup: next.markup, min: next.min,
        max: next.max, refill: next.refill, cancel: next.cancel, active: next.active, sort: next.sort,
      })
    );
  }

  function exportCsv() {
    const header = "id,nama,provider,id_provider,harga_provider,markup_jenis,markup,harga_akhir,min,maks,refill,batal,aktif,urutan";
    const rows = services.map((s) =>
      [s.id, `"${s.name.replace(/"/g, '""')}"`, providerName(s.providerId), s.providerServiceId, s.providerPrice, s.markupType, s.markup, finalPrice(s), s.min, s.max, s.refill, s.cancel, s.active, s.sort].join(",")
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "layanan-jagoansosmed.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast("CSV diekspor");
  }

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 500_000) {
      toast("File CSV maksimal 500 KB.", "error");
      return;
    }
    await run(importServicesCsv({ csv: await file.text() }));
  }

  function columns(): Column<AdminService>[] {
    return [
      { key: "id", header: "ID", cell: (s) => <span className="font-semibold text-primary-accent">{s.id}</span>, className: "w-16" },
      { key: "name", header: "Nama", cell: (s) => <span className="block max-w-[260px] truncate" title={s.name}>{s.name}</span> },
      { key: "provider", header: "Provider", cell: (s) => <span className="whitespace-nowrap">{providerName(s.providerId)} <span className="text-[#5B6B8C] dark:text-slate-400">#{s.providerServiceId}</span></span>, hideBelowLg: true },
      { key: "pprice", header: "Harga provider", cell: (s) => formatIdr(s.providerPrice), className: "whitespace-nowrap", hideBelowLg: true },
      { key: "markup", header: "Markup", cell: (s) => (s.markupType === "persen" ? `${s.markup}%` : formatIdr(s.markup)), className: "whitespace-nowrap", hideBelowLg: true },
      { key: "final", header: "Harga akhir", cell: (s) => <span className="font-semibold">{formatIdr(finalPrice(s))}{s.active && marginPercent(s) < minMargin ? <span title={`Margin ${marginPercent(s)}%`} className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">Margin tipis</span> : null}</span>, className: "whitespace-nowrap" },
      { key: "limit", header: "Min - Maks", cell: (s) => `${s.min.toLocaleString("id-ID")} - ${s.max.toLocaleString("id-ID")}`, className: "whitespace-nowrap", hideBelowLg: true },
      { key: "flags", header: "Refill / Batal", cell: (s) => `${s.refill ? "Ya" : "Tidak"} / ${s.cancel ? "Ya" : "Tidak"}`, className: "whitespace-nowrap", hideBelowLg: true },
      { key: "sort", header: "Urutan", cell: (s) => (
          <input
            type="number"
            min={0}
            defaultValue={s.sort}
            aria-label={`Urutan layanan ${s.id}`}
            onBlur={(e) => { const n = Number(e.target.value); if (Number.isInteger(n) && n >= 0 && n !== s.sort) void save(s, { sort: n }); }}
            className="h-8 w-16 rounded-lg border border-slate-200 bg-white px-2 text-[10px] text-ink outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        ), hideBelowLg: true },
      { key: "active", header: "Aktif", cell: (s) => <ToggleSwitch checked={s.active} label={`Aktifkan layanan ${s.id}`} onChange={(v) => void save(s, { active: v })} /> },
      { key: "edit", header: "Ubah", cell: (s) => (
          <button type="button" aria-label={`Ubah layanan ${s.id}`} onClick={() => setForm({ service: s, categoryId: s.categoryId })} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/70 text-ink transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800">
            <Pencil className="h-3.5 w-3.5" />
          </button>
        ), className: "w-14 text-right" },
    ];
  }

  return (
    <div>
      <PageHeader title="Layanan" subtitle="Atur layanan, harga, dan markup." />

      {services.length === 0 ? (
        <div role="status" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary-200 bg-primary-50/60 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/60">
          <p className="text-[10.5px] font-medium text-ink dark:text-white">Belum ada layanan. Sinkronkan dari provider.</p>
          <Button onClick={() => setSyncOpen(true)}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Sinkronkan dari provider
          </Button>
        </div>
      ) : null}

      <DataToolbar
        filter={{
          options: [{ id: "semua", label: "Semua kategori" }, { id: "margin", label: "Margin tipis" }, ...categories.map((c) => ({ id: c.id, label: c.label }))],
          value: list.filter,
          onChange: list.setFilter,
          ariaLabel: "Filter kategori layanan",
        }}
        query={list.query}
        onQueryChange={list.setQuery}
        searchLabel="Cari layanan berdasarkan ID atau nama"
      />

      <div className="mt-4 flex flex-wrap gap-2">
        {thinCount > 0 ? <Button variant="outline" onClick={() => setFixOpen(true)}>Terapkan markup otomatis ({thinCount})</Button> : null}
        <Button variant="outline" onClick={() => setSyncOpen(true)}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          Sinkronkan dari provider
        </Button>
        <Button variant="outline" onClick={() => setMarkupOpen(true)}>
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
          Atur markup massal
        </Button>
        <Button variant="outline" onClick={() => fileRef.current?.click()}>
          <Upload className="h-3.5 w-3.5" aria-hidden />
          Impor CSV
        </Button>
        <Button variant="outline" onClick={exportCsv}>
          <Download className="h-3.5 w-3.5" aria-hidden />
          Ekspor CSV
        </Button>
        <Button onClick={() => setForm({ service: null, categoryId: categories[0]?.id ?? "cat-new" })}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Tambah layanan
        </Button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" tabIndex={-1} aria-label="Pilih file CSV" onChange={onImport} />
      </div>

      <section aria-label="Daftar layanan" className="mt-5 space-y-6">
        {list.loading ? (
          <ListSkeleton label="Memuat layanan" />
        ) : filtered.length === 0 ? (
          <EmptyState icon={LayoutGrid} title="Layanan tidak ditemukan" />
        ) : (
          <>
            {groups.map((g) => (
              <div key={g.categoryId}>
                <h2 className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-ink dark:text-white">
                  {g.label}
                  <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[9px] font-semibold text-primary-accent">
                    {g.items.length}
                  </span>
                </h2>
                <DataTable
                  ariaLabel={`Layanan ${g.label}`}
                  columns={columns()}
                  rows={g.items}
                  rowKey={(s) => s.id}
                  mobileCard={(s) => (
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 text-[11px] font-medium text-ink dark:text-white">
                          <span className="font-semibold text-primary-accent">{s.id}</span> - {s.name}
                        </p>
                        <ToggleSwitch checked={s.active} label={`Aktifkan layanan ${s.id}`} onChange={(v) => void save(s, { active: v })} />
                      </div>
                      <p className="text-[10px] text-[#5B6B8C] dark:text-slate-400">
                        {providerName(s.providerId)} #{s.providerServiceId} - Harga akhir{" "}
                        <span className="font-semibold text-ink dark:text-white">{formatIdr(finalPrice(s))}</span>
                      </p>
                      <Button variant="outline" className="h-8" onClick={() => setForm({ service: s, categoryId: s.categoryId })}>
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                        Ubah
                      </Button>
                    </div>
                  )}
                />
              </div>
            ))}
            <Pagination total={filtered.length} visible={list.visible} onMore={list.showMore} />
          </>
        )}
      </section>

      <ServiceFormModal
        key={form ? (form.service?.id ?? "new") + String(Boolean(form)) : "closed"}
        open={Boolean(form)}
        service={form?.service ?? null}
        categoryId={form?.categoryId ?? ""}
        providers={providers}
        onClose={() => setForm(null)}
      />
      <SyncModal open={syncOpen} onClose={() => setSyncOpen(false)} />
      <BulkMarkupModal open={markupOpen} onClose={() => setMarkupOpen(false)} categories={categories} />
      <MarginFixModal open={fixOpen} onClose={() => setFixOpen(false)} />
    </div>
  );
}
