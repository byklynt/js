import { beforeEach, describe, expect, it } from "vitest";
import { type AdminDb } from "@/lib/admin-data";
import { seedDemoDb as seedAdminDb } from "@/lib/dev/demo-seed";
import {
  createNotification, listNotifications, markAllRead, markRead, notifyAdmins, notifyDeposit, notifyOrderStatus, unreadCount,
} from "../notifications";

const ME = "usr_1000";
const OTHER = "usr_1001";
const now = new Date("2026-11-04T10:00:00Z");
let db: AdminDb;
beforeEach(() => {
  db = seedAdminDb();
  db.notifications = [];
});

const make = (userId: string, n: number, extra: Partial<Parameters<typeof createNotification>[1]> = {}) =>
  createNotification(db, { userId, type: "sistem", title: `T${n}`, body: "b", dedupeKey: `k${n}`, ...extra }, new Date(now.getTime() + n * 1000))!;

describe("unreadCount / markAllRead", () => {
  it("counts only the recipient's unread rows and markAllRead clears just theirs", () => {
    make(ME, 1); make(ME, 2); make(OTHER, 3);
    expect(unreadCount(db, ME)).toBe(2);
    expect(markAllRead(db, ME)).toBe(2);
    expect(unreadCount(db, ME)).toBe(0);
    expect(unreadCount(db, OTHER)).toBe(1);
  });
});

describe("markRead ownership", () => {
  it("marks own notification, refuses somebody else's", () => {
    const mine = make(ME, 1);
    const theirs = make(OTHER, 2);
    expect(markRead(db, ME, mine.id)).toBe(true);
    expect(unreadCount(db, ME)).toBe(0);
    expect(markRead(db, ME, theirs.id)).toBe(false);
    expect(unreadCount(db, OTHER)).toBe(1);
  });
});

describe("dedupe", () => {
  it("ignores the same key for the same recipient but not for another recipient", () => {
    expect(createNotification(db, { userId: ME, type: "pesanan", title: "a", body: "b", dedupeKey: "x" })).not.toBeNull();
    expect(createNotification(db, { userId: ME, type: "pesanan", title: "a", body: "b", dedupeKey: "x" })).toBeNull();
    expect(createNotification(db, { userId: OTHER, type: "pesanan", title: "a", body: "b", dedupeKey: "x" })).not.toBeNull();
    expect(db.notifications).toHaveLength(2);
  });
  it("an order status event notifies once however often it is reported", () => {
    const order = { id: "99", userId: ME, status: "selesai" };
    notifyOrderStatus(db, order, now);
    notifyOrderStatus(db, order, now);
    expect(db.notifications.filter((n) => n.dedupeKey === "order:99:selesai")).toHaveLength(1);
    expect(notifyOrderStatus(db, { ...order, status: "berjalan" }, now)).toBeNull();
  });
  it("deposit ok and failed are separate events", () => {
    notifyDeposit(db, { id: "d1", userId: ME, amount: 10000, ok: false }, now);
    notifyDeposit(db, { id: "d1", userId: ME, amount: 10000, ok: true }, now);
    expect(db.notifications).toHaveLength(2);
  });
});

describe("listNotifications", () => {
  it("is newest first, paginates with a cursor, filters by type and never leaks other recipients", () => {
    for (let i = 1; i <= 5; i++) make(ME, i, { type: i % 2 ? "pesanan" : "refund" });
    make(OTHER, 9);
    const p1 = listNotifications(db, ME, { limit: 2 });
    expect(p1.items.map((x) => x.title)).toEqual(["T5", "T4"]);
    expect(p1.nextCursor).not.toBeNull();
    const p2 = listNotifications(db, ME, { limit: 2, cursor: p1.nextCursor });
    expect(p2.items.map((x) => x.title)).toEqual(["T3", "T2"]);
    const p3 = listNotifications(db, ME, { limit: 2, cursor: p2.nextCursor });
    expect(p3.items.map((x) => x.title)).toEqual(["T1"]);
    expect(p3.nextCursor).toBeNull();
    expect(listNotifications(db, ME, { type: "refund" }).items).toHaveLength(2);
    expect(p1.unread).toBe(5);
  });
});

describe("admins", () => {
  it("notifyAdmins gives every admin their own copy with their own read state", () => {
    const created = notifyAdmins(db, { type: "sistem", title: "x", body: "y", dedupeKey: "adm-1" }, now);
    expect(created).toBeGreaterThanOrEqual(2);
    expect(notifyAdmins(db, { type: "sistem", title: "x", body: "y", dedupeKey: "adm-1" }, now)).toBe(0);
    const first = db.notifications[0];
    markRead(db, first.userId, first.id);
    expect(db.notifications.filter((n) => n.dedupeKey === "adm-1" && n.readAt === null)).toHaveLength(created - 1);
  });
});
