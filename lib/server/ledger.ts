/**
 * Append-only balance ledger. The ONLY way a user's balance changes is applyLedgerEntry().
 * TODO(db): this is the body of the Postgres function apply_ledger_entry() (SELECT ... FOR UPDATE on
 * the user row, INSERT into balance_ledger, UPDATE users.balance, all in one transaction).
 */
import type { AdminDb } from "@/lib/admin-data";
import { ServiceError } from "./tx";
import type { LedgerEntry, LedgerType } from "./types";

export type LedgerInput = {
  userId: string;
  type: LedgerType;
  /** Signed: credit > 0, debit < 0. */
  amount: number;
  refType: string;
  refId: string;
  note: string;
  createdBy?: string;
  now?: Date;
};

export type LedgerResult = { entry: LedgerEntry; duplicate: boolean };

let counter = 0;

/**
 * Idempotent: UNIQUE(type, ref_type, ref_id). Replaying the same event returns the first entry and
 * does not touch the balance. Debits are rejected when they would take the balance below zero.
 * Must be called inside withTransaction().
 */
export function applyLedgerEntry(db: AdminDb, input: LedgerInput): LedgerResult {
  if (!Number.isInteger(input.amount) || input.amount === 0) {
    throw new ServiceError("Nominal harus bilangan bulat dan tidak boleh nol.", "bad_amount");
  }
  const existing = db.ledger.find((l) => l.type === input.type && l.refType === input.refType && l.refId === input.refId);
  if (existing) return { entry: existing, duplicate: true };

  const user = db.users.find((u) => u.id === input.userId);
  if (!user) throw new ServiceError("Pengguna tidak ditemukan.", "no_user");
  const after = user.balance + input.amount;
  if (input.amount < 0 && after < 0) throw new ServiceError("Saldo tidak cukup.", "insufficient_balance");

  const entry: LedgerEntry = {
    id: `lg_${Date.now().toString(36)}_${++counter}`,
    userId: user.id,
    type: input.type,
    amount: input.amount,
    balanceBefore: user.balance,
    balanceAfter: after,
    refType: input.refType,
    refId: input.refId,
    note: input.note,
    createdBy: input.createdBy ?? "system",
    createdAt: (input.now ?? new Date()).toISOString(),
  };
  user.balance = after;
  db.ledger.unshift(entry);
  return { entry, duplicate: false };
}

export type Mismatch = { userId: string; username: string; stored: number; computed: number; diff: number };

/** Sanity check: recompute every balance from the ledger and report users that disagree. */
export function reconcileBalances(db: AdminDb): Mismatch[] {
  const sums = new Map<string, number>();
  for (const l of db.ledger) sums.set(l.userId, (sums.get(l.userId) ?? 0) + l.amount);
  return db.users
    .map((u) => ({ userId: u.id, username: u.username, stored: u.balance, computed: sums.get(u.id) ?? 0 }))
    .filter((r) => r.stored !== r.computed)
    .map((r) => ({ ...r, diff: r.stored - r.computed }));
}
