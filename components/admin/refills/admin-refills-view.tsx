"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Check, CircleCheck, FileText, RefreshCcw, User, X } from "lucide-react";
import type { AdminRefill } from "@/lib/admin-data";
import { refillStatusFilters, type RefillStatus } from "@/lib/refills-data";
import { reviewRefill } from "@/lib/admin-actions";
import { PageHeader } from "@/components/shell/page-header";
import { DataToolbar } from "@/components/ui/data-toolbar";
import { RecordCard } from "@/components/ui/record-card";
import { ChipBody, CopyLinkChip, InfoChip, chipClass, chipFocusClass } from "@/components/ui/info-chip";
import { ActionMenu } from "@/components/ui/action-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { RowsSkeleton } from "@/components/ui/list-states";
import { Pagination } from "@/components/ui/pagination";
import { RefillStatusChip } from "@/components/refill/refill-status-chip";
import { useListState } from "@/lib/use-list-state";
import { useAdminRunner } from "../use-admin-runner";

type RefillFilter = RefillStatus | "semua";

export function AdminRefillsView({ refills }: { refills: AdminRefill[] }) {
  const run = useAdminRunner();
  const list = useListState<RefillFilter>("semua");

  const filtered = useMemo(
    () =>
      refills.filter((r) => {
        if (list.filter !== "semua" && r.status !== list.filter) return false;
        if (!list.debounced) return true;
        const q = list.debounced;
        return r.id.includes(q) || r.orderId.includes(q) || r.username.toLowerCase().includes(q) || r.link.toLowerCase().includes(q) || r.name.toLowerCase().includes(q);
      }),
    [refills, list.filter, list.debounced]
  );
  const shown = filtered.slice(0, list.visible);

  return (
    <div>
      <PageHeader title="Refill" subtitle="Tinjau permintaan refill pengguna." />
      <DataToolbar
        filter={{ options: refillStatusFilters, value: list.filter, onChange: list.setFilter, ariaLabel: "Filter status refill" }}
        query={list.query}
        onQueryChange={list.setQuery}
        searchLabel="Cari refill berdasarkan ID, pesanan, pengguna, atau link"
      />
      <section aria-label="Daftar refill" className="mt-5">
        {list.loading ? (
          <RowsSkeleton label="Memuat refill" tall />
        ) : filtered.length === 0 ? (
          <EmptyState icon={RefreshCcw} title="Belum ada refill" />
        ) : (
          <>
            <ul className="space-y-3">
              {shown.map((r, i) => (
                <RecordCard
                  key={r.id}
                  index={i}
                  platform={r.platform}
                  idLabel={`ID: ${r.id}`}
                  checkboxLabel={`Pilih refill ${r.id}`}
                  selected={false}
                  onToggleSelect={() => {}}
                  name={r.name}
                  dateIso={r.createdAt}
                  status={<RefillStatusChip status={r.status} />}
                  actions={
                    <ActionMenu
                      label={`Aksi untuk refill ${r.id}`}
                      items={[
                        { label: "Setujui", icon: Check, disabled: r.status !== "menunggu", onSelect: () => void run(reviewRefill({ id: r.id, action: "setujui" })) },
                        { label: "Tolak", icon: X, tone: "danger", disabled: r.status !== "menunggu", onSelect: () => void run(reviewRefill({ id: r.id, action: "tolak" })) },
                        { label: "Tandai selesai", icon: CircleCheck, disabled: r.status === "selesai" || r.status === "ditolak", onSelect: () => void run(reviewRefill({ id: r.id, action: "selesai" })) },
                      ]}
                    />
                  }
                >
                  <InfoChip icon={User}>Pengguna: {r.username}</InfoChip>
                  <Link href={`/admin/orders`} aria-label={`Lihat pesanan ${r.orderId}`} className={`${chipClass} ${chipFocusClass}`}>
                    <ChipBody icon={FileText}>Pesanan: {r.orderId}</ChipBody>
                  </Link>
                  <CopyLinkChip link={r.link} />
                </RecordCard>
              ))}
            </ul>
            <Pagination total={filtered.length} visible={list.visible} onMore={list.showMore} />
          </>
        )}
      </section>
    </div>
  );
}
