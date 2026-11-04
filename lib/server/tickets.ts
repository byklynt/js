/**
 * Ticket logic shared by the user area and /admin/tickets. Pure over `db` (testable); the server actions in
 * lib/ticket-actions.ts and lib/admin-actions.ts add authentication and validation on top.
 *
 * Rules: a user can only read and reply to their own tickets; a closed ticket takes no replies; the user's reply
 * sets the status to "menunggu"; an admin reply sets "dibalas" and flags the ticket unread for the user; internal
 * admin notes and the assignee never reach the user (see toUserTicket).
 */
import type { AdminDb, AdminTicket } from "@/lib/admin-data";
import {
  allowedAttachmentTypes, maxAttachmentBytes, maxAttachments, maxMessageLength, REOPEN_WINDOW_MS, ticketCategories, ticketSubcategories,
  type Ticket, type TicketAttachment, type TicketMessage,
} from "@/lib/tickets-data";
import { sharedLimiter, type RateLimiter } from "./limits";
import { sendAlert } from "./notify";
import { notifyAdmins, notifyUser } from "./notifications";
import { ServiceError } from "./tx";

export type IncomingFile = { name: string; size: number; type: string; url: string };

/** TODO(infra): replies per user per hour; shared in-memory limiter for now. */
export const REPLIES_PER_HOUR = 30;

