import type { AdminDb } from "@/lib/admin-data";

/** Balance mismatches computed by Postgres (verify_balances) for an admin snapshot. A snapshot holds only a window of the ledger, so it cannot recompute them itself. */
export type BalanceMismatch = { userId: string; username: string; stored: number; computed: number; diff: number };

const mismatches = new WeakMap<AdminDb, BalanceMismatch[]>();

export const setSnapshotBalanceMismatches = (db: AdminDb, list: BalanceMismatch[]) => void mismatches.set(db, list);
export const snapshotBalanceMismatches = (db: AdminDb): BalanceMismatch[] | undefined => mismatches.get(db);
