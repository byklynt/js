import { beforeEach, describe, expect, it } from "vitest";
import { seedAdminDb, type AdminDb } from "@/lib/admin-data";
import { createRateLimiter } from "../limits";
import {
  canReopen, closeOwnTicket, createUserTicket, findOwnTicket, listOwnTickets, markTicketRead, reopenOwnTicket, replyAsAdmin, replyAsUser,
  sanitizeMessage, toUserTicket, unreadCount, validateFiles, type IncomingFile,
} from "../tickets";
import { ServiceError } from "../tx";

const ME = "usr_1000";
const OTHER = "usr_1001";
const now = new Date("2026-11-04T10:00:00Z");
const input = { category: "Pesanan", subcategory: "Refill", orderIds: ["7112481"], message: "Mohon refill pesanan saya, followers turun.", files: [] as IncomingFile[] };
const png = (over: Partial<IncomingFile> = {}): IncomingFile => ({ name: "bukti.png", size: 1000, type: "image/png", url: "data:image/png;base64,AA==", ...over });

let db: AdminDb;
beforeEach(() => {
  db = seedAdminDb();
});

describe("create", () => {
  it("returns the new id and the redirect target, with status menunggu and the form message as first message", () => {
    const { id, redirectTo } = createUserTicket(db, ME, { ...input, files: [png()] }, { now, limiter: createRateLimiter() });
    expect(redirectTo).toBe(`/dashboard/tickets/${id}`);
    const t = findOwnTicket(db, ME, id)!;
    expect(t.status).toBe("menunggu");
    expect(t.title).toBe("Pesanan - Refill");
    expect(t.messages).toHaveLength(1);
    expect(t.messages[0]).toMatchObject({ from: "user", text: input.message });
    expect(t.messages[0].attachments).toHaveLength(1);
    expect(t.orderIds).toEqual(["7112481"]);
    // appears in the history list straight away
    expect(listOwnTickets(db, ME, now).some((x) => x.id === id)).toBe(true);
  });

  it("ids are unique and increasing", () => {
    const a = createUserTicket(db, ME, input, { now, limiter: createRateLimiter() }).id;
    const b = createUserTicket(db, ME, input, { now, limiter: createRateLimiter() }).id;
    expect(Number(b)).toBeGreaterThan(Number(a));
  });

  it("a category without subcategory-specific title uses the category name only", () => {
    const { id } = createUserTicket(db, ME, { ...input, category: "Lainnya", subcategory: "Lainnya", orderIds: [] }, { now, limiter: createRateLimiter() });
    expect(findOwnTicket(db, ME, id)!.title).toBe("Lainnya");
  });

  it("rejects bad input: unknown category, short message, bad order ids, bad files", () => {
    const l = () => ({ now, limiter: createRateLimiter() });
    expect(() => createUserTicket(db, ME, { ...input, category: "Hack" }, l())).toThrow(ServiceError);
    expect(() => createUserTicket(db, ME, { ...input, message: "pendek" }, l())).toThrow(/minimal 10/);
    expect(() => createUserTicket(db, ME, { ...input, orderIds: ["abc"] }, l())).toThrow(/ID pesanan/);
    expect(() => createUserTicket(db, ME, { ...input, files: [png({ type: "text/html" })] }, l())).toThrow(/PNG, JPG/);
  });

  it("rate limits ticket creation per user", () => {
    db.settings.limits.ticketsPerHour = 2;
    const limiter = createRateLimiter();
    createUserTicket(db, ME, input, { now, limiter });
    createUserTicket(db, ME, input, { now, limiter });
    expect(() => createUserTicket(db, ME, input, { now, limiter })).toThrow(/Terlalu banyak tiket/);
    expect(() => createUserTicket(db, OTHER, input, { now, limiter })).not.toThrow(); // other users are unaffected
  });
});

describe("ownership", () => {
  it("another user's ticket looks like it does not exist, for reading and for replying", () => {
    const { id } = createUserTicket(db, ME, input, { now, limiter: createRateLimiter() });
    expect(findOwnTicket(db, OTHER, id)).toBeNull();
    expect(listOwnTickets(db, OTHER, now).some((t) => t.id === id)).toBe(false);
    expect(() => replyAsUser(db, OTHER, id, { message: "halo", files: [] }, { now, limiter: createRateLimiter() })).toThrow(/tidak ditemukan/);
    expect(() => closeOwnTicket(db, OTHER, id, now)).toThrow(/tidak ditemukan/);
    expect(() => reopenOwnTicket(db, OTHER, id, now)).toThrow(/tidak ditemukan/);
    expect(markTicketRead(db, OTHER, id)).toBe(unreadCount(db, OTHER)); // no effect on someone else's ticket
    expect(findOwnTicket(db, ME, "999999999")).toBeNull();
  });

  it("what a user sees never contains internal notes or the assignee", () => {
    const withNotes = db.tickets.find((t) => t.internalNotes.length > 0)!;
    withNotes.assignee = "admin";
    const view = toUserTicket(withNotes, now) as Record<string, unknown>;
    expect(view).not.toHaveProperty("internalNotes");
    expect(view).not.toHaveProperty("assignee");
    expect(view).not.toHaveProperty("userId");
    expect(JSON.stringify(view)).not.toContain(withNotes.internalNotes[0].text);
  });
});

