"use client";

import { useState } from "react";
import { UserRound } from "lucide-react";
import type { AdminDeposit, AdminOrder, AdminUser } from "@/lib/admin-data";
import { addUserNote } from "@/lib/admin-actions";
import { formatDateTime, formatIdr } from "@/lib/balance";
import { formatDate } from "@/lib/format";
import type { LedgerEntry } from "@/lib/server/types";
import { LedgerList } from "@/components/ledger/ledger-list";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { OrderStatusChip } from "@/components/orders/order-status-chip";
import { useAdminRunner } from "../use-admin-runner";
import { DepositStatusChip, RankChip, UserStatusChip } from "../admin-chips";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 first:mt-0">
      <h3 className="mb-2 text-[11px] font-semibold text-ink dark:text-white">{title}</h3>
      {children}
    </section>
  );
}

export function UserDrawer({
  user,
  orders,
  deposits,
  ledger,
  onClose,
}: {
  user: AdminUser | null;
  orders: AdminOrder[];
  deposits: AdminDeposit[];
  ledger: LedgerEntry[];
  onClose: () => void;
}) {
  const run = useAdminRunner();
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState("");
  const [saving, setSaving] = useState(false);

  const userOrders = user ? orders.filter((o) => o.userId === user.id).slice(0, 6) : [];
  const userLedger = user ? ledger.filter((l) => l.userId === user.id).slice(0, 8) : [];
  const userDeposits = user ? deposits.filter((d) => d.userId === user.id).slice(0, 6) : [];

  async function saveNote(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (note.trim().length < 2) {
      setNoteError("Catatan terlalu pendek.");
      return;
    }
    setNoteError("");
    setSaving(true);
    const result = await run(addUserNote({ userId: user.id, text: note }));
    setSaving(false);
    if (result.ok) setNote("");
  }

  return (
    <Drawer open={Boolean(user)} onClose={onClose} title="Detail pengguna" icon={UserRound}>
      {user ? (
        <div>
          <Section title="Profil">
            <dl className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200/70 p-3 text-[10px] dark:border-slate-800">
              <div>
                <dt className="text-[#5B6B8C] dark:text-slate-400">Username</dt>
                <dd className="mt-0.5 text-[11px] font-semibold text-ink dark:text-white">{user.username}</dd>
              </div>
              <div>
                <dt className="text-[#5B6B8C] dark:text-slate-400">Email</dt>
                <dd className="mt-0.5 truncate text-[11px] font-medium text-ink dark:text-white">{user.email}</dd>
              </div>
              <div>
                <dt className="text-[#5B6B8C] dark:text-slate-400">Saldo</dt>
                <dd className="mt-0.5 text-[11px] font-semibold text-ink dark:text-white">{formatIdr(user.balance)}</dd>
              </div>
              <div>
                <dt className="text-[#5B6B8C] dark:text-slate-400">Total belanja</dt>
                <dd className="mt-0.5 text-[11px] font-semibold text-ink dark:text-white">{formatIdr(user.totalSpent)}</dd>
              </div>
              <div>
                <dt className="text-[#5B6B8C] dark:text-slate-400">Peringkat</dt>
                <dd className="mt-1">
                  <RankChip rank={user.rank} />
                </dd>
              </div>
              <div>
                <dt className="text-[#5B6B8C] dark:text-slate-400">Status</dt>
                <dd className="mt-1">
                  <UserStatusChip status={user.status} />
                </dd>
              </div>
              <div className="col-span-2 text-[#5B6B8C] dark:text-slate-400">
                Terdaftar <time dateTime={user.createdAt}>{formatDate(user.createdAt)}</time>
              </div>
            </dl>
          </Section>

          <Section title="Riwayat pesanan">
            {userOrders.length === 0 ? (
              <p className="text-[10px] text-[#5B6B8C] dark:text-slate-400">Belum ada pesanan.</p>
            ) : (
              <ul className="space-y-2">
                {userOrders.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200/70 px-3 py-2 dark:border-slate-800">
                    <div className="min-w-0">
                      <p className="text-[10.5px] font-medium text-ink dark:text-white">#{o.id}</p>
                      <p className="truncate text-[9.5px] text-[#5B6B8C] dark:text-slate-400" title={o.name}>{o.name}</p>
                    </div>
                    <OrderStatusChip status={o.status} />
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Riwayat deposit">
            {userDeposits.length === 0 ? (
              <p className="text-[10px] text-[#5B6B8C] dark:text-slate-400">Belum ada deposit.</p>
            ) : (
              <ul className="space-y-2">
                {userDeposits.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200/70 px-3 py-2 dark:border-slate-800">
                    <div>
                      <p className="text-[10.5px] font-medium text-ink dark:text-white">
                        {formatIdr(d.amount)} - {d.method}
                      </p>
                      <p className="text-[9.5px] text-[#5B6B8C] dark:text-slate-400">{formatDateTime(d.createdAt)}</p>
                    </div>
                    <DepositStatusChip status={d.status} />
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Mutasi saldo">
            {userLedger.length === 0 ? (
              <p className="text-[10px] text-[#5B6B8C] dark:text-slate-400">Belum ada mutasi.</p>
            ) : (
              <LedgerList entries={userLedger} />
            )}
          </Section>

          <Section title="Catatan internal">
            {user.notes.length > 0 ? (
              <ul className="mb-3 space-y-1.5">
                {user.notes.map((n, i) => (
                  <li key={i} className="rounded-xl bg-[#F1F6FB] px-3 py-2 text-[10px] text-ink dark:bg-[#161b20] dark:text-slate-100">
                    {n}
                  </li>
                ))}
              </ul>
            ) : null}
            <form noValidate onSubmit={saveNote} className="space-y-2">
              <Textarea
                label="Tambah catatan"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                error={noteError}
                className="min-h-[64px]"
              />
              <Button type="submit" loading={saving}>
                Simpan catatan
              </Button>
            </form>
          </Section>
        </div>
      ) : null}
    </Drawer>
  );
}