/** Plain text only: no HTML is ever rendered, but control characters and absurd whitespace are removed anyway. */
export function sanitizeMessage(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

export function validateMessage(text: string): string {
  const clean = sanitizeMessage(text);
  if (clean.length < 1) throw new ServiceError("Pesan tidak boleh kosong.", "empty_message");
  if (clean.length > maxMessageLength) throw new ServiceError(`Pesan maksimal ${maxMessageLength} karakter.`, "message_too_long");
  return clean;
}

export function validateFiles(files: IncomingFile[]): IncomingFile[] {
  if (files.length > maxAttachments) throw new ServiceError(`Maksimal ${maxAttachments} file.`, "too_many_files");
  for (const f of files) {
    if (!allowedAttachmentTypes.includes(f.type)) throw new ServiceError(`${f.name}: format harus PNG, JPG, atau PDF.`, "bad_file_type");
    if (f.size > maxAttachmentBytes) throw new ServiceError(`${f.name}: ukuran maksimal 5 MB.`, "file_too_large");
    if (f.size <= 0) throw new ServiceError(`${f.name}: file kosong.`, "empty_file");
  }
  return files;
}

const toAttachments = (idBase: string, files: IncomingFile[]): TicketAttachment[] =>
  files.map((f, i) => ({ id: `${idBase}-f${i + 1}`, name: f.name.slice(0, 120), size: f.size, type: f.type, url: f.url }));

/** What a user may see: no internal notes, no assignee, no other user's ID. */
export type UserTicket = Ticket & { closedReopenable: boolean };

export function lastSupportReplyAt(t: Ticket): string | null {
  const replies = t.messages.filter((m) => m.from === "support");
  return replies.length ? replies[replies.length - 1].at : null;
}

/** "Buka kembali" only if the last support reply is under 7 days old. */
export function canReopen(t: Ticket, now = new Date()): boolean {
  if (t.status !== "ditutup") return false;
  const last = lastSupportReplyAt(t);
  return Boolean(last) && now.getTime() - new Date(last as string).getTime() < REOPEN_WINDOW_MS;
}

export function toUserTicket(t: AdminTicket, now = new Date()): UserTicket {
  return {
    id: t.id, title: t.title, status: t.status, updatedAt: t.updatedAt, unread: t.unread, orderIds: t.orderIds,
    messages: t.messages.map((m) => ({ ...m, attachments: m.attachments?.map((a) => ({ ...a })) })),
    closedReopenable: canReopen(t, now),
  };
}

/** Ownership check: someone else's ticket looks exactly like a ticket that does not exist. */
export function findOwnTicket(db: AdminDb, userId: string, id: string): AdminTicket | null {
  const t = db.tickets.find((x) => x.id === id);
  return t && t.userId === userId ? t : null;
}

export function listOwnTickets(db: AdminDb, userId: string, now = new Date()): UserTicket[] {
  return db.tickets
    .filter((t) => t.userId === userId)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .map((t) => toUserTicket(t, now));
}

export function unreadCount(db: AdminDb, userId: string): number {
  return db.tickets.filter((t) => t.userId === userId && t.unread).length;
}

export type CreateTicketInput = { category: string; subcategory: string; orderIds: string[]; message: string; files: IncomingFile[] };

/** Creates a ticket (status "menunggu", first message = the form message) and returns its id and redirect target. */
export function createUserTicket(
  db: AdminDb, userId: string, input: CreateTicketInput, deps: { now?: Date; limiter?: RateLimiter } = {}
): { id: string; redirectTo: string } {
  const now = deps.now ?? new Date();
  const user = db.users.find((u) => u.id === userId);
  if (!user) throw new ServiceError("Pengguna tidak ditemukan.", "no_user");
  const category = ticketCategories.find((c) => c.label === input.category);
  if (!category) throw new ServiceError("Kategori tidak valid.", "bad_category");
  if (!ticketSubcategories[category.value].includes(input.subcategory)) throw new ServiceError("Subkategori tidak valid.", "bad_subcategory");
  const message = validateMessage(input.message);
  if (message.length < 10) throw new ServiceError("Pesan minimal 10 karakter.", "message_too_short");
  const files = validateFiles(input.files);
  const orderIds = input.orderIds.map((s) => s.trim()).filter(Boolean);
  if (orderIds.some((o) => !/^\d{1,12}$/.test(o)) || orderIds.length > 10) throw new ServiceError("ID pesanan tidak valid.", "bad_order_ids");

  const limit = (deps.limiter ?? sharedLimiter).hit(`ticket:${userId}`, db.settings.limits.ticketsPerHour, 3_600_000, now.getTime());
  if (!limit.allowed) throw new ServiceError(`Terlalu banyak tiket. Coba lagi dalam ${Math.ceil(limit.retryAfterSec / 60)} menit.`, "rate_limited");

  const id = String(Math.max(127_299, ...db.tickets.map((t) => Number(t.id) || 0)) + 1);
  const title = input.subcategory === input.category ? input.category : `${input.category} - ${input.subcategory}`;
  const ticket: AdminTicket = {
    id, title, status: "menunggu", updatedAt: now.toISOString(), unread: false, orderIds,
    userId, username: user.username, assignee: null, internalNotes: [],
    messages: [{ id: `${id}-1`, from: "user", text: message, at: now.toISOString(), attachments: toAttachments(`${id}-1`, files) }],
  };
  db.tickets.unshift(ticket);
  sendAlert(db, "new_ticket", `Tiket baru #${id} dari ${user.username}.`, now);
  notifyAdmins(db, { type: "tiket", title: `Tiket baru #${id}`, body: `${user.username}: ${title}`, href: "/admin/tickets", dedupeKey: `ticket-new:${id}` }, now);
  return { id, redirectTo: `/dashboard/tickets/${id}` };
}

/** The user replies to their own ticket. Closed tickets take no replies. Status goes back to "menunggu". */
export function replyAsUser(
  db: AdminDb, userId: string, ticketId: string, input: { message: string; files: IncomingFile[] }, deps: { now?: Date; limiter?: RateLimiter } = {}
): TicketMessage {
  const now = deps.now ?? new Date();
  const ticket = findOwnTicket(db, userId, ticketId);
  if (!ticket) throw new ServiceError("Tiket tidak ditemukan.", "not_found");
  if (ticket.status === "ditutup") throw new ServiceError("Tiket ini sudah ditutup.", "closed");
  const message = validateMessage(input.message);
  const files = validateFiles(input.files);
  const limit = (deps.limiter ?? sharedLimiter).hit(`ticket-reply:${userId}`, REPLIES_PER_HOUR, 3_600_000, now.getTime());
  if (!limit.allowed) throw new ServiceError(`Terlalu banyak balasan. Coba lagi dalam ${Math.ceil(limit.retryAfterSec / 60)} menit.`, "rate_limited");
  const id = `${ticket.id}-u${ticket.messages.length + 1}`;
  const msg: TicketMessage = { id, from: "user", text: message, at: now.toISOString(), attachments: toAttachments(id, files) };
  ticket.messages.push(msg);
  ticket.status = "menunggu";
  ticket.updatedAt = now.toISOString();
  return msg;
}

export function closeOwnTicket(db: AdminDb, userId: string, ticketId: string, now = new Date()) {
  const ticket = findOwnTicket(db, userId, ticketId);
  if (!ticket) throw new ServiceError("Tiket tidak ditemukan.", "not_found");
  if (ticket.status === "ditutup") return ticket;
  ticket.status = "ditutup";
  ticket.updatedAt = now.toISOString();
  return ticket;
}

export function reopenOwnTicket(db: AdminDb, userId: string, ticketId: string, now = new Date()) {
  const ticket = findOwnTicket(db, userId, ticketId);
  if (!ticket) throw new ServiceError("Tiket tidak ditemukan.", "not_found");
  if (ticket.status !== "ditutup") throw new ServiceError("Tiket ini tidak sedang ditutup.", "not_closed");
  if (!canReopen(ticket, now)) throw new ServiceError("Tiket ini sudah terlalu lama ditutup. Buat tiket baru.", "reopen_expired");
  ticket.status = "menunggu";
  ticket.updatedAt = now.toISOString();
  return ticket;
}

/** Opening the ticket clears its unread dot. Returns the new unread total (the sidebar badge). */
export function markTicketRead(db: AdminDb, userId: string, ticketId: string): number {
  const ticket = findOwnTicket(db, userId, ticketId);
  if (ticket) ticket.unread = false;
  return unreadCount(db, userId);
}

/** An admin answers. Authorization (requireAdmin) and logAdminAction happen in the server action. */
export function replyAsAdmin(db: AdminDb, ticketId: string, input: { message: string; files?: IncomingFile[] }, now = new Date()): TicketMessage {
  const ticket = db.tickets.find((t) => t.id === ticketId);
  if (!ticket) throw new ServiceError("Tiket tidak ditemukan.", "not_found");
  const message = validateMessage(input.message);
  const files = validateFiles(input.files ?? []);
  const id = `${ticket.id}-a${ticket.messages.length + 1}`;
  const msg: TicketMessage = { id, from: "support", text: message, at: now.toISOString(), attachments: toAttachments(id, files) };
  ticket.messages.push(msg);
  ticket.status = "dibalas";
  ticket.updatedAt = now.toISOString();
  ticket.unread = true;
  notifyUser(db, ticket.userId, { type: "tiket", title: `Tiket #${ticket.id} dibalas`, body: message.slice(0, 140), href: `/dashboard/tickets/${ticket.id}`, dedupeKey: `ticket-reply:${ticket.id}:${id}` }, now);
  return msg;
}
