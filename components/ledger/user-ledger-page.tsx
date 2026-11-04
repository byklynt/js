"use client";

import { useEffect, useMemo, useState } from "react";
import { BookText } from "lucide-react";
import { formatIdr } from "@/lib/balance";
import { getMyLedger } from "@/lib/user-actions";
import type { LedgerEntry, LedgerType } from "@/lib/server/types";
import { HeaderLine, HeaderZone } from "@/components/shell/header-zone";
import { PageHeading } from "@/components/shell/page-heading";
import { FilterPill } from "@/components/ui/filter-pill";
import { EmptyList, RowsSkeleton, ShowMoreButton } from "@/components/ui/list-states";
import { LedgerList, ledgerFilterOptions } from "./ledger-list";

const PAGE_SIZE = 10;
type Filter = LedgerType | "semua";

export function UserLedgerPage() {
  const [data, setData] = useState<{ balance: number; entries: LedgerEntry[] } | null>(null);
  const [filter, setFilter] = useState<Filter>("semua");
  const [visible, setVisible] = useState(PAGE_SIZE);

  useEffect(() => {
    void getMyLedger().then(setData).catch(() => setData({ balance: 0, entries: [] }));
  }, []);

  const loading = data === null;
  const filtered = useMemo(() => (data?.entries ?? []).filter((l) => filter === "semua" || l.type === filter), [data, filter]);

  return (
    <div>
      <HeaderZone />
      <PageHeading title="Mutasi Saldo" subtitle="Riwayat semua perubahan saldomu: deposit, pesanan, dan refund." />

      <div className="relative mt-[46px]">
        <HeaderLine top="50%" />
        <div className="relative z-10 flex items-center justify-between gap-3">
          <FilterPill
            options={ledgerFilterOptions}
            value={filter}
            onChange={(next) => {
              setFilter(next);
              setVisible(PAGE_SIZE);
            }}
            ariaLabel="Filter jenis mutasi"
          />
          <p className="rounded-full border border-slate-200/70 bg-white px-4 py-2 text-[10px] font-medium text-ink dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
            Saldo saat ini: <span className="font-semibold">{formatIdr(data?.balance ?? 0)}</span>
          </p>
        </div>
      </div>

      <section aria-label="Daftar mutasi saldo" className="mt-5">
        {loading ? (
          <RowsSkeleton label="Memuat mutasi" />
        ) : filtered.length === 0 ? (
          <EmptyList icon={BookText} title="Belum ada mutasi" />
        ) : (
          <>
            <LedgerList entries={filtered.slice(0, visible)} />
            {filtered.length > visible ? <ShowMoreButton onClick={() => setVisible((v) => v + PAGE_SIZE)} /> : null}
          </>
        )}
      </section>
    </div>
  );
}
