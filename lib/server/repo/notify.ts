import "server-only";
import type { NotificationType } from "@/lib/notifications-data";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import type { Json } from "@/lib/supabase/database.types";

export const rupiah = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

export type NewNotification = {
  type: NotificationType;
  title: string;
  body: string;
  href?: string | null;
  /** Same key for the same recipient = ignored. One per event, e.g. `order:123:selesai`. */
  dedupeKey?: string | null;
};

/** One notification for one recipient; a repeated dedupe key is ignored (the event notifies once). */
export async function notifyUser(userId: string, n: NewNotification): Promise<void> {
  const { error } = await supabaseAdmin().from("notifications").upsert(
    { user_id: userId, type: n.type, title: n.title.slice(0, 120), body: n.body.slice(0, 400), href: n.href ?? null, dedupe_key: n.dedupeKey ?? null },
    { onConflict: "user_id,dedupe_key", ignoreDuplicates: true }
  );
  if (error) console.error("[notify]", error.message);
}

/** The same notification for every active admin (each has their own read state). */
export async function notifyAdmins(n: NewNotification): Promise<void> {
  const { data } = await supabaseAdmin().from("profiles").select("id").eq("role", "admin").eq("status", "aktif");
  await Promise.all((data ?? []).map((a) => notifyUser(a.id, n)));
}

const ORDER_TEXT: Record<string, string> = {
  selesai: "selesai",
  sebagian: "selesai sebagian (partial)",
  dibatalkan: "dibatalkan",
  gagal_kirim: "gagal dikirim ke provider",
};

/** An order reached selesai / sebagian / dibatalkan / gagal_kirim. */
export async function notifyOrderStatus(order: { id: number | string; userId: string; status: string }): Promise<void> {
  if (!(order.status in ORDER_TEXT)) return;
  await notifyUser(order.userId, {
    type: "pesanan", title: `Pesanan #${order.id} ${ORDER_TEXT[order.status]}`, body: "Buka halaman pesanan untuk melihat detailnya.",
    href: `/dashboard/orders?search=${order.id}`, dedupeKey: `order:${order.id}:${order.status}`,
  });
}

/** System events (cron, webhook) in the same audit log as admin actions. */
export async function logSystem(action: string, targetType: string, targetId: string, before: unknown, after: unknown): Promise<void> {
  const { error } = await supabaseAdmin().from("audit_logs").insert({
    admin_id: null, admin_name: "sistem", action, target_type: targetType, target_id: targetId, before: (before ?? null) as Json, after: (after ?? null) as Json,
  });
  if (error) console.error("[audit]", error.message);
}
