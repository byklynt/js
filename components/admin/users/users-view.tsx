"use client";

import { useEffect, useMemo, useState } from "react";
import { Ban, Crown, Eye, KeyRound, Minus, Plus, ShieldCheck, Users as UsersIcon } from "lucide-react";
import type { AdminDeposit, AdminOrder, AdminUser } from "@/lib/admin-data";
import { loadUserDetailAction } from "@/lib/admin-list-actions";
import { formatDate } from "@/lib/format";
import { formatIdr } from "@/lib/balance";
import { setUserManualApproval,
  adjustBalance,
  resetUserPassword,
  setUserReseller,
  setUserStatus,
} from "@/lib/admin-actions";
import { PageHeader } from "@/components/shell/page-header";
import { DataToolbar } from "@/components/ui/data-toolbar";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ActionMenu } from "@/components/ui/action-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { ListSkeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/ui/pagination";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useListState, useParamFilter } from "@/lib/use-list-state";
import { useAdminRunner } from "../use-admin-runner";
import { RankChip, UserStatusChip } from "../admin-chips";
import { BalanceModal } from "./balance-modal";
import type { LedgerEntry } from "@/lib/server/types";
import { UserDrawer } from "./user-drawer";

type Filter = "semua" | "aktif" | "diblokir" | "reseller" | "review";
const filters: { id: Filter; label: string }[] = [
  { id: "semua", label: "Semua" },
  { id: "aktif", label: "Aktif" },
  { id: "diblokir", label: "Diblokir" },
  { id: "reseller", label: "Reseller" },
  { id: "review", label: "Perlu ditinjau" },
];

type Pending =
  | { kind: "balance"; user: AdminUser; direction: "tambah" | "kurangi" }
  | { kind: "ban"; user: AdminUser }
  | { kind: "unban"; user: AdminUser }
  | { kind: "reset"; user: AdminUser }
  | { kind: "reseller"; user: AdminUser; next: boolean };

