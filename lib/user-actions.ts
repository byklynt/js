"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentUserId } from "@/lib/current-user";
import { getCurrentUser } from "@/lib/auth-actions";
import { emptyUserStats, type UserStats } from "@/lib/dashboard-data";
import type { Order } from "@/lib/orders-data";
import type { RefillRequest } from "@/lib/refills-data";
import type { Refund } from "@/lib/refunds-data";
import type { CancelPolicy, OrderRuleSet, RuleKey } from "@/lib/order-rules";
import { placeOrder } from "@/lib/server/orders";
import { createProviderClient } from "@/lib/server/providers/client";
import { createDepositRequest, methodLabel } from "@/lib/server/deposits";
import { MIN_PASSWORD, EMAIL_RE, verifyPasswordFor } from "@/lib/server/user-auth";
import { notifyAdmins } from "@/lib/server/repo/notify";
import { listUserOrders } from "@/lib/server/repo/orders";
import { getClientIp } from "@/lib/auth-server";
import { cancelGatewayDeposit, createGatewayDeposit, getGatewayConfig, verifyDeposit } from "@/lib/server/payments/deposits-gateway";
import { hitRateLimit } from "@/lib/rate-limit";
import { getOrderComments } from "@/lib/server/repo/order-comments";
import { loadSettings } from "@/lib/server/repo/settings";
import { requestCancel, requestRefill } from "@/lib/server/requests";
import { cancelEligibility, computeUserCancelRefund, refillEligibility, type Eligibility } from "@/lib/server/rules";
import { ServiceError } from "@/lib/server/tx";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { createClient as createSupabase } from "@/lib/supabase/server";
import type { LedgerEntry, LedgerType } from "@/lib/server/types";

export type UserResult<T = undefined> = { ok: true; message?: string; data?: T } | { ok: false; error: string };

/** Every action below resolves the user from the session; no user id is ever accepted from the client. */
async function guard<T>(fn: (userId: string) => Promise<UserResult<T>> | UserResult<T>): Promise<UserResult<T>> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Silakan masuk terlebih dahulu." };
  try {
    const result = await fn(userId);
    if (result.ok) revalidatePath("/dashboard", "layout");
    return result;
  } catch (e) {
    if (e instanceof ServiceError) return { ok: false, error: e.message };
    console.error("[user-actions]", e);
    return { ok: false, error: "Terjadi kesalahan di server. Coba lagi." };
  }
}

const orderSchema = z.object({
  serviceId: z.string().trim().min(1).max(40),
  link: z.string().trim().min(1, "Tautan wajib diisi.").max(500),
  quantity: z.coerce.number().int("Jumlah harus bilangan bulat.").positive("Jumlah harus lebih dari 0."),
});
/** Single order: for Custom Comments the quantity may be omitted (the server counts the comments); a quantity that differs is refused by place_order. */
const singleOrderSchema = orderSchema.extend({
  quantity: orderSchema.shape.quantity.optional(),
  comments: z.string().max(70_000, "Komentar terlalu panjang.").optional(),
});

const orderIdSchema = z.string().trim().regex(/^\d{1,12}$/, "Pesanan tidak valid.");

/** Single order. The accepted rules version is recorded by place_order (current version, server side). */
export async function submitOrder(input: unknown) {
  const parsed = singleOrderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Data tidak valid." } as const;
  return guard(async (userId) => {
    const order = await placeOrder({ userId, ...parsed.data }, { client: createProviderClient() });
    if (order.status === "gagal_kirim") {
      return { ok: false, error: "Pesanan gagal dikirim ke provider. Saldomu sudah dikembalikan." } as const;
    }
    return { ok: true, message: `Pesanan #${order.id} dibuat.`, data: { orderId: order.id } };
  });
}

/** Mass order: each line is its own order (own transaction) and stores the current rules version of its platform. */
export async function submitMassOrder(input: unknown) {
  const parsed = z.array(orderSchema).min(1).max(100).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Data tidak valid." } as const;
  return guard(async (userId) => {
    const ids: string[] = [];
    // A later failure never undoes earlier orders.
    for (const [i, line] of parsed.data.entries()) {
      try {
        const order = await placeOrder({ userId, ...line }, { client: createProviderClient() });
        ids.push(order.id);
      } catch (e) {
        if (e instanceof ServiceError) {
          const msg = e.code === "no_comments" ? "Layanan Custom Comments butuh daftar komentar. Pesan lewat tab Order Baru." : e.message;
          return { ok: false, error: `Baris ${i + 1}: ${msg}` } as const;
        }
        throw e;
      }
    }
    return { ok: true, data: { orderIds: ids } };
  });
}

