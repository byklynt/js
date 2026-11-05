/**
 * Announcements for users. ONE source: db.announcements, the same rows /admin/announcements writes.
 * Everything here runs on the server; the client only ever receives PublicAnnouncement (an allow-list), so
 * inactive, scheduled, expired or wrong-audience announcements never leave the server.
 * TODO(db): table `announcements` (+ `announcement_seen(user_id, last_seen_at)`); the filter below becomes a WHERE clause.
 */
import type { AdminDb } from "@/lib/admin-data";
import type { Announcement, AnnouncementPlacement, PublicAnnouncement } from "@/lib/announcements-data";

export type Viewer = { id: string; reseller: boolean };

/** Visible = active, already published, not expired, audience matches the viewer, placement matches. */
export function isVisibleTo(a: Announcement, viewer: Viewer, placement: AnnouncementPlacement, now: Date): boolean {
  if (!a.active) return false;
  if (!a.placements.includes(placement)) return false;
  const t = now.getTime();
  if (new Date(a.publishAt).getTime() > t) return false;
  if (a.expiresAt && new Date(a.expiresAt).getTime() <= t) return false;
  // Resellers see "semua" and "reseller"; everyone else only "semua".
  return a.audience === "semua" || (a.audience === "reseller" && viewer.reseller);
}

const toPublic = (a: Announcement): PublicAnnouncement => ({
  id: a.id, title: a.title, body: a.body, level: a.level, publishAt: a.publishAt, updatedAt: a.updatedAt,
});

export function getVisibleAnnouncements(db: AdminDb, input: { user: Viewer; placement: AnnouncementPlacement; now?: Date }): PublicAnnouncement[] {
  const now = input.now ?? new Date();
  return db.announcements
    .filter((a) => isVisibleTo(a, input.user, input.placement, now))
    .sort((a, b) => (a.publishAt < b.publishAt ? 1 : a.publishAt > b.publishAt ? -1 : 0))
    .map(toPublic);
}

export function viewerOf(db: AdminDb, userId: string): Viewer | null {
  const u = db.users.find((x) => x.id === userId);
  return u ? { id: u.id, reseller: u.reseller } : null;
}

/** How many users would see it (admin note). Counts active accounts that match the audience. */
export function audienceCount(db: AdminDb, audience: Announcement["audience"]): number {
  return db.users.filter((u) => u.status === "aktif" && (audience === "semua" || u.reseller)).length;
}

/** Announcements on the updates page the user has not opened yet (new since their last visit). */
export function unseenCount(db: AdminDb, userId: string, now = new Date()): number {
  const viewer = viewerOf(db, userId);
  if (!viewer) return 0;
  const lastSeen = db.announcementSeen[userId];
  return getVisibleAnnouncements(db, { user: viewer, placement: "pembaruan", now }).filter((a) => !lastSeen || a.updatedAt > lastSeen).length;
}

/** TODO(db): persisted per user; today it lives in the dev store (lib/server/store.ts). */
export function markSeen(db: AdminDb, userId: string, now = new Date()) {
  db.announcementSeen[userId] = now.toISOString();
}