function Avatar({ name }: { name: string }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[12px] font-semibold text-primary-accent">
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

export function UsersView({
  users,
  flaggedIds = [],
}: {
  users: AdminUser[];
  flaggedIds?: string[];
}) {
  const run = useAdminRunner();
  const list = useListState<Filter>(useParamFilter<Filter>(filters.map((f) => f.id), "semua"));
  const flagged = useMemo(() => new Set(flaggedIds), [flaggedIds]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [tempPassword, setTempPassword] = useState<{ username: string; password: string } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  // The drawer shows the latest orders / deposits / ledger rows of ONE user: loaded from the server when it opens.
  const [detail, setDetail] = useState<{ id: string; orders: AdminOrder[]; deposits: AdminDeposit[]; ledger: LedgerEntry[] } | null>(null);
  useEffect(() => {
    if (!detailId) return;
    let alive = true;
    void loadUserDetailAction(detailId).then((d) => {
      if (alive && d) setDetail({ id: detailId, ...d });
    });
    return () => {
      alive = false;
    };
  }, [detailId]);
  const loaded = detail && detail.id === detailId ? detail : null;

  const filtered = useMemo(
    () =>
      users.filter((u) => {
        if (list.filter === "aktif" && u.status !== "aktif") return false;
        if (list.filter === "diblokir" && u.status !== "diblokir") return false;
        if (list.filter === "reseller" && !u.reseller) return false;
        if (list.filter === "review" && !flagged.has(u.id)) return false;
        if (!list.debounced) return true;
        return u.username.toLowerCase().includes(list.debounced) || u.email.toLowerCase().includes(list.debounced);
      }),
    [users, list.filter, list.debounced, flagged]
  );
  const shown = filtered.slice(0, list.visible);
  const detailUser = users.find((u) => u.id === detailId) ?? null;

  function menuFor(u: AdminUser) {
    return (
      <ActionMenu
        label={`Aksi untuk ${u.username}`}
        items={[
          { label: "Lihat detail", icon: Eye, onSelect: () => setDetailId(u.id) },
          { label: "Tambah saldo", icon: Plus, onSelect: () => setPending({ kind: "balance", user: u, direction: "tambah" }) },
          { label: "Kurangi saldo", icon: Minus, onSelect: () => setPending({ kind: "balance", user: u, direction: "kurangi" }) },
          u.status === "aktif"
            ? { label: "Blokir", icon: Ban, tone: "danger" as const, onSelect: () => setPending({ kind: "ban", user: u }) }
            : { label: "Aktifkan", icon: ShieldCheck, onSelect: () => setPending({ kind: "unban", user: u }) },
          { label: u.manualApproval ? "Matikan persetujuan manual" : "Wajibkan persetujuan manual", icon: ShieldCheck, onSelect: () => void run(setUserManualApproval({ userId: u.id, manualApproval: !u.manualApproval })) },
          { label: "Reset password", icon: KeyRound, onSelect: () => setPending({ kind: "reset", user: u }) },
          {
            label: u.reseller ? "Cabut reseller" : "Jadikan reseller",
            icon: Crown,
            onSelect: () => setPending({ kind: "reseller", user: u, next: !u.reseller }),
          },
        ]}
      />
    );
  }

  const columns: Column<AdminUser>[] = [
    {
      key: "user",
      header: "Pengguna",
      cell: (u) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={u.username} />
          <span className="font-medium">{u.username}</span>
          {flagged.has(u.id) ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-semibold whitespace-nowrap text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">Perlu ditinjau</span> : null}
          {u.manualApproval ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-medium whitespace-nowrap text-slate-600 dark:bg-slate-800 dark:text-slate-300">Persetujuan manual</span> : null}
        </div>
      ),
    },
    { key: "email", header: "Email", cell: (u) => <span className="text-[#5B6B8C] dark:text-slate-400">{u.email}</span>, hideBelowLg: true },
    { key: "balance", header: "Saldo", cell: (u) => formatIdr(u.balance), className: "whitespace-nowrap" },
    { key: "spent", header: "Total belanja", cell: (u) => formatIdr(u.totalSpent), className: "whitespace-nowrap", hideBelowLg: true },
    { key: "rank", header: "Peringkat", cell: (u) => <RankChip rank={u.rank} /> },
    { key: "status", header: "Status", cell: (u) => <UserStatusChip status={u.status} /> },
    { key: "date", header: "Terdaftar", cell: (u) => <time dateTime={u.createdAt}>{formatDate(u.createdAt)}</time>, className: "whitespace-nowrap", hideBelowLg: true },
    { key: "actions", header: "Aksi", cell: menuFor, className: "w-16 text-right" },
  ];

  return (
    <div>
      <PageHeader title="Pengguna" subtitle="Kelola akun, saldo, dan status pengguna." />

      <DataToolbar
        filter={{ options: filters, value: list.filter, onChange: list.setFilter, ariaLabel: "Filter pengguna" }}
        query={list.query}
        onQueryChange={list.setQuery}
        searchLabel="Cari pengguna berdasarkan username atau email"
      />

      <section aria-label="Daftar pengguna" className="mt-5">
        {list.loading ? (
          <ListSkeleton label="Memuat pengguna" />
        ) : filtered.length === 0 ? (
          <EmptyState icon={UsersIcon} title="Pengguna tidak ditemukan" />
        ) : (
          <>
            <DataTable
              ariaLabel="Tabel pengguna"
              columns={columns}
              rows={shown}
              rowKey={(u) => u.id}
              mobileCard={(u) => (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar name={u.username} />
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-semibold text-ink dark:text-white">{u.username}</p>
                        <p className="truncate text-[10px] text-[#5B6B8C] dark:text-slate-400">{u.email}</p>
                      </div>
                    </div>
                    {menuFor(u)}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <RankChip rank={u.rank} />
                    <UserStatusChip status={u.status} />
                  </div>
                  <p className="text-[10px] text-[#5B6B8C] dark:text-slate-400">
                    Saldo <span className="font-semibold text-ink dark:text-white">{formatIdr(u.balance)}</span> - Belanja{" "}
                    {formatIdr(u.totalSpent)}
                  </p>
                </div>
              )}
            />
            <Pagination total={filtered.length} visible={list.visible} onMore={list.showMore} />
          </>
        )}
      </section>

      <UserDrawer
        user={detailUser}
        orders={loaded?.orders ?? []}
        deposits={loaded?.deposits ?? []}
        ledger={loaded?.ledger ?? []}
        onClose={() => setDetailId(null)}
      />

      <BalanceModal
        target={pending?.kind === "balance" ? pending : null}
        onClose={() => setPending(null)}
        onSubmit={async (values) => {
          const result = await run(adjustBalance(values));
          if (result.ok) setPending(null);
          return result.ok;
        }}
      />

      <ConfirmDialog
        open={pending?.kind === "ban"}
        onClose={() => setPending(null)}
        title={`Blokir ${pending?.user.username ?? ""}?`}
        description="Pengguna tidak akan bisa masuk atau membuat pesanan sampai diaktifkan kembali."
        confirmLabel="Blokir"
        requireText="BLOKIR"
        requirePassword
        onConfirm={async (password) => {
          if (pending?.kind !== "ban") return;
          const result = await run(setUserStatus({ userId: pending.user.id, status: "diblokir", password }));
          if (result.ok) setPending(null);
        }}
      />

      <ConfirmDialog
        open={pending?.kind === "unban"}
        onClose={() => setPending(null)}
        title={`Aktifkan ${pending?.user.username ?? ""}?`}
        description="Akun akan bisa digunakan kembali. Masukkan password adminmu untuk konfirmasi."
        confirmLabel="Aktifkan"
        tone="primary"
        requirePassword
        onConfirm={async (password) => {
          if (pending?.kind !== "unban") return;
          const result = await run(setUserStatus({ userId: pending.user.id, status: "aktif", password }));
          if (result.ok) setPending(null);
        }}
      />

      <Dialog open={Boolean(tempPassword)} onClose={() => setTempPassword(null)} title={`Password sementara ${tempPassword?.username ?? ""}`} description="Salin sekarang. Password ini tidak akan ditampilkan lagi." maxWidth="max-w-sm">
        <p className="rounded-xl bg-slate-100 px-3 py-2 text-center font-mono text-[12px] font-semibold tracking-wide text-ink select-all dark:bg-slate-800 dark:text-white">{tempPassword?.password}</p>
        <div className="mt-4 flex justify-end">
          <Button onClick={() => setTempPassword(null)}>Selesai</Button>
        </div>
      </Dialog>

      <ConfirmDialog
        open={pending?.kind === "reset"}
        onClose={() => setPending(null)}
        title={`Reset password ${pending?.user.username ?? ""}?`}
        description="Password lama diganti password sementara yang hanya ditampilkan sekali. Berikan ke pengguna lewat saluran yang aman; pengiriman email belum tersedia."
        confirmLabel="Buat password sementara"
        tone="primary"
        onConfirm={async () => {
          if (pending?.kind !== "reset") return;
          const result = await run(resetUserPassword({ userId: pending.user.id }));
          if (result.ok) {
            setTempPassword({ username: pending.user.username, password: (result.data as { tempPassword: string }).tempPassword });
            setPending(null);
          }
        }}
      />

      <ConfirmDialog
        open={pending?.kind === "reseller"}
        onClose={() => setPending(null)}
        title={pending?.kind === "reseller" && pending.next ? "Jadikan reseller?" : "Cabut status reseller?"}
        description={`${pending?.user.username ?? ""} akan ${pending?.kind === "reseller" && pending.next ? "mendapat harga reseller" : "kembali ke peringkat Starter"}.`}
        confirmLabel="Ya, lanjutkan"
        tone="primary"
        onConfirm={async () => {
          if (pending?.kind !== "reseller") return;
          const result = await run(setUserReseller({ userId: pending.user.id, reseller: pending.next }));
          if (result.ok) setPending(null);
        }}
      />
    </div>
  );
}
