"use server";

import { z } from "zod";
import { requireAdmin } from "@/lib/auth-server";
import { getOrderComments } from "@/lib/server/repo/order-comments";
import { listDeposits, listLedger, listLogs, listOrders, listRefills, listRefunds, listTicketsPage, listUsers, loadUserDetail } from "@/lib/server/admin/lists";

/**
 * "Load more" and server-side search for the admin lists. Every call re-checks the admin session (requireAdmin + AAL2); the cursor is an
 * opaque keyset position that is validated again on the server before it reaches a query.
 */
const kinds = ["orders", "deposits", "refunds", "refills", "tickets", "ledger", "logs", "users"] as const;
export type ListKind = (typeof kinds)[number];
const schema = z.object({ kind: z.enum(kinds), cursor: z.string().max(200).nullable().optional(), q: z.string().max(80).nullable().optional() });

export async function loadMoreAction(input: unknown) {
  try {
    await requireAdmin("action");
  } catch {
    return { ok: false as const, error: "Kamu tidak punya akses untuk tindakan ini." };
  }
  const p = schema.safeParse(input);
  if (!p.success) return { ok: false as const, error: "Data tidak valid." };
  const { kind, cursor, q } = p.data;
  try {
    switch (kind) {
      case "orders": return { ok: true as const, kind, ...(await listOrders({ cursor, q })) };
      case "deposits": return { ok: true as const, kind, ...(await listDeposits({ cursor, q })) };
      case "refunds": return { ok: true as const, kind, ...(await listRefunds({ cursor })) };
      case "refills": return { ok: true as const, kind, ...(await listRefills({ cursor })) };
      case "tickets": return { ok: true as const, kind, ...(await listTicketsPage({ cursor })) };
      case "ledger": return { ok: true as const, kind, ...(await listLedger({ cursor, q })) };
      case "logs": return { ok: true as const, kind, ...(await listLogs({ cursor, q })) };
      case "users": return { ok: true as const, kind, ...(await listUsers({ cursor, q })) };
    }
  } catch (e) {
    console.error("[admin-list]", kind, e instanceof Error ? e.message : e);
    return { ok: false as const, error: "Data tidak bisa dimuat. Coba lagi." };
  }
}

export async function loadUserDetailAction(userId: unknown) {
  try {
    await requireAdmin("action");
  } catch {
    return null;
  }
  const id = z.string().uuid().safeParse(userId);
  return id.success ? loadUserDetail(id.data) : null;
}

/** Admin: the comments of one Custom Comments order. */
export async function loadOrderCommentsAction(orderId: unknown): Promise<{ ok: true; comments: string[] } | { ok: false; error: string }> {
  try {
    await requireAdmin("action");
  } catch {
    return { ok: false, error: "Kamu tidak punya akses untuk tindakan ini." };
  }
  const id = z.string().regex(/^\d{1,12}$/).safeParse(orderId);
  if (!id.success) return { ok: false, error: "Pesanan tidak valid." };
  const comments = await getOrderComments(id.data);
  return comments ? { ok: true, comments } : { ok: false, error: "Pesanan ini tidak memiliki komentar." };
}
