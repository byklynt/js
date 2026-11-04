"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-server";
import { getDb } from "@/lib/admin-db";
import { logAdminAction } from "@/lib/admin-audit";
import { allowedAttachmentTypes, maxAttachmentBytes, maxAttachments } from "@/lib/tickets-data";
import { persistAdminState } from "@/lib/server/store";
import { replyAsAdmin, type IncomingFile } from "@/lib/server/tickets";
import { ServiceError } from "@/lib/server/tx";

/**
 * An admin answers a ticket (with optional attachments). Authorized on the server with requireAdmin, validated with
 * zod, and logged with logAdminAction. The reply sets the ticket to "Dibalas" and flags it unread for the user; the
 * status can optionally be changed afterwards (for example to "Ditutup").
 */
export async function replyAdminTicketForm(form: FormData): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  let admin;
  try {
    admin = await requireAdmin("action");
  } catch {
    return { ok: false, error: "Kamu tidak punya akses untuk tindakan ini." };
  }
  const parsed = z
    .object({ ticketId: z.string().trim().min(1).max(20), message: z.string().max(4000), status: z.enum(["dibalas", "menunggu", "ditutup"]).default("dibalas") })
    .safeParse({ ticketId: form.get("ticketId"), message: form.get("message") ?? "", status: form.get("status") ?? "dibalas" });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Data tidak valid." };

  try {
    const raw = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    if (raw.length > maxAttachments) throw new ServiceError(`Maksimal ${maxAttachments} file.`, "too_many_files");
    const files: IncomingFile[] = [];
    for (const f of raw) {
      if (!allowedAttachmentTypes.includes(f.type)) throw new ServiceError(`${f.name}: format harus PNG, JPG, atau PDF.`, "bad_file_type");
      if (f.size > maxAttachmentBytes) throw new ServiceError(`${f.name}: ukuran maksimal 5 MB.`, "file_too_large");
      const buf = Buffer.from(await f.arrayBuffer());
      files.push({ name: f.name, size: buf.length, type: f.type, url: `data:${f.type};base64,${buf.toString("base64")}` });
    }
    const db = getDb();
    const ticket = db.tickets.find((t) => t.id === parsed.data.ticketId);
    const before = { status: ticket?.status };
    replyAsAdmin(db, parsed.data.ticketId, { message: parsed.data.message, files });
    if (ticket && parsed.data.status !== "dibalas") ticket.status = parsed.data.status;
    logAdminAction({
      adminId: admin.sub, adminName: admin.username, action: "ticket.reply", targetType: "ticket", targetId: parsed.data.ticketId,
      before, after: { status: ticket?.status, attachments: files.length },
    });
    persistAdminState(db);
    revalidatePath("/admin", "layout");
    return { ok: true, message: `Balasan untuk tiket #${parsed.data.ticketId} terkirim.` };
  } catch (e) {
    if (e instanceof ServiceError) return { ok: false, error: e.message };
    return { ok: false, error: "Terjadi kesalahan di server. Coba lagi." };
  }
}