describe("replies", () => {
  it("a user reply is appended and sets the status to menunggu", () => {
    const t = db.tickets.find((x) => x.userId === ME && x.status === "dibalas")!;
    const before = t.messages.length;
    const m = replyAsUser(db, ME, t.id, { message: "Terima kasih, masih turun.", files: [] }, { now, limiter: createRateLimiter() });
    expect(t.messages).toHaveLength(before + 1);
    expect(m.from).toBe("user");
    expect(t.status).toBe("menunggu");
  });

  it("a closed ticket rejects replies", () => {
    const t = db.tickets.find((x) => x.userId === ME && x.status === "dibalas")!;
    closeOwnTicket(db, ME, t.id, now);
    expect(() => replyAsUser(db, ME, t.id, { message: "halo", files: [] }, { now, limiter: createRateLimiter() })).toThrow(/sudah ditutup/);
    expect(t.status).toBe("ditutup");
  });

  it("validates the message: empty, too long, and plain text only", () => {
    const t = db.tickets.find((x) => x.userId === ME && x.status === "dibalas")!;
    const l = () => ({ now, limiter: createRateLimiter() });
    expect(() => replyAsUser(db, ME, t.id, { message: "   ", files: [] }, l())).toThrow(/tidak boleh kosong/);
    expect(() => replyAsUser(db, ME, t.id, { message: "x".repeat(2001), files: [] }, l())).toThrow(/maksimal 2000/);
    const m = replyAsUser(db, ME, t.id, { message: "<script>alert(1)</script>\u0000halo", files: [] }, l());
    expect(m.text).toBe("<script>alert(1)</script>halo"); // stored as text; the UI renders text, never HTML
    expect(sanitizeMessage("a\r\nb\u0007c")).toBe("a\nbc");
  });

  it("rate limits replies", () => {
    const t = db.tickets.find((x) => x.userId === ME && x.status === "dibalas")!;
    const limiter = createRateLimiter();
    for (let i = 0; i < 30; i++) replyAsUser(db, ME, t.id, { message: `balasan ${i}`, files: [] }, { now, limiter });
    expect(() => replyAsUser(db, ME, t.id, { message: "satu lagi", files: [] }, { now, limiter })).toThrow(/Terlalu banyak balasan/);
  });

  it("file rules: type, size, count", () => {
    expect(() => validateFiles([png({ type: "image/gif" })])).toThrow(/PNG, JPG/);
    expect(() => validateFiles([png({ size: 5 * 1024 * 1024 + 1 })])).toThrow(/5 MB/);
    expect(() => validateFiles([png(), png(), png(), png()])).toThrow(/Maksimal 3/);
    expect(validateFiles([png(), png({ name: "a.pdf", type: "application/pdf" })])).toHaveLength(2);
  });
});

describe("unread badge", () => {
  it("opening a ticket clears its dot and lowers the badge by one", () => {
    const unread = db.tickets.filter((t) => t.userId === ME && t.unread);
    expect(unread.length).toBeGreaterThan(1);
    const total = unreadCount(db, ME);
    expect(markTicketRead(db, ME, unread[0].id)).toBe(total - 1);
    expect(unread[0].unread).toBe(false);
    // opening it again changes nothing
    expect(markTicketRead(db, ME, unread[0].id)).toBe(total - 1);
  });
});

describe("admin reply", () => {
  it("sets the status to Dibalas, flags it unread for the user and shows in the user's view", () => {
    const { id } = createUserTicket(db, ME, input, { now, limiter: createRateLimiter() });
    const before = unreadCount(db, ME);
    const m = replyAsAdmin(db, id, { message: "Refill sudah kami ajukan." }, now);
    const t = findOwnTicket(db, ME, id)!;
    expect(m.from).toBe("support");
    expect(t.status).toBe("dibalas");
    expect(t.unread).toBe(true);
    expect(unreadCount(db, ME)).toBe(before + 1);
    expect(toUserTicket(t, now).messages.at(-1)?.text).toBe("Refill sudah kami ajukan.");
    expect(db.notifications.some((n) => n.userId === ME && n.type === "tiket" && n.title.includes(id))).toBe(true);
  });

  it("works on a ticket that was waiting, and rejects unknown tickets and empty replies", () => {
    expect(() => replyAsAdmin(db, "000", { message: "halo" }, now)).toThrow(/tidak ditemukan/);
    const t = db.tickets.find((x) => x.status === "menunggu")!;
    expect(() => replyAsAdmin(db, t.id, { message: " " }, now)).toThrow(/tidak boleh kosong/);
    replyAsAdmin(db, t.id, { message: "Sedang kami cek." }, now);
    expect(t.status).toBe("dibalas");
  });
});

describe("close and reopen", () => {
  it("reopen only while the last support reply is under 7 days old", () => {
    const t = db.tickets.find((x) => x.userId === ME && x.status === "dibalas")!;
    closeOwnTicket(db, ME, t.id, now);
    expect(t.status).toBe("ditutup");
    const lastReply = t.messages.filter((m) => m.from === "support").at(-1)!;
    const recent = new Date(new Date(lastReply.at).getTime() + 2 * 86_400_000);
    const old = new Date(new Date(lastReply.at).getTime() + 8 * 86_400_000);
    expect(canReopen(t, recent)).toBe(true);
    expect(canReopen(t, old)).toBe(false);
    expect(() => reopenOwnTicket(db, ME, t.id, old)).toThrow(/terlalu lama/);
    reopenOwnTicket(db, ME, t.id, recent);
    expect(t.status).toBe("menunggu");
  });

  it("a ticket without any support reply cannot be reopened", () => {
    const { id } = createUserTicket(db, ME, input, { now, limiter: createRateLimiter() });
    closeOwnTicket(db, ME, id, now);
    expect(canReopen(findOwnTicket(db, ME, id)!, now)).toBe(false);
  });
});
