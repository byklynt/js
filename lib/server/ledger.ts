import type { AdminDb } from "@/lib/admin-data";

/**
 * Balance writes happen ONLY in Postgres (apply_ledger_entry). This file keeps the pure reconcile check for AdminDb values that
 * hold the WHOLE ledger (unit tests, fixtures). In the app the same
 * check is done by verify_balances() in Postgres (dashboard, sanity job).
 */
export type Mismatch = { userId: string; username: string; stored: number; computed: number; diff: number };

export function reconcileBalances(db: AdminDb): Mismatch[] {
  const sums = new Map<string, number>();
  for (const l of db.ledger) sums.set(l.userId, (sums.get(l.userId) ?? 0) + l.amount);
  return db.users
    .map((u) => ({ userId: u.id, username: u.username, stored: u.balance, computed: sums.get(u.id) ?? 0 }))
    .filter((r) => r.stored !== r.computed)
    .map((r) => ({ ...r, diff: r.stored - r.computed }));
}
