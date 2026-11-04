/**
 * Transaction emulation for the in-memory mock store.
 *
 * Production: every function that moves money is ONE Postgres function (RPC) that runs in a single
 * transaction (see ./schema.sql: apply_ledger_entry, settle_refund, place_order ...). Here the same
 * contract is kept: `withTransaction` snapshots the store, runs the callback, and restores the
 * snapshot if the callback throws, so a failure can never leave a half-applied debit or refund.
 * The callback must be synchronous (no awaits), like a database function.
 */
import type { AdminDb } from "@/lib/admin-data";

type Plain = Record<string, unknown>;
const isObj = (v: unknown): v is Plain => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Put `snap` back into `target` IN PLACE. Existing objects keep their identity (matched by `id` inside
 * arrays), so references held by the caller stay valid after a rollback.
 */
function restore(target: unknown, snap: unknown): unknown {
  if (Array.isArray(target) && Array.isArray(snap)) {
    const byId = new Map<unknown, unknown>();
    for (const item of target) if (isObj(item) && "id" in item) byId.set(item.id, item);
    const next = snap.map((item) => (isObj(item) && "id" in item && byId.has(item.id) ? restore(byId.get(item.id), item) : item));
    target.length = 0;
    target.push(...next);
    return target;
  }
  if (isObj(target) && isObj(snap)) {
    for (const key of Object.keys(target)) if (!(key in snap)) delete target[key];
    for (const key of Object.keys(snap)) target[key] = restore(target[key], snap[key]);
    return target;
  }
  return snap;
}

export function withTransaction<T>(db: AdminDb, fn: () => T): T {
  const snapshot = structuredClone(db);
  try {
    return fn();
  } catch (error) {
    restore(db, snapshot);
    throw error;
  }
}

/** A business rule failed (insufficient balance, refund too large...). Safe to show to the user. */
export class ServiceError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);
  }
}
