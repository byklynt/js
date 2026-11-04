"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentUserId } from "@/lib/current-user";
import { getDb } from "@/lib/admin-db";
import type { Order } from "@/lib/orders-data";
import type { RefillRequest } from "@/lib/refills-data";
import type { Refund } from "@/lib/refunds-data";
import { placeOrder } from "@/lib/server/orders";
import { createProviderClient } from "@/lib/server/providers/client";
import { createManualRefund } from "@/lib/server/refunds";
import { requestCancel, requestRefill } from "@/lib/server/requests";
import { cancelEligibility, computeUserCancelRefund, refillEligibility, type Eligibility } from "@/lib/server/rules";
import type { CancelPolicy, OrderRuleSet, RuleKey } from "@/lib/order-rules";
import { ServiceError } from "@/lib/server/tx";
import type { LedgerEntry } from "@/lib/server/types";

export type UserResult<T = undefined> = { ok: true; message?: string; data?: T } | { ok: false; error: string };

async function guard<T>(fn: (userId: string) => Promise<UserResult<T>> | UserResult<T>): Promise<UserResult<T>> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Silakan masuk terlebih dahulu." };
  try {
    const result = await fn(userId);
    if (result.ok) revalidatePath("/dashboard", "layout");
    return result;
  } catch (e) {
    if (e instanceof ServiceError) return { ok: false, error: e.message };
    return { ok: false, error: "Terjadi kesalahan di server. Coba lagi." };
  }
}

const orderSchema = z.object({
  serviceId: z.string().trim().min(1).max(40),
  link: z.string().trim().min(1, "Tautan wajib diisi.").max(500),
  quantity: z.coerce.number().int("Jumlah harus bilangan bulat.").positive("Jumlah harus lebih dari 0."),
});


/** Single order. The accepted rules version is recorded by placeOrder (current version, server side). */
export async function submitOrder(input: unknown) {
  const parsed = orderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Data tidak valid." } as const;
  return guard(async (userId) => {
    const db = getDb();
    const order = await placeOrder(db, { userId, ...parsed.data }, { client: createProviderClient(db) });
    if (order.status === "gagal_kirim") {
      return { ok: false, error: "Pesanan gagal dikirim ke provider. Saldomu sudah dikembalikan." } as const;
    }
    return { ok: true, message: `Pesanan #${order.id} dibuat.`, data: { orderId: order.id } };
  });
}

/** Mass order: each line is its own order and stores the current rules version of its platform. */
export async function submitMassOrder(input: unknown) {
  const parsed = z.array(orderSchema).min(1).max(100).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Data tidak valid." } as const;
  return guard(async (userId) => {
    const db = getDb();
    const ids: string[] = [];
    // Each line is its own order (own transaction): a later failure never undoes earlier orders.
    for (const [i, line] of parsed.data.entries()) {
      try {
        const order = await placeOrder(db, { userId, ...line }, { client: createProviderClient(db) });
        ids.push(order.id);
      } catch (e) {
        if (e instanceof ServiceError) return { ok: false, error: `Baris ${i + 1}: ${e.message}` } as const;
        throw e;
      }
    }
    return { ok: true, data: { orderIds: ids } };
  });
}

export async function submitRefill(orderId: unknown) {
  const id = z.string().trim().min(1).max(40).safeParse(orderId);
  if (!id.success) return { ok: false, error: "Pesanan tidak valid." } as const;
  return guard(async (userId) => {
    const db = getDb();
    await requestRefill(db, createProviderClient(db), userId, id.data);
    return { ok: true, message: "Refill diajukan." };
  });
}

export async function submitCancel(orderId: unknown) {
  const id = z.string().trim().min(1).max(40).safeParse(orderId);
  if (!id.success) return { ok: false, error: "Pesanan tidak valid." } as const;
  return guard(async (userId) => {
    const db = getDb();
    requestCancel(db, userId, id.data);
    return { ok: true, message: "Permintaan pembatalan dikirim. Admin akan menyetujui atau menolaknya; refund mengikuti kebijakan pembatalan." };
  });
}

