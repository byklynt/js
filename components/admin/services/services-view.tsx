"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, LayoutGrid, Pencil, Plus, RefreshCw, SlidersHorizontal, Upload } from "lucide-react";
import { finalPrice, type AdminService, type PublicProvider } from "@/lib/admin-data";
import { importServicesCsv, setServiceActive, updateService } from "@/lib/admin-actions";
import { reviewReasons } from "@/lib/service-review";
import { ReviewBadge } from "./review-badge";
import { formatIdr } from "@/lib/balance";
import { PageHeader } from "@/components/shell/page-header";
import { DataToolbar } from "@/components/ui/data-toolbar";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ListSkeleton } from "@/components/ui/skeleton";
import { ShowMoreButton } from "@/components/ui/list-states";
import { Button } from "@/components/ui/button";
import { EstimateDialog, estimateSummary } from "./estimate-dialog";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { useToast } from "@/components/shared/toast";
import { useListState } from "@/lib/use-list-state";
import type { AdminServicesMeta, AdminServicesPage } from "@/lib/server/admin-services";
import { useAdminRunner } from "../use-admin-runner";
import { ServiceFormModal } from "./service-form-modal";
import { useSearchParams } from "next/navigation";
import { marginPercent } from "@/lib/server/pricing";
import { BulkMarkupModal, SyncModal } from "./sync-and-markup";
import { MarginFixModal } from "./margin-fix-modal";

type FormTarget = { service: AdminService | null; categoryId: string };

/** Rows loaded at most per list; beyond that the admin narrows by category or search. */
const MAX_ROWS = 100;

