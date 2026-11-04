"use server";

import { z } from "zod";
import { currentUserId } from "@/lib/current-user";
import { getDb } from "@/lib/admin-db";
import { allowedAttachmentTypes, maxAttachmentBytes, maxAttachments, type TicketMessage } from "@/lib/tickets-data";
import {
  closeOwnTicket, createUserTicket, findOwnTicket, listOwnTickets, markTicketRead, reopenOwnTicket, replyAsUser, toUserTicket, unreadCount,
  type IncomingFile, type UserTicket,
} from "@/lib/server/tickets";
import { ServiceError } from "@/lib/server/tx";
import { persistAdminState } from "@/lib/server/store";

/**
 * Server actions for the signed-in USER's tickets. Every one resolves the user on the server and goes through
 * lib/server/tickets.ts, which enforces ownership: someone else's ticket behaves like a ticket that does not exist.
 * TODO(infra): file storage is mock (data URLs in memory); use real object storage with signed URLs.
 */
type Fail = { ok: false; error: string };

async function withUser<T>(fn: (userId: string) => T | Promise<T>): Promise<T | Fail> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Silakan masuk terlebih dahulu." };
  try {
    const result = await fn(userId);
    persistAdminState(getDb());
    return result;
  } catch (e) {
    if (e instanceof ServiceError) return { ok: false, error: e.message };
    return { ok: false, error: "Terjadi kesalahan di server. Coba lagi." };
  }
}

/** Reads uploaded files, re-checking type, size and count on the server (never trust the browser). */
async function readFiles(form: FormData): Promise<IncomingFile[]> {
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > maxAttachments) throw new ServiceError(`Maksimal ${maxAttachments} file.`, "too_many_files");
  const out: IncomingFile[] = [];
  for (const f of files) {
    if (!allowedAttachmentTypes.includes(f.type)) throw new ServiceError(`${f.name}: format harus PNG, JPG, atau PDF.`, "bad_file_type");
    if (f.size > maxAttachmentBytes) throw new ServiceError(`${f.name}: ukuran maksimal 5 MB.`, "file_too_large");
    const buf = Buffer.from(await f.arrayBuffer());
    out.push({ name: f.name, size: buf.length, type: f.type, url: `data:${f.type};base64,${buf.toString("base64")}` });
  }
  return out;
}

const createSchema = z.object({
  category: z.string().trim().min(1).max(40),
  subcategory: z.string().trim().min(1).max(60),
  orderIds: z.array(z.string().trim().max(14)).max(10),
  message: z.string().max(4000),
});

export async function createTicketAction(form: FormData): Promise<{ ok: true; id: string; redirectTo: string } | Fail> {
  const parsed = createSchema.safeParse({
    category: form.get("category"),
    subcategory: form.get("subcategory"),
    orderIds: JSON.parse(String(form.get("orderIds") ?? "[]")) as unknown,
    message: form.get("message") ?? "",
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  return withUser(async (userId) => {
    const files = await readFiles(form);
    const result = createUserTicket(getDb(), userId, { ...parsed.data, files });
    return { ok: true as const, ...result };
  });
}

export async function replyTicketAction(form: FormData): Promise<{ ok: true; message: TicketMessage; status: UserTicket["status"] } | Fail> {
  const parsed = z.object({ ticketId: z.string().trim().min(1).max(20), message: z.string().max(4000) }).safeParse({ ticketId: form.get("ticketId"), message: form.get("message") ?? "" });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  return withUser(async (userId) => {
    const files = await readFiles(form);
    const db = getDb();
    const message = replyAsUser(db, userId, parsed.data.ticketId, { message: parsed.data.message, files });
    return { ok: true as const, message, status: findOwnTicket(db, userId, parsed.data.ticketId)!.status };
  });
}

const idSchema = z.string().trim().min(1).max(20);

export async function closeTicketAction(id: unknown): Promise<{ ok: true; ticket: UserTicket } | Fail> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: "Tiket tidak valid." };
  return withUser((userId) => {
    const db = getDb();
    closeOwnTicket(db, userId, parsed.data);
    return { ok: true as const, ticket: toUserTicket(findOwnTicket(db, userId, parsed.data)!) };
  });
}

export async function reopenTicketAction(id: unknown): Promise<{ ok: true; ticket: UserTicket } | Fail> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: "Tiket tidak valid." };
  return withUser((userId) => {
    const db = getDb();
    reopenOwnTicket(db, userId, parsed.data);
    return { ok: true as const, ticket: toUserTicket(findOwnTicket(db, userId, parsed.data)!) };
  });
}

/**
 * Reads one ticket. `open: true` (the detail page's first load and its polling) also marks it read, so the unread
 * dot and the sidebar badge go away. Returns ticket: null for unknown tickets AND for other users' tickets.
 */
export async function getTicketAction(id: unknown, open = false): Promise<{ ok: true; ticket: UserTicket | null; unread: number } | Fail> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { ok: true, ticket: null, unread: 0 };
  return withUser((userId) => {
    const db = getDb();
    const ticket = findOwnTicket(db, userId, parsed.data);
    if (!ticket) return { ok: true as const, ticket: null, unread: unreadCount(db, userId) };
    const view = toUserTicket(ticket);
    const unread = open ? markTicketRead(db, userId, parsed.data) : unreadCount(db, userId);
    return { ok: true as const, ticket: view, unread };
  });
}

export async function getMyTicketsAction(): Promise<UserTicket[]> {
  const userId = await currentUserId();
  return userId ? listOwnTickets(getDb(), userId) : [];
}

export async function getUnreadTicketCountAction(): Promise<number> {
  const userId = await currentUserId();
  return userId ? unreadCount(getDb(), userId) : 0;
}
