import { beforeEach, describe, expect, it } from "vitest";
import { type AdminDb } from "@/lib/admin-data";
import { seedDemoDb as seedAdminDb } from "@/lib/dev/demo-seed";
import type { Announcement } from "@/lib/announcements-data";
import { normalizeAnnouncement } from "@/lib/announcements-data";
import { audienceCount, getVisibleAnnouncements, markSeen, unseenCount, viewerOf } from "../announcements";

const now = new Date("2026-11-05T10:00:00+07:00");
const normal = { id: "usr_1000", reseller: false };
const reseller = { id: "usr_1001", reseller: true };

const make = (over: Partial<Announcement>): Announcement => ({
  id: "ann_x", title: "Uji", body: "Isi pengumuman uji.", audience: "semua", placements: ["dashboard"], level: "info",
  publishAt: "2026-11-01T00:00:00+07:00", expiresAt: null, active: true, createdBy: "admin",
  createdAt: "2026-11-01T00:00:00+07:00", updatedAt: "2026-11-01T00:00:00+07:00", ...over,
});

let db: AdminDb;
beforeEach(() => {
  db = seedAdminDb();
  db.announcements = [];
});
const visible = (viewer = normal, placement: "dashboard" | "pembaruan" = "dashboard") => getVisibleAnnouncements(db, { user: viewer, placement, now }).map((a) => a.id);

describe("getVisibleAnnouncements", () => {
  it("shows an active, published, non-expired announcement", () => {
    db.announcements = [make({ id: "a" })];
    expect(visible()).toEqual(["a"]);
  });

  it("hides inactive announcements", () => {
    db.announcements = [make({ id: "a", active: false })];
    expect(visible()).toEqual([]);
  });

  it("hides announcements that are scheduled for the future", () => {
    db.announcements = [make({ id: "a", publishAt: "2026-11-05T10:00:01+07:00" }), make({ id: "b", publishAt: "2026-12-01T00:00:00+07:00" })];
    expect(visible()).toEqual([]);
    // exactly at publish time it is visible
    db.announcements = [make({ id: "c", publishAt: "2026-11-05T10:00:00+07:00" })];
    expect(visible()).toEqual(["c"]);
  });

  it("hides expired announcements (expiry is exclusive)", () => {
    db.announcements = [make({ id: "a", expiresAt: "2026-11-04T00:00:00+07:00" }), make({ id: "b", expiresAt: "2026-11-05T10:00:00+07:00" }), make({ id: "c", expiresAt: "2026-11-06T00:00:00+07:00" })];
    expect(visible()).toEqual(["c"]);
  });

  it("hides reseller-only announcements from normal users and shows them to resellers", () => {
    db.announcements = [make({ id: "r", audience: "reseller" }), make({ id: "s", audience: "semua", publishAt: "2026-10-01T00:00:00+07:00" })];
    expect(visible(normal)).toEqual(["s"]);
    expect(visible(reseller).sort()).toEqual(["r", "s"]); // resellers see both audiences
  });

  it("filters by placement", () => {
    db.announcements = [make({ id: "d", placements: ["dashboard"] }), make({ id: "p", placements: ["pembaruan"] }), make({ id: "b", placements: ["dashboard", "pembaruan"] })];
    expect(visible(normal, "dashboard").sort()).toEqual(["b", "d"]);
    expect(visible(normal, "pembaruan").sort()).toEqual(["b", "p"]);
  });

  it("sorts by publish date, newest first", () => {
    db.announcements = [
      make({ id: "old", publishAt: "2026-10-01T00:00:00+07:00" }),
      make({ id: "new", publishAt: "2026-11-04T00:00:00+07:00" }),
      make({ id: "mid", publishAt: "2026-10-20T00:00:00+07:00" }),
    ];
    expect(visible()).toEqual(["new", "mid", "old"]);
  });

  it("returns only the public allow-list (no audience, active flag or author)", () => {
    db.announcements = [make({ id: "a", level: "penting" })];
    const [item] = getVisibleAnnouncements(db, { user: normal, placement: "dashboard", now });
    expect(Object.keys(item).sort()).toEqual(["body", "id", "level", "publishAt", "title", "updatedAt"]);
    expect(JSON.stringify(item)).not.toContain("admin");
  });

  it("the seeded data behaves: inactive and reseller-only are hidden from the mock user", () => {
    const seeded = seedAdminDb();
    const ids = getVisibleAnnouncements(seeded, { user: normal, placement: "pembaruan", now }).map((a) => a.id);
    expect(ids).toContain("ann_1");
    expect(ids).not.toContain("ann_3"); // reseller only
    expect(ids).not.toContain("ann_4"); // inactive
  });
});