export async function submitRefill(orderId: unknown) {
  const id = orderIdSchema.safeParse(orderId);
  if (!id.success) return { ok: false, error: "Pesanan tidak valid." } as const;
  return guard(async (userId) => {
    await requestRefill(createProviderClient(), userId, id.data);
    return { ok: true, message: "Refill diajukan." };
  });
}

export async function submitCancel(orderId: unknown) {
  const id = orderIdSchema.safeParse(orderId);
  if (!id.success) return { ok: false, error: "Pesanan tidak valid." } as const;
  return guard(async (userId) => {
    await requestCancel(userId, id.data);
    return { ok: true, message: "Permintaan pembatalan dikirim. Admin akan menyetujui atau menolaknya; refund mengikuti kebijakan pembatalan." };
  });
}

/** Cancel info for the orders page: eligibility, when it opens, and what a cancellation would refund right now. */
export type MyOrder = Order & { commentCount?: number; refunded: number; refill: Eligibility; cancel: Eligibility; cancelRefundPreview: number; cancelPercent: number; cancelMinAgeHours: number };

export async function getMyOrders(): Promise<MyOrder[]> {
  const userId = await currentUserId();
  if (!userId) return [];
  const [orders, settings] = await Promise.all([listUserOrders(userId), loadSettings()]);
  if (!orders.length) return [];
  const ids = orders.map((o) => Number(o.id));
  const db = supabaseAdmin();
  const [refills, cancels, services] = await Promise.all([
    db.from("refill_requests").select("order_id,status,created_at").in("order_id", ids),
    db.from("cancel_requests").select("order_id,status,created_at").in("order_id", ids),
    db.from("services").select("id,refill,cancel,refill_days").in("id", [...new Set(orders.map((o) => o.serviceId))]),
  ]);
  const svc = new Map((services.data ?? []).map((s) => [s.id, { refill: s.refill, cancel: s.cancel, refillDays: s.refill_days }]));
  const reqs = (rows: { order_id: number; status: string; created_at: string }[] | null) => {
    const m = new Map<number, { status: "menunggu" | "berjalan" | "selesai" | "ditolak"; createdAt: string }[]>();
    for (const r of rows ?? []) m.set(r.order_id, [...(m.get(r.order_id) ?? []), { status: r.status as "menunggu", createdAt: r.created_at }]);
    return m;
  };
  const refillBy = reqs(refills.data);
  const cancelBy = reqs(cancels.data);
  const now = new Date();
  const policy = settings.cancelPolicy;
  return orders.map((o) => {
    const service = svc.get(o.serviceId);
    return {
      id: o.id, serviceId: o.serviceId, platform: o.platform, name: o.name, link: o.link, charge: o.charge, quantity: o.quantity,
      startCount: o.startCount, remains: o.remains, status: o.status, createdAt: o.createdAt, refillable: Boolean(service?.refill),
      refunded: o.refundedAmount,
      ...(o.commentCount ? { commentCount: o.commentCount } : {}),
      refill: refillEligibility(o, service, refillBy.get(Number(o.id)) ?? [], now),
      cancel: cancelEligibility(o, service, cancelBy.get(Number(o.id)) ?? [], now, policy),
      cancelRefundPreview: computeUserCancelRefund(o, policy.refundPercent),
      cancelPercent: policy.refundPercent,
      cancelMinAgeHours: policy.minAgeHours,
    };
  });
}

export async function getMyRefills(): Promise<RefillRequest[]> {
  const userId = await currentUserId();
  if (!userId) return [];
  const { data } = await supabaseAdmin().from("refill_requests")
    .select("id,order_id,status,created_at,orders!inner(link,services(id,name,platform))").eq("user_id", userId).order("created_at", { ascending: false }).limit(200);
  return ((data ?? []) as unknown as { id: string; order_id: number; status: string; created_at: string; orders: { link: string; services: { id: string; name: string; platform: string } | null } }[]).map((r) => ({
    id: r.id, orderId: String(r.order_id), platform: r.orders.services?.platform ?? "", name: `${r.orders.services?.id ?? ""} - ${r.orders.services?.name ?? ""}`,
    link: r.orders.link, status: r.status as RefillRequest["status"], createdAt: r.created_at,
  }));
}

