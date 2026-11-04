"use client";

import { useMemo, useState } from "react";
import { BookText, Download } from "lucide-react";
import type { LedgerEntry, LedgerType } from "@/lib/server/types";
import { PageHeader } from "@/components/shell/page-header";
import { DataToolbar } from "@/components/ui/data-toolbar";
import { EmptyState } from "@/components/ui/empty-state";
import { ListSkeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/ui/pagination";
import { TextField } from "@/components/ui/text-field";
import { LedgerList, ledgerFilterOptions } from "@/components/ledger/ledger-list";
import { useListState } from "@/lib/use-list-state";

type Filter = LedgerType | "semua";

export function AdminLedgerView({ entries, userNames }: { entries: LedgerEntry[]; userNames: Record<string, string> }) {
  const list = useListState<Filter>("semua", { pageSize: 15 });
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const filtered = useMemo(
    () =>
      entries.filter((l) => {
        if (list.filter !== "semua" && l.type !== list.filter) return false;
        const day = l.createdAt.slice(0, 10);
        if (from && day < from) return false;
        if (to && day > to) return false;
        if (!list.debounced) return true;
        const q = list.debounced;
        return (userNames[l.userId] ?? "").toLowerCase().includes(q) || l.refId.toLowerCase().includes(q) || l.note.toLowerCase().includes(q);
      }),
    [entries, list.filter, list.debounced, from, to, userNames]
  );

  const params = new URLSearchParams();
  if (list.filter !== "semua") params.set("type", list.filter);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (list.debounced) params.set("q", list.debounced);

  return (
    <div>
      <PageHeader title="Buku Besar" subtitle="Setiap perubahan saldo tercatat di sini dan tidak bisa diubah." />
      <DataToolbar
        filter={{ options: ledgerFilterOptions, value: list.filter, onChange: list.setFilter, ariaLabel: "Filter jenis mutasi" }}
        query={list.query}
        onQueryChange={list.setQuery}
        searchLabel="Cari berdasarkan pengguna, ID referensi, atau catatan"
        actions={
          <a
            href={`/api/admin/ledger/export?${params.toString()}`}
            className="inline-flex h-[34px] items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-[10px] font-medium text-ink transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Ekspor CSV
          </a>
        }
      />
      <div className="mt-4 grid max-w-md grid-cols-2 gap-3">
        <TextField label="Dari tanggal" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <TextField label="Sampai tanggal" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <section aria-label="Daftar mutasi saldo" className="mt-5">
        {list.loading ? (
          <ListSkeleton label="Memuat mutasi" />
        ) : filtered.length === 0 ? (
          <EmptyState icon={BookText} title="Belum ada mutasi" />
        ) : (
          <>
            <LedgerList entries={filtered.slice(0, list.visible)} showUser userNames={userNames} />
            <Pagination total={filtered.length} visible={list.visible} onMore={list.showMore} />
          </>
        )}
      </section>
    </div>
  );
}
