import "server-only";
import type { Announcement, AnnouncementPlacement, PublicAnnouncement } from "@/lib/announcements-data";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import type { Tables } from "@/lib/supabase/database.types";

/**
 * Announcements for users, from the `announcements` table the admin writes. Everything runs on the server; the client only
 * receives PublicAnnouncement (an allow-list), so inactive, scheduled, expired or wrong-audience announcements never leave the
 * server. The same visibility rule is also enforced by the RLS policy `announcements_select_visible`.
 */
export type Viewer = { id: string; reseller: boolean };

export async function viewerOf(userId: string): Promise<Viewer | null> {
  const { data } = await supabaseAdmin().from("profiles").select("id,role,status").eq("id", userId).maybeSingle();
  return data && data.status === "aktif" ? { id: data.id, reseller: data.role === "reseller" || data.role === "admin" } : null;
}

const toPublic = (a: Tables<"announcements">): PublicAnnouncement => ({ id: a.id, title: a.title, body: a.body, level: a.level as PublicAnnouncement["level"], publishAt: a.publish_at, updatedAt: a.updated_at });

/** Visible = active, already published, not expired, audience matches the viewer, placement matches. */
export async function getVisibleAnnouncements(input: { user: Viewer; placement: AnnouncementPlacement }): Promise<PublicAnnouncement[]> {
  const now = new Date().toISOString();
  let q = supabaseAdmin().from("announcements").select("*").eq("active", true).contains("placements", [input.placement]).lte("publish_at", now)
    .or(`expires_at.is.null,expires_at.gt.${now}`).order("publish_at", { ascending: false }).limit(50);
  if (!input.user.reseller) q = q.eq("audience", "semua");
  const { data } = await q;
  return (data ?? []).map(toPublic);
}

/** Announcements on the updates page the user has not opened yet (new since their last visit). */
export async function unseenCount(userId: string): Promise<number> {
  const viewer = await viewerOf(userId);
  if (!viewer) return 0;
  const { data: seen } = await supabaseAdmin().from("announcement_reads").select("seen_at").eq("user_id", userId).maybeSingle();
  const list = await getVisibleAnnouncements({ user: viewer, placement: "pembaruan" });
  return list.filter((a) => !seen || a.updatedAt > seen.seen_at).length;
}

export async function markSeen(userId: string): Promise<void> {
  await supabaseAdmin().from("announcement_reads").upsert({ user_id: userId, seen_at: new Date().toISOString() }, { onConflict: "user_id" });
}

/** How many users would see it (admin note). Counts active accounts that match the audience. */
export async function audienceCount(audience: Announcement["audience"]): Promise<number> {
  let q = supabaseAdmin().from("profiles").select("id", { count: "exact", head: true }).eq("status", "aktif");
  if (audience === "reseller") q = q.in("role", ["reseller", "admin"]);
  const { count } = await q;
  return count ?? 0;
}

/** A new (or edited) announcement that is live now notifies the users of its audience once (dedupe key = id + updated_at). */
export async function notifyAnnouncement(a: { id: string; title: string; body: string; audience: string; placements: string[]; active: boolean; publish_at: string; updated_at: string }): Promise<number> {
  if (!a.active || new Date(a.publish_at).getTime() > Date.now()) return 0;
  const db = supabaseAdmin();
  let q = db.from("profiles").select("id").eq("status", "aktif");
  if (a.audience === "reseller") q = q.in("role", ["reseller", "admin"]);
  const { data: users } = await q;
  const href = a.placements.includes("pembaruan") ? "/dashboard/updates" : "/dashboard";
  const rows = (users ?? []).map((u) => ({ user_id: u.id, type: "pengumuman", title: a.title.slice(0, 120), body: a.body.slice(0, 400), href, dedupe_key: `ann:${a.id}:${a.updated_at}` }));
  for (let i = 0; i < rows.length; i += 500) await db.from("notifications").upsert(rows.slice(i, i + 500), { onConflict: "user_id,dedupe_key", ignoreDuplicates: true });
  return rows.length;
}

export type AnnouncementRow = Tables<"announcements">;
export async function listAnnouncements(): Promise<Announcement[]> {
  const { data } = await supabaseAdmin().from("announcements").select("*").order("publish_at", { ascending: false }).limit(200);
  return (data ?? []).map((a) => ({
    id: a.id, title: a.title, body: a.body, audience: a.audience as Announcement["audience"], placements: a.placements as Announcement["placements"], level: a.level as Announcement["level"],
    publishAt: a.publish_at, expiresAt: a.expires_at, active: a.active, createdBy: a.created_by ?? "admin", createdAt: a.created_at, updatedAt: a.updated_at,
  }));
}