/** Settled refunds of the user (automatic and approved ones). */
export async function getMyRefunds(): Promise<Refund[]> {
  const userId = await currentUserId();
  if (!userId) return [];
  const { data } = await supabaseAdmin().from("refunds").select("id,order_id,amount,reason,created_at,processed_at")
    .eq("user_id", userId).eq("status", "selesai").eq("reversed", false).order("processed_at", { ascending: false }).limit(300);
  return (data ?? []).map((r) => ({
    id: r.id,
    orderId: String(r.order_id),
    amount: Number(r.amount),
    // gagal_kirim and manual refunds read as "dibatalkan" in the user's list (full money back).
    status: r.reason === "sebagian" ? ("sebagian" as const) : ("dibatalkan" as const),
    createdAt: r.processed_at ?? r.created_at,
  }));
}

export async function getMyLedger(): Promise<{ balance: number; entries: LedgerEntry[] }> {
  const userId = await currentUserId();
  if (!userId) return { balance: 0, entries: [] };
  const db = supabaseAdmin();
  const [{ data: p }, { data: rows }] = await Promise.all([
    db.from("profiles").select("balance").eq("id", userId).maybeSingle(),
    db.from("balance_ledger").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(500),
  ]);
  return {
    balance: Number(p?.balance ?? 0),
    entries: (rows ?? []).map((l) => ({
      id: l.id, userId: l.user_id, type: l.type as LedgerType, amount: Number(l.amount), balanceBefore: Number(l.balance_before), balanceAfter: Number(l.balance_after),
      refType: l.ref_type, refId: l.ref_id, note: l.note, createdBy: l.created_by, createdAt: l.created_at,
    })),
  };
}

export async function getMyBalance(): Promise<number | null> {
  const userId = await currentUserId();
  if (!userId) return null;
  const { data } = await supabaseAdmin().from("profiles").select("balance").eq("id", userId).maybeSingle();
  return data ? Number(data.balance) : null;
}

/** Public: the rules users read and the cancel policy. Same settings the admin edits, so numbers never drift. */
export async function getOrderRulesAction(): Promise<{ rules: Record<RuleKey, OrderRuleSet>; policy: CancelPolicy }> {
  const { orderRules, cancelPolicy } = await loadSettings();
  return { rules: orderRules, policy: cancelPolicy };
}

// ---------------------------------------------------------------------------
// Deposits (manual requests until a payment gateway exists)
// ---------------------------------------------------------------------------

export type GatewayChannelOption = { code: string; name: string; type?: string; feeMode: "merchant" | "customer" | "split"; feeFlat: number; feePercent: number; minAmount: number; maxAmount: number };
export type DepositConfig = {
  minDeposit: number;
  methods: { id: string; name: string; detail?: string }[];
  bonusTiers: { min: number; percent: number }[];
  /** Paymenku: channels the admin enabled (already filtered by the fee policy); `sandbox` = test mode (no real money). */
  gateway: { enabled: boolean; sandbox: boolean; maxDeposit: number; channels: GatewayChannelOption[] };
};
export type MyDeposit = { id: string; method: string; amount: number; status: "berhasil" | "menunggu" | "gagal" | "kedaluwarsa" | "dibatalkan"; createdAt: string; gateway?: boolean; payAmount?: number; fee?: number };

export async function getDepositConfig(): Promise<DepositConfig> {
  const [{ payments }, gw] = await Promise.all([loadSettings(), getGatewayConfig()]);
  return {
    minDeposit: payments.minDeposit,
    methods: payments.activeMethods.filter((id) => id === "manual").map((id) => ({ id, name: methodLabel(id), detail: "dikonfirmasi admin setelah pembayaran diterima" })),
    bonusTiers: [...payments.bonusTiers].sort((a, b) => b.min - a.min),
    gateway: { enabled: gw.enabled, sandbox: gw.mode === "sandbox", maxDeposit: gw.maxDeposit, channels: gw.channels },
  };
}

export async function getMyDeposits(): Promise<MyDeposit[]> {
  const userId = await currentUserId();
  if (!userId) return [];
  const { data } = await supabaseAdmin().from("deposits").select("id,method,amount,status,created_at,gateway,pay_amount,fee_amount").eq("user_id", userId).order("created_at", { ascending: false }).limit(200);
  return (data ?? []).map((d) => ({ id: d.id, method: d.method, amount: Number(d.amount), status: (["berhasil", "menunggu", "kedaluwarsa", "dibatalkan"].includes(d.status) ? d.status : "gagal"), createdAt: d.created_at, gateway: d.gateway === "paymenku", ...(d.gateway === "paymenku" ? { payAmount: Number(d.pay_amount ?? d.amount), fee: Number(d.fee_amount ?? 0) } : {}) }) as MyDeposit);
}

