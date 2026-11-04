"use server";

import { z } from "zod";
import { currentUserId } from "@/lib/current-user";
import { getDb } from "@/lib/admin-db";
import { requireAdmin } from "@/lib/auth-server";
import { NOTIFICATION_TYPES, type NotificationPage } from "@/lib/notifications-data";
import { listNotifications, markAllRead, markRead, unreadCount } from "@/lib/server/notifications";
import { persistAdminState } from "@/lib/server/store";

/**
 * Bell actions for the user area ("user") and the admin area ("admin"). The recipient is ALWAYS resolved on the server
 * (the signed-in user, or the admin session): a notification id from the client can only ever match the caller's own rows.
 */
const scopeSchema = z.enum(["user", "admin"]);

async function recipient(scope: unknown): Promise<string | null> {
  const parsed = scopeSchema.safeParse(scope);
  if (!parsed.success) return null;
  if (parsed.data === "admin") {
    try {
      return (await requireAdmin("action")).sub;
    } catch {
      return null;
    }
  }
  return currentUserId();
}

const EMPTY: NotificationPage = { items: [], nextCursor: null, unread: 0 };

export async function listNotificationsAction(scope: unknown, opts: unknown = {}): Promise<NotificationPage> {
  const who = await recipient(scope);
  if (!who) return EMPTY;
  const parsed = z.object({ limit: z.number().int().min(1).max(50).optional(), cursor: z.string().max(60).nullable().optional(), type: z.enum(NOTIFICATION_TYPES as [string, ...string[]]).nullable().optional() }).safeParse(opts);
  const o = parsed.success ? parsed.data : {};
  return listNotifications(getDb(), who, { limit: o.limit, cursor: o.cursor ?? null, type: (o.type as never) ?? null });
}

export async function getUnreadCountAction(scope: unknown): Promise<number> {
  const who = await recipient(scope);
  return who ? unreadCount(getDb(), who) : 0;
}

export async function markReadAction(scope: unknown, id: unknown): Promise<{ ok: boolean; unread: number }> {
  const who = await recipient(scope);
  const parsedId = z.string().min(1).max(60).safeParse(id);
  if (!who || !parsedId.success) return { ok: false, unread: 0 };
  const db = getDb();
  const ok = markRead(db, who, parsedId.data);
  if (ok) persistAdminState(db);
  return { ok, unread: unreadCount(db, who) };
}

export async function markAllReadAction(scope: unknown): Promise<{ changed: number; unread: number }> {
  const who = await recipient(scope);
  if (!who) return { changed: 0, unread: 0 };
  const db = getDb();
  const changed = markAllRead(db, who);
  if (changed) persistAdminState(db);
  return { changed, unread: unreadCount(db, who) };
}
