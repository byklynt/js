import type { AdminDb } from "@/lib/admin-data";

export type UserRisk = { userId: string; orders: number; problems: number; ratioPercent: number; flagged: boolean };

/**
 * Share of a user's orders that ended cancelled or partial, plus refunds they asked for themselves.
 * Flagged only once they have enough orders (small samples are noise) and the share passes the configured limit.
 */
export function userRisk(db: AdminDb, userId: string): UserRisk {
  const orders = db.orders.filter((o) => o.userId === userId);
  const bad = orders.filter((o) => o.status === "dibatalkan" || o.status === "sebagian").length;
  const asked = db.refunds.filter((r) => r.userId === userId && r.source === "user_request").length;
  const problems = bad + asked;
  const ratio = orders.length ? Math.round((problems / orders.length) * 1000) / 10 : 0;
  const { ratioPercent, minOrders } = db.settings.risk;
  return { userId, orders: orders.length, problems, ratioPercent: ratio, flagged: orders.length >= minOrders && ratio > ratioPercent };
}

export const flaggedUsers = (db: AdminDb): UserRisk[] => db.users.map((u) => userRisk(db, u.id)).filter((r) => r.flagged);