const depositSchema = z.object({ amount: z.coerce.number().int("Jumlah harus bilangan bulat."), methodId: z.string().trim().min(1).max(30) });

export async function submitDeposit(input: unknown) {
  const parsed = depositSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Data tidak valid." } as const;
  return guard(async (userId) => {
    const deposit = await createDepositRequest({ userId, ...parsed.data });
    await notifyAdmins({ type: "deposit", title: "Deposit menunggu konfirmasi", body: `${deposit.username} meminta deposit Rp ${deposit.amount.toLocaleString("id-ID")}.`, href: "/admin/deposits?status=menunggu", dedupeKey: `deposit-request:${deposit.id}` });
    return { ok: true, message: "Permintaan deposit dibuat.", data: { id: deposit.id } };
  });
}

export async function getMyStats(): Promise<UserStats> {
  const userId = await currentUserId();
  if (!userId) return emptyUserStats;
  const { data } = await supabaseAdmin().rpc("user_stats", { p_user: userId });
  const s = data?.[0];
  if (!s) return emptyUserStats;
  return { balance: Number(s.balance), totalOrders: Number(s.total_orders), rank: s.rank, totalSpent: Number(s.total_spent) };
}

// ---------------------------------------------------------------------------
// Account and personal settings
// ---------------------------------------------------------------------------

const passwordSchema = z.object({ currentPassword: z.string().min(1, "Password saat ini wajib diisi.").max(200), newPassword: z.string().min(1).max(200) });
const emailSchema = z.object({ newEmail: z.string().trim().min(1, "Email wajib diisi.").max(160), password: z.string().min(1, "Password wajib diisi.").max(200) });
const SETTINGS_SECTIONS = ["invoice", "notifications", "timezone", "experience"] as const;
const settingsSchema = z.object({ section: z.enum(SETTINGS_SECTIONS), values: z.record(z.string(), z.unknown()) });

export async function changeMyPassword(input: unknown) {
  const parsed = passwordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Data tidak valid." } as const;
  return guard(async () => {
    const me = await getCurrentUser();
    if (!me) return { ok: false, error: "Silakan masuk terlebih dahulu." } as const;
    const { currentPassword, newPassword } = parsed.data;
    if (!(await verifyPasswordFor(me.email, currentPassword))) return { ok: false, error: "Password saat ini salah." } as const;
    if (newPassword.length < MIN_PASSWORD) return { ok: false, error: `Password baru minimal ${MIN_PASSWORD} karakter.` } as const;
    if (newPassword === currentPassword) return { ok: false, error: "Password baru harus berbeda dari yang lama." } as const;
    const { error } = await (await createSupabase()).auth.updateUser({ password: newPassword });
    if (error) return { ok: false, error: "Password tidak bisa diubah. Coba lagi." } as const;
    return { ok: true, message: "Password diubah." };
  });
}

export async function changeMyEmail(input: unknown) {
  const parsed = emailSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Data tidak valid." } as const;
  return guard(async () => {
    const me = await getCurrentUser();
    if (!me) return { ok: false, error: "Silakan masuk terlebih dahulu." } as const;
    const next = parsed.data.newEmail.trim();
    if (!EMAIL_RE.test(next)) return { ok: false, error: "Format email tidak valid." } as const;
    if (!(await verifyPasswordFor(me.email, parsed.data.password))) return { ok: false, error: "Password salah." } as const;
    const { error } = await (await createSupabase()).auth.updateUser({ email: next });
    if (error) return { ok: false, error: error.code === "email_exists" ? "Email sudah terdaftar." : "Email tidak bisa diubah. Coba lagi." } as const;
    return { ok: true, message: "Kami mengirim link konfirmasi. Email berubah setelah link dibuka." };
  });
}

export async function saveMySettings(input: unknown) {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Data tidak valid." } as const;
  return guard(async (userId) => {
    const db = supabaseAdmin();
    const { data } = await db.from("profiles").select("prefs").eq("id", userId).single();
    const prefs = { ...((data?.prefs as Record<string, unknown> | null) ?? {}), [parsed.data.section]: parsed.data.values };
    const { error } = await db.from("profiles").update({ prefs: prefs as never }).eq("id", userId);
    if (error) return { ok: false, error: "Tidak bisa menyimpan. Coba lagi." } as const;
    return { ok: true, message: "Disimpan." };
  });
}

