/**
 * In-app notifications (the bell). One store: db.notifications, kept in the dev store, so the bell never depends on
 * client-only state. Every read/write takes the recipient id and only ever touches that recipient's rows.
 * TODO(db): table `notifications` (+ unique (user_id, dedupe_key)); the filters below become WHERE clauses.
 * TODO(realtime): the bell polls unreadCount every 30s; swap for SSE / websocket.
 */
import { mockAdminAccounts, type AdminDb } from "@/lib/admin-data";
import { NOTIFICATION_TYPES, toView, type AppNotification, type NotificationPage, type NotificationType } from "@/lib/notifications-data";

export const rupiah = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

export type NewNotification = {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  href?: string | null;
  /** Same key for the same recipient = ignored. Use one per event, e.g. `order:123:selesai`. */
  dedupeKey?: string | null;
};

let counter = 0;

/** Creates a notification unless the recipient already has one with the same dedupe key. Returns null for a duplicate. */
export function createNotification(db: AdminDb, input: NewNotification, now = new Date()): AppNotification | null {
  if (input.dedupeKey && db.notifications.some((n) => n.userId === input.userId && n.dedupeKey === input.dedupeKey)) return null;
  const n: AppNotification = {
    id: `nt_${now.getTime().toString(36)}_${++counter}`, userId: input.userId, type: input.type, title: input.title.slice(0, 120),
    body: input.body.slice(0, 400), href: input.href ?? null, readAt: null, dedupeKey: input.dedupeKey ?? null, createdAt: now.toISOString(),
  };
  db.notifications.unshift(n);
  // Keep the table small: the newest 300 per recipient is plenty for a bell.
  const mine = db.notifications.filter((x) => x.userId === input.userId);
  if (mine.length > 300) {
    const drop = new Set(mine.slice(300).map((x) => x.id));
    db.notifications = db.notifications.filter((x) => !drop.has(x.id));
  }
  return n;
}

/** The same notification for every admin account (each admin has their own read state). */
export function notifyAdmins(db: AdminDb, input: Omit<NewNotification, "userId">, now = new Date()): number {
  let created = 0;
  for (const admin of mockAdminAccounts) {
    if (createNotification(db, { ...input, userId: admin.id, dedupeKey: input.dedupeKey ? `${input.dedupeKey}` : null }, now)) created++;
  }
  return created;
}

export function listNotifications(
  db: AdminDb, userId: string, opts: { limit?: number; cursor?: string | null; type?: NotificationType | null } = {}
): NotificationPage {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
  const mine = db.notifications
    .filter((n) => n.userId === userId && (!opts.type || n.type === opts.type))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  const start = opts.cursor ? mine.findIndex((n) => n.id === opts.cursor) + 1 : 0;
  const slice = mine.slice(start, start + limit);
  const nextCursor = start + limit < mine.length ? slice[slice.length - 1]?.id ?? null : null;
  return { items: slice.map(toView), nextCursor, unread: unreadCount(db, userId) };
}

export const unreadCount = (db: AdminDb, userId: string): number => db.notifications.filter((n) => n.userId === userId && n.readAt === null).length;

/** Marks one notification read. A notification of someone else is treated as "not found" (returns false). */
export function markRead(db: AdminDb, userId: string, id: string, now = new Date()): boolean {
  const n = db.notifications.find((x) => x.id === id && x.userId === userId);
  if (!n) return false;
  if (n.readAt === null) n.readAt = now.toISOString();
  return true;
}

export function markAllRead(db: AdminDb, userId: string, now = new Date()): number {
  let changed = 0;
  for (const n of db.notifications) {
    if (n.userId === userId && n.readAt === null) {
      n.readAt = now.toISOString();
      changed++;
    }
  }
  return changed;
}

export const isNotificationType = (v: unknown): v is NotificationType => typeof v === "string" && (NOTIFICATION_TYPES as string[]).includes(v);

// ---------------------------------------------------------------------------
// Audit log helper kept here for the system jobs (cron, webhook)
// ---------------------------------------------------------------------------

/** System events (cron, webhook) in the same audit log as admin actions. TODO(db): audit_logs table. */
export function logSystem(db: AdminDb, action: string, targetType: string, targetId: string, before: unknown, after: unknown, now = new Date()) {
  db.auditLogs.unshift({
    id: `log_${now.getTime().toString(36)}_${db.auditLogs.length}`, at: now.toISOString(), adminId: "system", adminName: "sistem",
    action, targetType, targetId, before, after,
  });
}

// ---------------------------------------------------------------------------
// Event helpers: one place for the wording and the dedupe key of each event
// ---------------------------------------------------------------------------

const ORDER_TEXT: Record<string, string> = {
  selesai: "selesai",
  sebagian: "selesai sebagian (partial)",
  dibatalkan: "dibatalkan",
  gagal_kirim: "gagal dikirim ke provider",
};

/** An order reached selesai / sebagian / dibatalkan / gagal_kirim. */
export function notifyOrderStatus(db: AdminDb, order: { id: string; userId: string; status: string }, now = new Date()) {
  if (!(order.status in ORDER_TEXT)) return null;
  return createNotification(
    db,
    { userId: order.userId, type: "pesanan", title: `Pesanan #${order.id} ${ORDER_TEXT[order.status]}`, body: "Buka halaman pesanan untuk melihat detailnya.", href: `/dashboard/orders?search=${order.id}`, dedupeKey: `order:${order.id}:${order.status}` },
    now
  );
}

export function notifyRefund(db: AdminDb, input: { id: string; userId: string; orderId: string; amount: number }, now = new Date()) {
  return createNotification(
    db,
    { userId: input.userId, type: "refund", title: `Refund ${rupiah(input.amount)} masuk`, body: `Refund untuk pesanan #${input.orderId} sudah masuk ke saldomu.`, href: "/dashboard/refunds", dedupeKey: `refund:${input.id}` },
    now
  );
}

export function notifyDeposit(db: AdminDb, input: { id: string; userId: string; amount: number; ok: boolean; bonus?: number }, now = new Date()) {
  return createNotification(
    db,
    {
      userId: input.userId, type: "deposit",
      title: input.ok ? `Deposit ${rupiah(input.amount)} berhasil` : `Deposit ${rupiah(input.amount)} gagal`,
      body: input.ok ? `Saldomu bertambah${input.bonus ? ` termasuk bonus ${rupiah(input.bonus)}` : ""}.` : "Deposit tidak dapat diproses. Hubungi support jika kamu sudah membayar.",
      href: "/dashboard/add-funds", dedupeKey: `deposit:${input.id}:${input.ok ? "ok" : "gagal"}`,
    },
    now
  );
}

/** Generic message to a user (support replies, request outcomes). */
export function notifyUser(db: AdminDb, userId: string, input: Omit<NewNotification, "userId">, now = new Date()) {
  return createNotification(db, { ...input, userId }, now);
}
