/** Notification model shared by the server store, the bell popover and the notification pages. No server code here. */

export type NotificationType = "pesanan" | "refund" | "deposit" | "tiket" | "pembaruan" | "pengumuman" | "sistem";

export const NOTIFICATION_TYPES: NotificationType[] = ["pesanan", "refund", "deposit", "tiket", "pembaruan", "pengumuman", "sistem"];

/** The stored row. Mirrors the `notifications` table (user_id may also be an admin id for the admin bell). */
export type AppNotification = {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  /** One per event and recipient: the same event can never notify twice. */
  dedupeKey: string | null;
  createdAt: string;
};

/** What the browser receives: no user id, no dedupe key. */
export type NotificationView = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  href: string | null;
  read: boolean;
  createdAt: string;
};

export const toView = (n: AppNotification): NotificationView => ({
  id: n.id, type: n.type, title: n.title, body: n.body, href: n.href, read: n.readAt !== null, createdAt: n.createdAt,
});

export type NotificationPage = { items: NotificationView[]; nextCursor: string | null; unread: number };