/** Saved values of one settings section (empty object when never saved). */
export async function getMySettings(section: string): Promise<Record<string, unknown>> {
  const userId = await currentUserId();
  if (!userId || !(SETTINGS_SECTIONS as readonly string[]).includes(section)) return {};
  const { data } = await supabaseAdmin().from("profiles").select("prefs").eq("id", userId).single();
  return ((data?.prefs as Record<string, Record<string, unknown>> | null) ?? {})[section] ?? {};
}

/** The comments of one of MY Custom Comments orders (plain text lines; the owner is checked here, never taken from the client). */
export async function getMyOrderComments(orderId: unknown): Promise<{ ok: true; comments: string[] } | { ok: false; error: string }> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Silakan masuk terlebih dahulu." };
  const id = orderIdSchema.safeParse(orderId);
  if (!id.success) return { ok: false, error: "Pesanan tidak valid." };
  const { data: owned } = await supabaseAdmin().from("orders").select("id").eq("id", Number(id.data)).eq("user_id", userId).maybeSingle();
  if (!owned) return { ok: false, error: "Pesanan tidak ditemukan." };
  const comments = await getOrderComments(id.data);
  return comments ? { ok: true, comments } : { ok: false, error: "Pesanan ini tidak memiliki komentar." };
}

// --- Paymenku top-up ---------------------------------------------------------------------------------------------------------------

const gatewayDepositSchema = z.object({ amount: z.coerce.number().int("Jumlah harus bilangan bulat.").positive("Jumlah harus lebih dari 0."), channelCode: z.string().trim().regex(/^[a-z0-9_]{1,40}$/, "Kanal tidak valid.") });

/** Creates the deposit and the Paymenku transaction; the page then opens /deposit/<id>. Amount, channel and limits are checked again on the server. */
export async function submitGatewayDeposit(input: unknown) {
  const parsed = gatewayDepositSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Data tidak valid." } as const;
  const ip = await getClientIp();
  return guard(async (userId) => {
    const dep = await createGatewayDeposit({ userId, ip, amount: parsed.data.amount, channelCode: parsed.data.channelCode });
    return { ok: true, data: { id: dep.id } };
  });
}

/** What the payment page shows. Only the owner's own row (RLS on the user session) and only display-safe fields. */
export type DepositView = {
  id: string;
  status: "menunggu" | "berhasil" | "gagal" | "kedaluwarsa" | "dibatalkan";
  amount: number;
  payAmount: number;
  fee: number;
  method: string;
  channelCode: string | null;
  payUrl: string | null;
  info: Record<string, string | boolean>;
  expiresAt: string | null;
  createdAt: string;
  paidAt: string | null;
  sandbox: boolean;
  gateway: boolean;
};

export async function getMyDepositView(id: unknown): Promise<DepositView | null> {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return null;
  const supabase = await createSupabase();
  const { data: row } = await supabase.from("deposits")
    .select("id,status,amount,pay_amount,fee_amount,method,channel_code,pay_url,payment_info,expires_at,created_at,paid_at,is_sandbox,gateway,user_id")
    .eq("id", parsed.data).maybeSingle();
  if (!row) return null;
  // The page polls this. A pending payment is also looked up at Paymenku (at most every 15 s per deposit): the credit still happens ONLY after the server verified it there.
  if (row.status === "menunggu" && row.gateway === "paymenku" && Date.now() - new Date(row.created_at).getTime() > 20_000) {
    const gate = await hitRateLimit(`deposit-poll:${row.id}`, 1, 15);
    if (gate.allowed) {
      await verifyDeposit(row.id, "poll");
      const { data: again } = await supabase.from("deposits").select("status,paid_at,pay_amount").eq("id", row.id).maybeSingle();
      if (again) Object.assign(row, again);
    }
  }
  return {
    id: row.id, status: row.status as DepositView["status"], amount: Number(row.amount), payAmount: Number(row.pay_amount ?? row.amount), fee: Number(row.fee_amount ?? 0), method: row.method,
    channelCode: row.channel_code, payUrl: row.pay_url, info: (row.payment_info ?? {}) as Record<string, string | boolean>, expiresAt: row.expires_at, createdAt: row.created_at,
    paidAt: row.paid_at, sandbox: Boolean(row.is_sandbox), gateway: row.gateway === "paymenku",
  };
}

export async function cancelMyDeposit(id: unknown): Promise<UserResult> {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false, error: "Deposit tidak valid." };
  return guard(async (userId) => {
    const r = await cancelGatewayDeposit(parsed.data, { userId });
    return r.ok ? { ok: true, message: r.message } : { ok: false, error: r.message };
  });
}
