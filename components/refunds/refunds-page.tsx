"use client";

import { useEffect, useMemo, useState } from "react";
import { ReceiptText } from "lucide-react";
import { refundStatusFilters, type Refund, type RefundStatus } from "@/lib/refunds-data";
import { getMyRefunds } from "@/lib/user-actions";
import { HeaderLine, HeaderZone } from "@/components/shell/header-zone";
import { PageHeading } from "@/components/shell/page-heading";
import { FilterPill } from "@/components/ui/filter-pill";
import { SearchPill } from "@/components/ui/search-pill";
import { EmptyList, RowsSkeleton, ShowMoreButton } from "@/components/ui/list-states";
import { RefundRow } from "./refund-row";

const PAGE_SIZE = 10;
type Filter = RefundStatus | "semua";

export function RefundsPage() {
  const [status, setStatus] = useState<Filter>("semua");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [refunds, setRefunds] = useState<Refund[] | null>(null);

  useEffect(() => {
    void getMyRefunds().then(setRefunds).catch(() => setRefunds([]));
  }, []);

  const loading = refunds === null;

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  const filtered = useMemo(
    () =>
      (refunds ?? []).filter(
        (r) =>
          (status === "semua" || r.status === status) &&
          (!debouncedQuery || r.orderId.includes(debouncedQuery))
      ),
    [refunds, status, debouncedQuery]
  );
  const shown = filtered.slice(0, visible);

  return (
    <div>
      <HeaderZone />
      <PageHeading title="Refund" subtitle="Kelola dan pantau refund pesananmu dengan mudah." />

      <div className="relative mt-[46px]">
        <HeaderLine top="50%" />
        <div className="relative z-10 flex items-center justify-between gap-3">
          <FilterPill
            options={refundStatusFilters}
            value={status}
            onChange={(next) => {
              setStatus(next);
              setVisible(PAGE_SIZE);
            }}
            ariaLabel="Filter status refund"
          />
          <SearchPill value={query} onChange={setQuery} ariaLabel="Cari refund berdasarkan ID pesanan" />
        </div>
      </div>

      <section aria-label="Daftar refund" className="mt-5">
        {loading ? (
          <RowsSkeleton label="Memuat refund" />
        ) : filtered.length === 0 ? (
          <EmptyList icon={ReceiptText} title="Belum ada refund" />
        ) : (
          <>
            <ul className="space-y-3">
              {shown.map((r, i) => (
                <RefundRow key={r.id} refund={r} index={i} />
              ))}
            </ul>
            {filtered.length > visible ? (
              <ShowMoreButton onClick={() => setVisible((v) => v + PAGE_SIZE)} />
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
