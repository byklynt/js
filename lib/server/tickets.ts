import "server-only";
/**
 * Tickets on Supabase, shared by the user area and /admin/tickets. The server actions in lib/ticket-actions.ts and
 * lib/admin-actions.ts add authentication and validation on top.
 *
 * Rules: a user can only read and reply to their own tickets (someone else's ticket looks like one that does not exist);
 * a closed ticket takes no replies; the user's reply sets the status to "menunggu"; an admin reply sets "dibalas" and flags the
 * ticket unread for the user; internal admin notes (is_internal) and the assignee never reach the user. Attachments live in the
 * private `ticket-attachments` bucket (path user_id/ticket_id/...) and are only ever shown through short-lived signed URLs.
 */
import { BLOCKED_MESSAGE } from "@/lib/account-status";
import { randomUUID } from "node:crypto";
import type { AdminTicket } from "@/lib/admin-data";
import {
  allowedAttachmentTypes, maxAttachmentBytes, maxAttachments, maxMessageLength, REOPEN_WINDOW_MS, ticketCategories, ticketSubcategories,
  type Ticket, type TicketAttachment, type TicketMessage, type TicketStatus,
} from "@/lib/tickets-data";
import { hitRateLimit, minutes } from "@/lib/rate-limit";
import { loadSettings } from "./repo/settings";
import { notifyAdmins, notifyUser } from "./repo/notify";
import { supabaseAdmin } from "./supabase-admin";
import { ServiceError } from "./tx";

export type IncomingFile = { name: string; size: number; type: string; data: Buffer };

export const REPLIES_PER_HOUR = 30;
const BUCKET = "ticket-attachments";
const SIGNED_URL_SECONDS = 3600;

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

export function validateFiles(files: { name: string; size: number; type: string }[]) {
  if (files.length > maxAttachments) throw new ServiceError(`Maksimal ${maxAttachments} file.`, "too_many_files");
  for (const f of files) {
    if (!allowedAttachmentTypes.includes(f.type)) throw new ServiceError(`${f.name}: format harus PNG, JPG, atau PDF.`, "bad_file_type");
    if (f.size > maxAttachmentBytes) throw new ServiceError(`${f.name}: ukuran maksimal 5 MB.`, "file_too_large");
    if (f.size <= 0) throw new ServiceError(`${f.name}: file kosong.`, "empty_file");
  }
}

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

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

type Att = { id: string; name: string; size: number; type: string; path: string };
type MsgRow = { id: string; sender: string; body: string; is_internal: boolean; attachments: unknown; created_at: string };
type TicketRow = {
  id: string; number: number; user_id: string; title: string; status: string; assignee: string | null; order_ids: number[]; user_unread: boolean; updated_at: string;
  user: { username: string } | null; messages: MsgRow[];
};
const SELECT = "id,number,user_id,title,status,assignee,order_ids,user_unread,updated_at,user:profiles!tickets_user_id_fkey(username),messages:ticket_messages(id,sender,body,is_internal,attachments,created_at)";

/** Signed URLs for every attachment path in one call. */
async function sign(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!paths.length) return out;
  const { data } = await supabaseAdmin().storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS);
  for (const d of data ?? []) if (d.path && d.signedUrl) out.set(d.path, d.signedUrl);
  return out;
}

async function toAdminTickets(rows: TicketRow[], includeInternal: boolean): Promise<AdminTicket[]> {
  const atts = (m: MsgRow) => (Array.isArray(m.attachments) ? (m.attachments as Att[]) : []);
  const urls = await sign(rows.flatMap((r) => r.messages.flatMap((m) => (m.is_internal && !includeInternal ? [] : atts(m).map((a) => a.path)))));
  return rows.map((r) => {
    const msgs = [...r.messages].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    const visible = msgs.filter((m) => !m.is_internal);
    return {
      id: String(r.number), title: r.title, status: r.status as TicketStatus, updatedAt: r.updated_at, unread: r.user_unread, orderIds: r.order_ids.map(String),
      userId: r.user_id, username: r.user?.username ?? "", assignee: r.assignee,
      messages: visible.map((m): TicketMessage => ({
        id: m.id, from: m.sender === "support" ? "support" : "user", text: m.body, at: m.created_at,
        attachments: atts(m).map((a): TicketAttachment => ({ id: a.id, name: a.name, size: a.size, type: a.type, url: urls.get(a.path) ?? "" })),
      })),
      internalNotes: includeInternal ? msgs.filter((m) => m.is_internal).map((m) => ({ id: m.id, by: "admin", text: m.body, at: m.created_at })) : [],
    };
  });
}

/** Ownership check: someone else's ticket looks exactly like a ticket that does not exist. */
export async function findOwnTicket(userId: string, number: string): Promise<AdminTicket | null> {
  if (!/^\d{1,12}$/.test(number)) return null;
  const { data } = await supabaseAdmin().from("tickets").select(SELECT).eq("number", Number(number)).eq("user_id", userId).maybeSingle();
  return data ? (await toAdminTickets([data as unknown as TicketRow], false))[0] : null;
}