export function ServicesView({ initial, meta, providers, minMargin = 5, reviewThreshold }: { initial: AdminServicesPage; meta: AdminServicesMeta; providers: PublicProvider[]; minMargin?: number; reviewThreshold?: number }) {
  const run = useAdminRunner();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const marginParam = ["thin", "low"].includes(useSearchParams().get("margin") ?? "");
  const list = useListState<string>(marginParam ? "margin" : "semua", { pageSize: 15, debounceMs: 300 });
  const [fixOpen, setFixOpen] = useState(false);
  const thinCount = meta.thinCount;
  const categories = meta.categories;

  // One page at a time from the server. The server decides the filter, the search and the order.
  const [data, setData] = useState<AdminServicesPage>(initial);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const firstLoad = useRef(true);
  // A switch the admin flipped a moment ago wins over a list response that was requested BEFORE the save finished (a late refetch must not flip it back).
  const recentSwitch = useRef(new Map<string, { active: boolean; at: number }>());
  const withRecent = (items: AdminService[]) => {
    const now = Date.now();
    return items.map((x) => {
      const r = recentSwitch.current.get(x.id);
      return r && now - r.at < 15_000 ? { ...x, active: r.active } : x;
    });
  };
  const key = `${list.filter}|${list.debounced}`;
  const defaultKey = `${marginParam ? "margin" : "semua"}|`;
  useEffect(() => {
    // The server already rendered the first page for the default view; refetch after any change (or after an admin edit refreshed meta).
    if (firstLoad.current && key === defaultKey) {
      firstLoad.current = false;
      return;
    }
    firstLoad.current = false;
    const ctrl = new AbortController();
    setLoading(true);
    const qs = new URLSearchParams({ filter: list.filter, search: list.debounced });
    fetch(`/api/admin/services?${qs}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<AdminServicesPage>) : Promise.reject(new Error("fail"))))
      .then((page) => {
        setData({ ...page, items: withRecent(page.items) });
        setLoading(false);
      })
      .catch((e) => {
        if (!(e instanceof DOMException && e.name === "AbortError")) setLoading(false);
      });
    return () => ctrl.abort();
    // key encodes filter + search; meta changes when router.refresh() brings new server data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, meta]);

  async function loadMore() {
    if (!data.nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const qs = new URLSearchParams({ filter: list.filter, search: list.debounced, cursor: data.nextCursor });
      const r = await fetch(`/api/admin/services?${qs}`);
      if (r.ok) {
        const page = (await r.json()) as AdminServicesPage;
        setData((d) => ({ ...page, items: [...d.items, ...withRecent(page.items)] }));
      }
    } finally {
      setLoadingMore(false);
    }
  }
  const [form, setForm] = useState<FormTarget | null>(null);
  const [estimateFor, setEstimateFor] = useState<AdminService | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const [markupOpen, setMarkupOpen] = useState(false);

  const groups = useMemo(() => {
    const map = new Map<string, AdminService[]>();
    for (const s of data.items) map.set(s.categoryId, [...(map.get(s.categoryId) ?? []), s]);
    return Array.from(map, ([categoryId, items]) => ({ categoryId, label: items[0].categoryLabel, items }));
  }, [data.items]);

  const providerName = (id: string) => providers.find((p) => p.id === id)?.name ?? id;

  // The Aktif switch: flips at once (optimistic), the request runs ONCE, the switch is disabled while it is in flight, and a failure puts it back.
  const [pendingActive, setPendingActive] = useState<Record<string, boolean>>({});
  const inFlight = useRef(new Set<string>());
  async function toggleActive(s: AdminService, next: boolean) {
    if (inFlight.current.has(s.id)) return;
    inFlight.current.add(s.id);
    setPendingActive((p) => ({ ...p, [s.id]: next }));
    try {
      const result = await run(setServiceActive({ id: s.id, active: next }));
      if (result.ok) {
        recentSwitch.current.set(s.id, { active: next, at: Date.now() });
        setData((d) => ({ ...d, items: d.items.map((x) => (x.id === s.id ? { ...x, active: next } : x)) }));
      }
      // on failure run() already showed the error toast; dropping the pending value puts the switch back to the saved state
    } finally {
      inFlight.current.delete(s.id);
      setPendingActive((p) => Object.fromEntries(Object.entries(p).filter(([k]) => k !== s.id)));
    }
  }
  const activeSwitch = (s: AdminService) => (
    <ToggleSwitch checked={pendingActive[s.id] ?? s.active} disabled={s.id in pendingActive} label={`Aktifkan layanan ${s.id}`} onChange={(v) => void toggleActive(s, v)} />
  );
  const reviewOf = (s: AdminService) => reviewReasons({ name: s.name, category: s.categoryLabel, price: finalPrice(s), threshold: reviewThreshold });

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

  async function exportCsv() {
    // The whole list is built on the server (admins only); the page never holds it.
    const res = await fetch("/api/admin/services/export");
    if (!res.ok) {
      toast("Ekspor gagal.", "error");
      return;
    }
    const url = URL.createObjectURL(await res.blob());
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
      { key: "name", header: "Nama", cell: (s) => <span className="block max-w-[260px] truncate" title={s.name}>{s.name}{reviewOf(s).length ? <ReviewBadge reasons={reviewOf(s)} threshold={reviewThreshold} /> : null}</span> },
      { key: "provider", header: "Provider", cell: (s) => <span className="whitespace-nowrap">{providerName(s.providerId)} <span className="text-[#5B6B8C] dark:text-slate-400">#{s.providerServiceId}</span></span>, hideBelowLg: true },
      { key: "pprice", header: "Harga provider", cell: (s) => formatIdr(s.providerPrice), className: "whitespace-nowrap", hideBelowLg: true },
      { key: "markup", header: "Markup", cell: (s) => (s.markupType === "persen" ? `${s.markup}%` : formatIdr(s.markup)), className: "whitespace-nowrap", hideBelowLg: true },
      { key: "final", header: "Harga akhir", cell: (s) => <span className="font-semibold">{formatIdr(finalPrice(s))}{s.active && marginPercent(s) < minMargin ? <span title={`Margin ${marginPercent(s)}%`} className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">Margin tipis</span> : null}</span>, className: "whitespace-nowrap" },
      { key: "limit", header: "Min - Maks", cell: (s) => `${s.min.toLocaleString("id-ID")} - ${s.max.toLocaleString("id-ID")}`, className: "whitespace-nowrap", hideBelowLg: true },
      {
        key: "estimate",
        header: "Estimasi",
        cell: (s) => {
          const e = estimateSummary(s);
          return (
            <button type="button" onClick={() => setEstimateFor(s)} aria-label={`Atur estimasi layanan ${s.id}`} data-testid="admin-estimate" className="whitespace-nowrap rounded text-left text-[10px] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              <span className="font-semibold text-ink dark:text-white">{e.shown.kind === "none" ? "Belum ada" : e.shown.text}</span>
              <span className="block text-[9px] text-[#5B6B8C] dark:text-slate-400">{e.samples} sampel{e.override ? " - manual" : ""}</span>
            </button>
          );
        },
        hideBelowLg: true,
      },
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
      { key: "active", header: "Aktif", cell: (s) => activeSwitch(s) },
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

      {meta.total === 0 ? (
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
          searchable: true,
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
        {loading && data.items.length === 0 ? (
          <ListSkeleton label="Memuat layanan" />
        ) : data.items.length === 0 ? (
          <EmptyState icon={LayoutGrid} title={list.debounced ? "Tidak ada hasil" : "Layanan tidak ditemukan"} />
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
                          {reviewOf(s).length ? <ReviewBadge reasons={reviewOf(s)} threshold={reviewThreshold} /> : null}
                        </p>
                        {activeSwitch(s)}
                      </div>
                      <p className="text-[10px] text-[#5B6B8C] dark:text-slate-400">
                        {providerName(s.providerId)} #{s.providerServiceId} - Harga akhir{" "}
                        <span className="font-semibold text-ink dark:text-white">{formatIdr(finalPrice(s))}</span>
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" className="h-8" onClick={() => setForm({ service: s, categoryId: s.categoryId })}>
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                          Ubah
                        </Button>
                        <Button variant="outline" className="h-8" onClick={() => setEstimateFor(s)}>
                          Estimasi: {estimateSummary(s).shown.kind === "none" ? "belum ada" : estimateSummary(s).shown.text}
                        </Button>
                      </div>
                    </div>
                  )}
                />
              </div>
            ))}
            {data.nextCursor && data.items.length < MAX_ROWS ? (
              <ShowMoreButton onClick={() => void loadMore()} />
            ) : null}
            {data.nextCursor && data.items.length >= MAX_ROWS ? (
              <p className="text-center text-[10px] text-slate-400">
                {(data.total - data.items.length).toLocaleString("id-ID")} layanan lagi. Pilih kategori atau gunakan pencarian untuk mempersempit.
              </p>
            ) : null}
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
      <EstimateDialog key={estimateFor?.id ?? "estimate-closed"} service={estimateFor} onClose={() => setEstimateFor(null)} />
      <SyncModal open={syncOpen} onClose={() => setSyncOpen(false)} />
      <BulkMarkupModal open={markupOpen} onClose={() => setMarkupOpen(false)} categories={categories} />
      <MarginFixModal open={fixOpen} onClose={() => setFixOpen(false)} />
    </div>
  );
}
