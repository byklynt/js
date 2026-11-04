import { beforeEach, describe, expect, it } from "vitest";
import { seedAdminDb, type AdminDb } from "@/lib/admin-data";
import type { Announcement } from "@/lib/announcements-data";
import { applyPersisted, createMemoryStore, persistAdminState } from "../store";
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

describe("audience, seen state and persistence", () => {
  it("counts the users that would see it", () => {
    const resellers = db.users.filter((u) => u.status === "aktif" && u.reseller).length;
    const all = db.users.filter((u) => u.status === "aktif").length;
    expect(audienceCount(db, "reseller")).toBe(resellers);
    expect(audienceCount(db, "semua")).toBe(all);
    expect(all).toBeGreaterThan(resellers);
  });

  it("the unseen badge counts new announcements and clears once the user has opened the updates page", () => {
    db.announcements = [make({ id: "a", placements: ["pembaruan"] }), make({ id: "b", placements: ["dashboard"] })];
    expect(unseenCount(db, "usr_1000", now)).toBe(1); // only the one shown on the updates page
    markSeen(db, "usr_1000", now);
    expect(unseenCount(db, "usr_1000", now)).toBe(0);
    // an edit after the last visit makes it unseen again
    db.announcements[0].updatedAt = "2026-11-05T12:00:00+07:00";
    expect(unseenCount(db, "usr_1000", new Date("2026-11-05T13:00:00+07:00"))).toBe(1);
  });

  it("viewerOf resolves the role from the server-side user record", () => {
    db.users.find((u) => u.id === "usr_1000")!.reseller = true;
    expect(viewerOf(db, "usr_1000")).toEqual({ id: "usr_1000", reseller: true });
    expect(viewerOf(db, "nobody")).toBeNull();
  });

  it("announcements written by the admin survive a restart (shared durable store)", () => {
    const store = createMemoryStore();
    db.announcements = [make({ id: "keep", title: "Tetap ada" })];
    persistAdminState(db, store);
    const reloaded = seedAdminDb();
    applyPersisted(reloaded, store);
    expect(reloaded.announcements.map((a) => a.id)).toEqual(["keep"]);
    expect(getVisibleAnnouncements(reloaded, { user: normal, placement: "dashboard", now }).map((a) => a.title)).toEqual(["Tetap ada"]);
  });
});

describe("legacy rows", () => {
  it("rows saved before the model change (target / showOn*) are converted, not dropped or crashing", () => {
    const legacy = { id: "ann_9", title: "Lama", body: "Isi lama pengumuman.", target: "reseller", showOnDashboard: true, showOnUpdates: false, publishAt: "2026-10-01T00:00:00+07:00", active: true };
    const a = normalizeAnnouncement(legacy);
    expect(a).toMatchObject({ audience: "reseller", placements: ["dashboard"], level: "info", expiresAt: null });
    const store = createMemoryStore({ announcements: [legacy as never] });
    const reloaded = seedAdminDb();
    applyPersisted(reloaded, store);
    expect(getVisibleAnnouncements(reloaded, { user: { id: "u", reseller: true }, placement: "dashboard", now }).map((x) => x.id)).toEqual(["ann_9"]);
    expect(getVisibleAnnouncements(reloaded, { user: { id: "u", reseller: false }, placement: "dashboard", now })).toEqual([]);
  });
});