export async function listOwnTickets(userId: string, now = new Date()): Promise<UserTicket[]> {
  const { data } = await supabaseAdmin().from("tickets").select(SELECT).eq("user_id", userId).order("updated_at", { ascending: false }).limit(100);
  return (await toAdminTickets((data ?? []) as unknown as TicketRow[], false)).map((t) => toUserTicket(t, now));
}

export async function unreadCount(userId: string): Promise<number> {
  const { count } = await supabaseAdmin().from("tickets").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("user_unread", true);
  return count ?? 0;
}

/** Admin: one page of tickets (newest activity first). */
export async function listAllTickets(opts: { status?: TicketStatus; limit?: number; before?: string } = {}): Promise<AdminTicket[]> {
  let q = supabaseAdmin().from("tickets").select(SELECT).order("updated_at", { ascending: false }).limit(opts.limit ?? 100);
  if (opts.status) q = q.eq("status", opts.status);
  if (opts.before) q = q.lt("updated_at", opts.before);
  const { data } = await q;
  return toAdminTickets((data ?? []) as unknown as TicketRow[], true);
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

const safeName = (n: string) => n.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80) || "file";

/** Uploads to <user_id>/<ticket_id>/<message_id>-<name>; returns the metadata stored on the message. */
async function upload(ownerId: string, ticketId: string, messageId: string, files: IncomingFile[]): Promise<Att[]> {
  const out: Att[] = [];
  for (const [i, f] of files.entries()) {
    const path = `${ownerId}/${ticketId}/${messageId}-${i + 1}-${safeName(f.name)}`;
    const { error } = await supabaseAdmin().storage.from(BUCKET).upload(path, f.data, { contentType: f.type, upsert: false });
    if (error) throw new ServiceError(`${f.name}: gagal diunggah.`, "upload_failed");
    out.push({ id: `${messageId}-f${i + 1}`, name: f.name.slice(0, 120), size: f.size, type: f.type, path });
  }
  return out;
}

export type CreateTicketInput = { category: string; subcategory: string; orderIds: string[]; message: string; files: IncomingFile[] };

/** Creates a ticket (status "menunggu", first message = the form message) and returns its number and redirect target. */
export async function createUserTicket(userId: string, input: CreateTicketInput): Promise<{ id: string; redirectTo: string }> {
  const db = supabaseAdmin();
  const { data: user } = await db.from("profiles").select("username,status").eq("id", userId).maybeSingle();
  if (!user) throw new ServiceError("Pengguna tidak ditemukan.", "no_user");
  if (user.status !== "aktif") throw new ServiceError(BLOCKED_MESSAGE, "blocked");
  const category = ticketCategories.find((c) => c.label === input.category);
  if (!category) throw new ServiceError("Kategori tidak valid.", "bad_category");
  if (!ticketSubcategories[category.value].includes(input.subcategory)) throw new ServiceError("Subkategori tidak valid.", "bad_subcategory");
  const message = validateMessage(input.message);
  if (message.length < 10) throw new ServiceError("Pesan minimal 10 karakter.", "message_too_short");
  validateFiles(input.files);
  const orderIds = input.orderIds.map((s) => s.trim()).filter(Boolean);
  if (orderIds.some((o) => !/^\d{1,12}$/.test(o)) || orderIds.length > 10) throw new ServiceError("ID pesanan tidak valid.", "bad_order_ids");

  const limit = await hitRateLimit(`ticket:${userId}`, (await loadSettings()).limits.ticketsPerHour, 3600);
  if (!limit.allowed) throw new ServiceError(`Terlalu banyak tiket. Coba lagi dalam ${minutes(limit.retryAfterSeconds)} menit.`, "rate_limited");

  const title = input.subcategory === input.category ? input.category : `${input.category} - ${input.subcategory}`;
  const { data: t, error } = await db.from("tickets").insert({ user_id: userId, title, category: category.value, subcategory: input.subcategory, status: "menunggu", order_ids: orderIds.map(Number) }).select("id,number").single();
  if (error || !t) throw new Error(`tickets: ${error?.message}`);
  try {
    const messageId = randomUUID();
    const attachments = await upload(userId, t.id, messageId, input.files);
    const { error: mErr } = await db.from("ticket_messages").insert({ id: messageId, ticket_id: t.id, sender: "user", sender_id: userId, body: message, attachments: attachments as never });
    if (mErr) throw new Error(`ticket_messages: ${mErr.message}`);
  } catch (e) {
    await db.from("tickets").delete().eq("id", t.id); // nothing half-created stays behind
    throw e;
  }
  await notifyAdmins({ type: "tiket", title: `Tiket baru #${t.number}`, body: `${user.username}: ${title}`, href: "/admin/tickets", dedupeKey: `ticket-new:${t.number}` });
  return { id: String(t.number), redirectTo: `/dashboard/tickets/${t.number}` };
}

