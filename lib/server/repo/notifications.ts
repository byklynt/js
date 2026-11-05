import "server-only";
import { NOTIFICATION_TYPES, type NotificationPage, type NotificationType, type NotificationView } from "@/lib/notifications-data";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

/**
 * The bell, read side. Every function takes the recipient id and only ever touches that recipient's rows; the id MUST come
 * from the session (never from the client). Created in the same transaction as the event wherever the event is a Postgres
 * function (orders, refunds, deposits); the rest go through repo/notify.ts.
 */
const toView = (n: { id: string; type: string; title: string; body: string; href: string | null; read_at: string | null; created_at: string }): NotificationView => ({
  id: n.id, type: n.type as NotificationType, title: n.title, body: n.body, href: n.href, read: n.read_at !== null, createdAt: n.created_at,
});

export async function unreadCount(userId: string): Promise<number> {
  const { count } = await supabaseAdmin().from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).is("read_at", null);
  return count ?? 0;
}

export async function listNotifications(userId: string, opts: { limit?: number; cursor?: string | null; type?: NotificationType | null } = {}): Promise<NotificationPage> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
  const db = supabaseAdmin();
  let q = db.from("notifications").select("id,type,title,body,href,read_at,created_at").eq("user_id", userId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
  if (opts.type) q = q.eq("type", opts.type);
  if (opts.cursor) {
    const { data: c } = await db.from("notifications").select("created_at").eq("id", opts.cursor).eq("user_id", userId).maybeSingle();
    if (c) q = q.lt("created_at", c.created_at);
  }
  const { data } = await q;
  const rows = data ?? [];
  const page = rows.slice(0, limit);
  return { items: page.map(toView), nextCursor: rows.length > limit ? page[page.length - 1].id : null, unread: await unreadCount(userId) };
}

/** Marks one notification read. A notification of someone else is treated as "not found" (returns false). */
export async function markRead(userId: string, id: string): Promise<boolean> {
  const { data } = await supabaseAdmin().from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).eq("user_id", userId).is("read_at", null).select("id");
  if (data?.length) return true;
  const { data: exists } = await supabaseAdmin().from("notifications").select("id").eq("id", id).eq("user_id", userId).maybeSingle();
  return Boolean(exists);
}

export async function markAllRead(userId: string): Promise<number> {
  const { data } = await supabaseAdmin().from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId).is("read_at", null).select("id");
  return data?.length ?? 0;
}

export const isNotificationType = (v: unknown): v is NotificationType => typeof v === "string" && (NOTIFICATION_TYPES as string[]).includes(v);
