"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Loader2, Search } from "lucide-react";
import type { AdminDeposit, AdminOrder, AdminRefill, AdminTicket, AdminUser, AuditLog } from "@/lib/admin-data";
import type { LedgerEntry } from "@/lib/server/types";
import type { RefundRow } from "@/lib/server/views";
import { loadMoreAction, type ListKind } from "@/lib/admin-list-actions";
import { AdminOrdersView } from "@/components/admin/orders/admin-orders-view";
import { DepositsView } from "@/components/admin/deposits/deposits-view";
import { AdminRefundsView } from "@/components/admin/refills/admin-refunds-view";
import { AdminRefillsView } from "@/components/admin/refills/admin-refills-view";
import { AdminTicketsView } from "@/components/admin/tickets/admin-tickets-view";
import { AdminLedgerView } from "@/components/admin/ledger/admin-ledger-view";
import { LogsView } from "@/components/admin/logs/logs-view";
import { UsersView } from "@/components/admin/users/users-view";

/**
 * A server-paged admin list. The first page comes from the server component; "Muat lebih banyak" asks for the next keyset page and
 * the search box searches the WHOLE table in the database (not just the rows already loaded). The existing view keeps its own
 * quick filters over the rows that are loaded.
 */
type Data = {
  orders: { rows: AdminOrder[]; stuckIds: string[] };
  deposits: { rows: AdminDeposit[] };
  refunds: { rows: RefundRow[] };
  refills: { rows: AdminRefill[] };
  tickets: { rows: AdminTicket[] };
  ledger: { rows: LedgerEntry[]; userNames: Record<string, string> };
  logs: { rows: AuditLog[] };
  users: { rows: AdminUser[]; flaggedIds: string[] };
};
type Page<K extends ListKind> = Data[K] & { next: string | null };
const SEARCHABLE: ListKind[] = ["orders", "deposits", "ledger", "logs", "users"];

export function PagedList<K extends ListKind>({ kind, initial, sync }: { kind: K; initial: Page<K>; sync?: { lastSuccessAt: string | null; stalled: boolean } }) {
  const [state, setState] = useState<Page<K>>(initial);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function fetchPage(cursor: string | null, query: string, append: boolean) {
    start(async () => {
      const res = await loadMoreAction({ kind, cursor, q: query || null });
      if (!res || !res.ok) return setError(res && "error" in res ? res.error : "Data tidak bisa dimuat.");
      setError(null);
      const next = res as unknown as Page<K> & { rows: unknown[] };
      setState((prev) => ({
        ...(next as object),
        rows: append ? [...(prev.rows as unknown[]), ...(next.rows as unknown[])] : next.rows,
        ...(kind === "orders" ? { stuckIds: [...new Set([...(append ? ((prev as unknown as Page<"orders">).stuckIds ?? []) : []), ...((next as unknown as Page<"orders">).stuckIds ?? [])])] } : {}),
        ...(kind === "ledger" ? { userNames: { ...(append ? (prev as unknown as Page<"ledger">).userNames : {}), ...(next as unknown as Page<"ledger">).userNames } } : {}),
        ...(kind === "users" ? { flaggedIds: [...new Set([...(append ? ((prev as unknown as Page<"users">).flaggedIds ?? []) : []), ...((next as unknown as Page<"users">).flaggedIds ?? [])])] } : {}),
      }) as Page<K>);
    });
  }
  const search = (e: FormEvent) => {
    e.preventDefault();
    fetchPage(null, q.trim(), false);
  };

  const s = state as unknown as Page<ListKind> & Record<string, unknown>;
  let view: React.ReactNode;
  switch (kind) {
    case "orders": view = <AdminOrdersView orders={s.rows as AdminOrder[]} stuckIds={(s.stuckIds as string[]) ?? []} sync={sync} />; break;
    case "deposits": view = <DepositsView deposits={s.rows as AdminDeposit[]} />; break;
    case "refunds": view = <AdminRefundsView refunds={s.rows as RefundRow[]} />; break;
    case "refills": view = <AdminRefillsView refills={s.rows as AdminRefill[]} />; break;
    case "tickets": view = <AdminTicketsView tickets={s.rows as AdminTicket[]} />; break;
    case "ledger": view = <AdminLedgerView entries={s.rows as LedgerEntry[]} userNames={(s.userNames as Record<string, string>) ?? {}} />; break;
    case "logs": view = <LogsView logs={s.rows as AuditLog[]} />; break;
    case "users": view = <UsersView users={s.rows as AdminUser[]} flaggedIds={(s.flaggedIds as string[]) ?? []} />; break;
  }

  return (
    <div>
      {SEARCHABLE.includes(kind) ? (
        <form onSubmit={search} className="mb-3 flex items-center gap-2" role="search" aria-label="Cari di seluruh data">
          <div className="relative flex-1 sm:max-w-sm">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari di seluruh data..."
              aria-label="Cari di seluruh data"
              className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-primary-400 dark:border-slate-800 dark:bg-slate-900"
            />
          </div>
          <button type="submit" disabled={pending} className="h-9 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900">
            Cari
          </button>
        </form>
      ) : null}
      {view}
      {error ? <p role="alert" className="mt-3 text-sm text-red-600">{error}</p> : null}
      {s.next ? (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            disabled={pending}
            onClick={() => fetchPage(s.next, q.trim(), true)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Muat lebih banyak
          </button>
        </div>
      ) : null}
    </div>
  );
}