/** User asks for a refund on a finished order; an admin decides in /admin/refunds. */
export async function submitRefundRequest(input: unknown) {
  const parsed = z.object({ orderId: z.string().trim().min(1).max(40), amount: z.coerce.number().int().positive(), reason: z.string().trim().min(10, "Alasan minimal 10 karakter.").max(300) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Data tidak valid." } as const;
  return guard(async (userId) => {
    const db = getDb();
    const order = db.orders.find((o) => o.id === parsed.data.orderId && o.userId === userId);
    if (!order) return { ok: false, error: "Pesanan tidak ditemukan." } as const;
    createManualRefund(db, { orderId: order.id, amount: parsed.data.amount, note: parsed.data.reason, source: "user_request" });
    return { ok: true, message: "Permintaan refund dikirim ke admin." };
  });
}

/** Cancel info for the orders page: eligibility, when it opens, and what a cancellation would refund right now. */
export type MyOrder = Order & { refunded: number; refill: Eligibility; cancel: Eligibility; cancelRefundPreview: number; cancelPercent: number; cancelMinAgeHours: number };

export async function getMyOrders(): Promise<MyOrder[]> {
  const userId = await currentUserId();
  if (!userId) return [];
  const db = getDb();
  const now = new Date();
  return db.orders
    .filter((o) => o.userId === userId)
    .map((o) => {
      const service = db.services.find((s) => s.id === o.serviceId);
      return {
        id: o.id, serviceId: o.serviceId, platform: o.platform, name: o.name, link: o.link, charge: o.charge, quantity: o.quantity,
        startCount: o.startCount, remains: o.remains, status: o.status, createdAt: o.createdAt, refillable: Boolean(service?.refill),
        refunded: o.refundedAmount,
        refill: refillEligibility(o, service, db.refillRequests.filter((r) => r.orderId === o.id), now),
        cancel: cancelEligibility(o, service, db.cancelRequests.filter((r) => r.orderId === o.id), now, db.settings.cancelPolicy),
        cancelRefundPreview: computeUserCancelRefund(o, db.settings.cancelPolicy.refundPercent),
        cancelPercent: db.settings.cancelPolicy.refundPercent,
        cancelMinAgeHours: db.settings.cancelPolicy.minAgeHours,
      };
    });
}

export async function getMyRefills(): Promise<RefillRequest[]> {
  const userId = await currentUserId();
  if (!userId) return [];
  const db = getDb();
  return db.refillRequests
    .filter((r) => r.userId === userId)
    .flatMap((r) => {
      const o = db.orders.find((x) => x.id === r.orderId);
      return o ? [{ id: r.id, orderId: o.id, platform: o.platform, name: o.name, link: o.link, status: r.status, createdAt: r.createdAt }] : [];
    });
}

/** Settled refunds of the user (automatic and approved ones). */
export async function getMyRefunds(): Promise<Refund[]> {
  const userId = await currentUserId();
  if (!userId) return [];
  return getDb()
    .refunds.filter((r) => r.userId === userId && r.status === "selesai" && !r.reversed)
    .map((r) => ({
      id: r.id,
      orderId: r.orderId,
      amount: r.amount,
      // gagal_kirim and manual refunds read as "dibatalkan" in the user's list (full money back).
      status: r.reason === "sebagian" ? ("sebagian" as const) : ("dibatalkan" as const),
      createdAt: r.processedAt ?? r.createdAt,
    }));
}

export async function getMyLedger(): Promise<{ balance: number; entries: LedgerEntry[] }> {
  const userId = await currentUserId();
  if (!userId) return { balance: 0, entries: [] };
  const db = getDb();
  return { balance: db.users.find((u) => u.id === userId)?.balance ?? 0, entries: db.ledger.filter((l) => l.userId === userId) };
}

export async function getMyBalance(): Promise<number | null> {
  const userId = await currentUserId();
  return userId ? (getDb().users.find((u) => u.id === userId)?.balance ?? null) : null;
}

/** Public: the rules users read and the cancel policy. Same settings the admin edits, so numbers never drift. */
export async function getOrderRulesAction(): Promise<{ rules: Record<RuleKey, OrderRuleSet>; policy: CancelPolicy }> {
  const { orderRules, cancelPolicy } = getDb().settings;
  return { rules: orderRules, policy: cancelPolicy };
}
