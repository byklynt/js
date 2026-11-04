/** Announcement model shared by the admin editor, the user dashboard and the updates page. No server code here. */

export type AnnouncementAudience = "semua" | "reseller";
export type AnnouncementPlacement = "dashboard" | "pembaruan";
export type AnnouncementLevel = "info" | "penting" | "peringatan";

/** The stored row (admin side). Mirrors the `announcements` table. */
export type Announcement = {
  id: string;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  placements: AnnouncementPlacement[];
  level: AnnouncementLevel;
  publishAt: string;
  /** Null = never expires. */
  expiresAt: string | null;
  active: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * What a USER may receive. Explicit allow-list: no audience, no active flag, no author. Hidden announcements
 * never reach the client; this shape is built on the server by getVisibleAnnouncements().
 */
export type PublicAnnouncement = {
  id: string;
  title: string;
  body: string;
  level: AnnouncementLevel;
  publishAt: string;
  updatedAt: string;
};

/**
 * Accepts a stored row in the current shape or the legacy one (target / showOnDashboard / showOnUpdates) and returns
 * the current shape, so data persisted before the model change keeps working.
 */
export function normalizeAnnouncement(raw: Record<string, unknown>): Announcement {
  const r = raw as Partial<Announcement> & { target?: AnnouncementAudience; showOnDashboard?: boolean; showOnUpdates?: boolean };
  const placements: AnnouncementPlacement[] = Array.isArray(r.placements)
    ? r.placements
    : [...(r.showOnDashboard ? (["dashboard"] as const) : []), ...(r.showOnUpdates ? (["pembaruan"] as const) : [])];
  const publishAt = r.publishAt ?? new Date(0).toISOString();
  return {
    id: String(r.id ?? ""), title: r.title ?? "", body: r.body ?? "", audience: r.audience ?? r.target ?? "semua",
    placements, level: r.level ?? "info", publishAt, expiresAt: r.expiresAt ?? null, active: r.active ?? true,
    createdBy: r.createdBy ?? "admin", createdAt: r.createdAt ?? publishAt, updatedAt: r.updatedAt ?? r.createdAt ?? publishAt,
  };
}

export const levelLabels: Record<AnnouncementLevel, string> = { info: "Info", penting: "Penting", peringatan: "Peringatan" };
export const placementLabels: Record<AnnouncementPlacement, string> = { dashboard: "Dashboard", pembaruan: "Pembaruan" };
export const audienceLabels: Record<AnnouncementAudience, string> = { semua: "Semua pengguna", reseller: "Khusus reseller" };
