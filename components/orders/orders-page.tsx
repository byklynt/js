"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PackageSearch } from "lucide-react";
import type { Order } from "@/lib/orders-data";
import { formatIdr, refreshBalance } from "@/lib/balance";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { getMyOrders, submitCancel, submitRefill, type MyOrder } from "@/lib/user-actions";
import { HeaderLine, HeaderZone } from "@/components/shell/header-zone";
import { PageHeading } from "@/components/shell/page-heading";
import { useToast } from "@/components/shared/toast";
import { OrdersToolbar, type StatusFilter } from "./orders-toolbar";
import { OrderCard, type RefillState } from "./order-card";
import { ReportOrderModal } from "./report-order-modal";
import { SelectionBar } from "@/components/ui/selection-bar";

const PAGE_SIZE = 10;

function OrdersSkeleton() {
  return (
    <ul aria-busy="true" aria-label="Memuat pesanan" className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <li
          key={i}
          className="list-none overflow-hidden rounded-2xl border border-slate-200/70 dark:border-slate-800"
        >
          <div className="flex items-center gap-3 px-3 py-3.5">
            <div className="animate-shimmer h-9 w-9 rounded-full" />
            <div className="animate-shimmer h-5 w-5 rounded-md" />
            <div className="animate-shimmer h-7 w-24 rounded-full" />
            <div className="animate-shimmer h-4 w-1/3 rounded-md" />
          </div>
          <div className="flex gap-2 border-t border-slate-200/70 px-3 py-3 dark:border-slate-800">
            {Array.from({ length: 4 }).map((__, j) => (
              <div key={j} className="animate-shimmer h-9 w-32 rounded-full" />
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function OrdersPage({ initialSearch = "" }: { initialSearch?: string }) {
  const toast = useToast();
  const [status, setStatus] = useState<StatusFilter>("semua");
  const [query, setQuery] = useState(initialSearch);
  const [debouncedQuery, setDebouncedQuery] = useState(initialSearch.trim().toLowerCase());
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [refills, setRefills] = useState<Record<string, RefillState>>({});
  const [reporting, setReporting] = useState<Order | null>(null);
  const [allOrders, setAllOrders] = useState<MyOrder[] | null>(null);
  const [cancelTarget, setCancelTarget] = useState<MyOrder | null>(null);

  const reload = () => void getMyOrders().then(setAllOrders).catch(() => setAllOrders([]));
  useEffect(() => {
    reload();
  }, []);

  // Skeleton shimmer for 400ms on first load and whenever the status filter changes.
  const loading = allOrders === null;

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim().toLowerCase()), 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  const filtered = useMemo(
    () =>
      (allOrders ?? []).filter((o) => {
        if (status !== "semua" && o.status !== status) return false;
        if (!debouncedQuery) return true;
        return (
          o.id.includes(debouncedQuery) ||
          o.name.toLowerCase().includes(debouncedQuery) ||
          o.link.toLowerCase().includes(debouncedQuery)
        );
      }),
    [allOrders, status, debouncedQuery]
  );

  const shown = filtered.slice(0, visible);

  function handleStatusChange(next: StatusFilter) {
    setStatus(next);
    setVisible(PAGE_SIZE);
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleRefill(order: MyOrder) {
    setRefills((prev) => ({ ...prev, [order.id]: "loading" }));
    try {
      const result = await submitRefill(order.id);
      if (result.ok) {
        setRefills((prev) => ({ ...prev, [order.id]: "done" }));
        toast(`Refill untuk pesanan #${order.id} diajukan`);
      } else {
        setRefills((prev) => ({ ...prev, [order.id]: "idle" }));
        toast(result.error, "error");
      }
    } catch {
      setRefills((prev) => ({ ...prev, [order.id]: "idle" }));
      toast("Gagal mengajukan refill. Coba lagi.", "error");
    }
    reload();
  }

  async function confirmCancel(order: MyOrder) {
    try {
      const result = await submitCancel(order.id);
      toast(result.ok ? (result.message ?? "Permintaan dikirim.") : result.error, result.ok ? "success" : "error");
    } catch {
      toast("Gagal mengajukan pembatalan. Coba lagi.", "error");
    }
    reload();
    refreshBalance();
  }

  async function copySelectedIds() {
    try {
      await navigator.clipboard.writeText(Array.from(selected).join(", "));
      toast("ID pesanan disalin");
    } catch {
      toast("Gagal menyalin ID", "error");
    }
  }

  return (
    <div>
      <HeaderZone />
      <PageHeading title="Pesanan" subtitle="Kelola dan pantau pesananmu dengan mudah." />

      <div className="relative mt-[46px]">
        <HeaderLine top="50%" />
        <OrdersToolbar
          status={status}
          onStatusChange={handleStatusChange}
          query={query}
          onQueryChange={setQuery}
        />
      </div>

      <section aria-label="Daftar pesanan" className="mt-5">
        {loading ? (
          <OrdersSkeleton />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-primary-200 bg-primary-50/40 px-6 py-20 text-center dark:border-slate-700 dark:bg-slate-900/40">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-primary-accent shadow-sm dark:bg-slate-900">
              <PackageSearch className="h-6 w-6" />
            </span>
            <p className="mt-5 text-[11px] font-semibold text-ink dark:text-slate-200">
              Belum ada pesanan
            </p>
            <Link
              href="/dashboard"
              className="mt-4 rounded-xl bg-gradient-to-b from-primary-from to-primary-to px-4 py-2.5 text-[10.5px] font-semibold text-white shadow-[0_2px_0_var(--primary-pressed)] transition hover:brightness-105"
            >
              Buat pesanan
            </Link>
          </div>
        ) : (
          <>
            <ul className="space-y-3">
              {shown.map((order, i) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  index={i}
                  selected={selected.has(order.id)}
                  onToggleSelect={toggleSelect}
                  refillState={refills[order.id] ?? "idle"}
                  onRefill={handleRefill}
                  onCancel={setCancelTarget}
                  onReport={setReporting}
                />
              ))}
            </ul>
            {filtered.length > visible ? (
              <div className="mt-5 flex justify-center">
                <button
                  type="button"
                  onClick={() => setVisible((v) => v + PAGE_SIZE)}
                  className="h-9 rounded-xl border border-slate-200 px-5 text-[10px] font-medium text-ink transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
                >
                  Tampilkan lebih banyak
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>

      <SelectionBar
        count={selected.size}
        onCopyIds={copySelectedIds}
        onClear={() => setSelected(new Set())}
      />

      <ReportOrderModal order={reporting} onClose={() => setReporting(null)} />

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        title={`Ajukan pembatalan pesanan #${cancelTarget?.id ?? ""}?`}
        description={
          cancelTarget
            ? `Pembatalan yang kamu ajukan hanya mengembalikan ${cancelTarget.cancelPercent}% dari bagian yang belum terkirim. Sisa ${cancelTarget.remains.toLocaleString("id-ID")} dari ${cancelTarget.quantity.toLocaleString("id-ID")}: jika disetujui admin kamu menerima sekitar ${formatIdr(cancelTarget.cancelRefundPreview)} (dihitung ulang saat disetujui).`
            : ""
        }
        confirmLabel="Ajukan pembatalan"
        tone="primary"
        onConfirm={async () => {
          if (!cancelTarget) return;
          await confirmCancel(cancelTarget);
          setCancelTarget(null);
        }}
      />
    </div>
  );
}
