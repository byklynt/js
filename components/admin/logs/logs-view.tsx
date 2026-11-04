"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ScrollText } from "lucide-react";
import type { AuditLog } from "@/lib/admin-data";
import { formatDateTime } from "@/lib/balance";
import { PageHeader } from "@/components/shell/page-header";
import { DataToolbar } from "@/components/ui/data-toolbar";
import { FilterPill } from "@/components/ui/filter-pill";
import { EmptyState } from "@/components/ui/empty-state";
import { ListSkeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/ui/pagination";
import { useListState } from "@/lib/use-list-state";
import { cn } from "@/lib/utils";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

const show = (v: unknown) => (v === undefined ? "-" : typeof v === "object" ? JSON.stringify(v) : String(v));

/** Before/after comparison: one row per changed key. */
function Diff({ before, after }: { before: unknown; after: unknown }) {
  const b = asRecord(before);
  const a = asRecord(after);
  const keys = Array.from(new Set([...Object.keys(b ?? {}), ...Object.keys(a ?? {})]));
  if (keys.length === 0 && before == null && after == null) {
    return <p className="text-[10px] text-[#5B6B8C] dark:text-slate-400">Tidak ada data sebelum/sesudah.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[10px]">
        <thead>
          <tr className="text-[#5B6B8C] dark:text-slate-400">
            <th scope="col" className="pr-4 pb-1 font-semibold">Kolom</th>
            <th scope="col" className="pr-4 pb-1 font-semibold">Sebelum</th>
            <th scope="col" className="pb-1 font-semibold">Sesudah</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => {
            const changed = JSON.stringify(b?.[k]) !== JSON.stringify(a?.[k]);
            return (
              <tr key={k} className="align-top">
                <th scope="row" className="pr-4 py-0.5 font-medium text-ink dark:text-slate-100">{k}</th>
                <td className={cn("pr-4 py-0.5 font-mono", changed && "text-red-500 line-through dark:text-red-300")}>{show(b?.[k])}</td>
                <td className={cn("py-0.5 font-mono", changed && "text-emerald-600 dark:text-emerald-300")}>{show(a?.[k])}</td>
              </tr>
            );
          })}
          {keys.length === 0 ? (
            <tr>
              <td className="pr-4 font-mono text-red-500 dark:text-red-300">{show(before)}</td>
              <td />
              <td className="font-mono text-emerald-600 dark:text-emerald-300">{show(after)}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

export function LogsView({ logs }: { logs: AuditLog[] }) {
  const list = useListState<string>("semua", { pageSize: 15 });
  const [action, setAction] = useState("semua");
  const [open, setOpen] = useState<string | null>(null);

  const adminNames = useMemo(() => Array.from(new Set(logs.map((l) => l.adminName))), [logs]);
  const actionNames = useMemo(() => Array.from(new Set(logs.map((l) => l.action))), [logs]);

  const filtered = useMemo(
    () =>
      logs.filter((l) => {
        if (list.filter !== "semua" && l.adminName !== list.filter) return false;
        if (action !== "semua" && l.action !== action) return false;
        if (!list.debounced) return true;
        const q = list.debounced;
        return l.action.toLowerCase().includes(q) || l.targetId.toLowerCase().includes(q) || l.targetType.toLowerCase().includes(q) || l.adminName.toLowerCase().includes(q);
      }),
    [logs, list.filter, action, list.debounced]
  );
  const shown = filtered.slice(0, list.visible);

  return (
    <div>
      <PageHeader title="Log Aktivitas" subtitle="Jejak audit semua tindakan admin." />

      <DataToolbar
        filter={{
          options: [{ id: "semua", label: "Semua admin" }, ...adminNames.map((n) => ({ id: n, label: n }))],
          value: list.filter,
          onChange: list.setFilter,
          ariaLabel: "Filter admin",
        }}
        query={list.query}
        onQueryChange={list.setQuery}
        searchLabel="Cari log berdasarkan aksi, target, atau admin"
        actions={
          <FilterPill
            options={[{ id: "semua", label: "Semua aksi" }, ...actionNames.map((n) => ({ id: n, label: n }))]}
            value={action}
            onChange={setAction}
            ariaLabel="Filter aksi"
          />
        }
      />

      <section aria-label="Log aktivitas" className="mt-5">
        {list.loading ? (
          <ListSkeleton label="Memuat log" />
        ) : filtered.length === 0 ? (
          <EmptyState icon={ScrollText} title="Log tidak ditemukan" />
        ) : (
          <>
            <div className="thin-scroll relative overflow-x-auto rounded-2xl border border-slate-200/70 bg-white dark:border-slate-800 dark:bg-slate-900">
              <table aria-label="Tabel log aktivitas" className="w-full min-w-[720px] border-collapse text-left">
                <thead>
                  <tr>
                    {["Waktu", "Admin", "Aksi", "Target", ""].map((h, i) => (
                      <th key={i} scope="col" className="h-10 border-b border-slate-200/70 px-4 text-[10px] font-semibold whitespace-nowrap text-[#5B6B8C] dark:border-slate-800 dark:text-slate-400">
                        {h || <span className="sr-only">Detail</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((l) => {
                    const expanded = open === l.id;
                    return (
                      <Fragment key={l.id}>
                        <tr className="border-b border-slate-200/70 last:border-b-0 dark:border-slate-800">
                          <td className="h-12 px-4 text-[10.5px] whitespace-nowrap text-ink dark:text-slate-100">
                            <time dateTime={l.at}>{formatDateTime(l.at)}</time>
                          </td>
                          <td className="px-4 text-[10.5px] font-medium text-ink dark:text-white">{l.adminName}</td>
                          <td className="px-4 font-mono text-[10px] text-primary-600 dark:text-primary-300">{l.action}</td>
                          <td className="px-4 text-[10.5px] text-ink dark:text-slate-100">
                            {l.targetType} <span className="text-[#5B6B8C] dark:text-slate-400">#{l.targetId}</span>
                          </td>
                          <td className="w-12 px-4 text-right">
                            <button
                              type="button"
                              aria-expanded={expanded}
                              aria-controls={`log-${l.id}`}
                              aria-label={`${expanded ? "Sembunyikan" : "Lihat"} perubahan ${l.action}`}
                              onClick={() => setOpen(expanded ? null : l.id)}
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-ink transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-primary dark:text-slate-100 dark:hover:bg-slate-800"
                            >
                              <ChevronDown className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} />
                            </button>
                          </td>
                        </tr>
                        {expanded ? (
                          <tr id={`log-${l.id}`} className="border-b border-slate-200/70 bg-slate-50/60 dark:border-slate-800 dark:bg-white/[0.03]">
                            <td colSpan={5} className="px-4 py-3">
                              <Diff before={l.before} after={l.after} />
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination total={filtered.length} visible={list.visible} onMore={list.showMore} />
          </>
        )}
      </section>
    </div>
  );
}
