"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCcw } from "lucide-react";
import { getMyRefills } from "@/lib/user-actions";
import { refillStatusFilters, type RefillRequest, type RefillStatus } from "@/lib/refills-data";
import { HeaderLine, HeaderZone } from "@/components/shell/header-zone";
import { PageHeading } from "@/components/shell/page-heading";
import { useToast } from "@/components/shared/toast";
import { FilterPill } from "@/components/ui/filter-pill";
import { SearchPill } from "@/components/ui/search-pill";
import { EmptyList, RowsSkeleton, ShowMoreButton } from "@/components/ui/list-states";
import { SelectionBar } from "@/components/ui/selection-bar";
import { ReportOrderModal } from "@/components/orders/report-order-modal";
import { RefillCard } from "./refill-card";

const PAGE_SIZE = 10;
type Filter = RefillStatus | "semua";

export function RefillPage() {
  const toast = useToast();
  const [status, setStatus] = useState<Filter>("semua");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [readyFor, setReadyFor] = useState<Filter | null>(null);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [reporting, setReporting] = useState<RefillRequest | null>(null);
  const [refills, setRefills] = useState<RefillRequest[] | null>(null);

  useEffect(() => {
    void getMyRefills().then(setRefills).catch(() => setRefills([]));
  }, []);

  const loading = readyFor !== status || refills === null;
  useEffect(() => {
    const timer = window.setTimeout(() => setReadyFor(status), 400);
    return () => window.clearTimeout(timer);
  }, [status]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim().toLowerCase()), 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  const filtered = useMemo(
    () =>
      (refills ?? []).filter((r) => {
        if (status !== "semua" && r.status !== status) return false;
        if (!debouncedQuery) return true;
        return (
          r.id.includes(debouncedQuery) ||
          r.orderId.includes(debouncedQuery) ||
          r.link.toLowerCase().includes(debouncedQuery) ||
          r.name.toLowerCase().includes(debouncedQuery)
        );
      }),
    [refills, status, debouncedQuery]
  );
  const shown = filtered.slice(0, visible);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function copyIds() {
    try {
      await navigator.clipboard.writeText(Array.from(selected).join(", "));
      toast("ID refill disalin");
    } catch {
      toast("Gagal menyalin ID", "error");
    }
  }

  return (
    <div>
      <HeaderZone />
      <PageHeading title="Refill" subtitle="Kamu bisa mengajukan refill untuk pesananmu di sini." />

      <div className="relative mt-[46px]">
        <HeaderLine top="50%" />
        <div className="relative z-10 flex items-center justify-between gap-3">
          <FilterPill
            options={refillStatusFilters}
            value={status}
            onChange={(next) => {
              setStatus(next);
              setVisible(PAGE_SIZE);
            }}
            ariaLabel="Filter status refill"
          />
          <SearchPill
            value={query}
            onChange={setQuery}
            ariaLabel="Cari refill berdasarkan ID refill, ID pesanan, link, atau nama layanan"
          />
        </div>
      </div>

      <section aria-label="Daftar refill" className="mt-5">
        {loading ? (
          <RowsSkeleton label="Memuat refill" tall />
        ) : filtered.length === 0 ? (
          <EmptyList icon={RefreshCcw} title="Belum ada refill" actionHref="/dashboard/orders" actionLabel="Lihat pesanan" />
        ) : (
          <>
            <ul className="space-y-3">
              {shown.map((r, i) => (
                <RefillCard
                  key={r.id}
                  refill={r}
                  index={i}
                  selected={selected.has(r.id)}
                  onToggleSelect={toggleSelect}
                  onReport={setReporting}
                />
              ))}
            </ul>
            {filtered.length > visible ? (
              <ShowMoreButton onClick={() => setVisible((v) => v + PAGE_SIZE)} />
            ) : null}
          </>
        )}
      </section>

      <SelectionBar count={selected.size} onCopyIds={copyIds} onClear={() => setSelected(new Set())} />
      <ReportOrderModal order={reporting} noun="Refill" onClose={() => setReporting(null)} />
    </div>
  );
}