async function ownRow(userId: string, number: string) {
  if (!/^\d{1,12}$/.test(number)) throw new ServiceError("Tiket tidak ditemukan.", "not_found");
  const { data } = await supabaseAdmin().from("tickets").select("id,number,status,updated_at").eq("number", Number(number)).eq("user_id", userId).maybeSingle();
  if (!data) throw new ServiceError("Tiket tidak ditemukan.", "not_found");
  return data;
}

/** The user replies to their own ticket. Closed tickets take no replies. Status goes back to "menunggu". */
export async function replyAsUser(userId: string, number: string, input: { message: string; files: IncomingFile[] }): Promise<TicketMessage> {
  const db = supabaseAdmin();
  const t = await ownRow(userId, number);
  if (t.status === "ditutup") throw new ServiceError("Tiket ini sudah ditutup.", "closed");
  const message = validateMessage(input.message);
  validateFiles(input.files);
  const limit = await hitRateLimit(`ticket-reply:${userId}`, REPLIES_PER_HOUR, 3600);
  if (!limit.allowed) throw new ServiceError(`Terlalu banyak balasan. Coba lagi dalam ${minutes(limit.retryAfterSeconds)} menit.`, "rate_limited");
  const messageId = randomUUID();
  const attachments = await upload(userId, t.id, messageId, input.files);
  const { data: row, error } = await db.from("ticket_messages").insert({ id: messageId, ticket_id: t.id, sender: "user", sender_id: userId, body: message, attachments: attachments as never }).select("created_at").single();
  if (error) throw new Error(`ticket_messages: ${error.message}`);
  await db.from("tickets").update({ status: "menunggu" }).eq("id", t.id);
  const urls = await sign(attachments.map((a) => a.path));
  return { id: messageId, from: "user", text: message, at: row.created_at, attachments: attachments.map((a) => ({ id: a.id, name: a.name, size: a.size, type: a.type, url: urls.get(a.path) ?? "" })) };
}

export async function closeOwnTicket(userId: string, number: string) {
  const t = await ownRow(userId, number);
  if (t.status !== "ditutup") await supabaseAdmin().from("tickets").update({ status: "ditutup" }).eq("id", t.id);
}

export async function reopenOwnTicket(userId: string, number: string, now = new Date()) {
  const t = await ownRow(userId, number);
  if (t.status !== "ditutup") throw new ServiceError("Tiket ini tidak sedang ditutup.", "not_closed");
  const full = await findOwnTicket(userId, number);
  if (!full || !canReopen(full, now)) throw new ServiceError("Tiket ini sudah terlalu lama ditutup. Buat tiket baru.", "reopen_expired");
  await supabaseAdmin().from("tickets").update({ status: "menunggu" }).eq("id", t.id);
}

/** Opening the ticket clears its unread dot. Returns the new unread total (the sidebar badge). */
export async function markTicketRead(userId: string, number: string): Promise<number> {
  if (/^\d{1,12}$/.test(number)) await supabaseAdmin().from("tickets").update({ user_unread: false }).eq("number", Number(number)).eq("user_id", userId);
  return unreadCount(userId);
}

/** An admin answers (or leaves an internal note). Authorization (requireAdmin) and logAdminAction happen in the server action. */
export async function replyAsAdmin(adminId: string, number: string, input: { message: string; internal?: boolean; files?: IncomingFile[] }): Promise<TicketMessage> {
  const db = supabaseAdmin();
  const { data: t } = await db.from("tickets").select("id,number,user_id").eq("number", Number(number)).maybeSingle();
  if (!t) throw new ServiceError("Tiket tidak ditemukan.", "not_found");
  const message = validateMessage(input.message);
  const files = input.files ?? [];
  validateFiles(files);
  const messageId = randomUUID();
  const attachments = await upload(t.user_id, t.id, messageId, files);
  const { data: row, error } = await db.from("ticket_messages").insert({ id: messageId, ticket_id: t.id, sender: "support", sender_id: adminId, body: message, is_internal: Boolean(input.internal), attachments: attachments as never }).select("created_at").single();
  if (error) throw new Error(`ticket_messages: ${error.message}`);
  if (!input.internal) {
    await db.from("tickets").update({ status: "dibalas", user_unread: true }).eq("id", t.id);
    await notifyUser(t.user_id, { type: "tiket", title: `Tiket #${t.number} dibalas`, body: message.slice(0, 140), href: `/dashboard/tickets/${t.number}`, dedupeKey: `ticket-reply:${t.number}:${messageId}` });
  }
  const urls = await sign(attachments.map((a) => a.path));
  return { id: messageId, from: "support", text: message, at: row.created_at, attachments: attachments.map((a) => ({ id: a.id, name: a.name, size: a.size, type: a.type, url: urls.get(a.path) ?? "" })) };
}
