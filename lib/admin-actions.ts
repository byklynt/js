"use server";

import { revalidatePath } from "next/cache";
import { z, type ZodType } from "zod";
import { requireAdmin } from "@/lib/auth-server";
import type { SessionPayload } from "@/lib/session";
import { actionDb as getDb, withActionDb } from "@/lib/server/action-context";
import { logAdminAction } from "@/lib/admin-audit";
import { verifyAdminPassword } from "@/lib/admin-password";
import { revokeAdminSession as revokeSession, revokeOtherAdminSessions as revokeOthers } from "@/lib/server/admin-sessions";
import { createClient as createSupabase } from "@/lib/supabase/server";
import { finalPrice, setPriceRounding, type AdminService, type SiteSettings } from "@/lib/admin-data";
import { todayIso } from "@/lib/server/time";
import * as S from "@/lib/admin-schemas";
import { creditDeposit } from "@/lib/server/deposits";
import { approveHeldOrder, resolveManualCheck, resubmitFailedOrder } from "@/lib/server/orders";
import { createProviderClient, getAdapter } from "@/lib/server/providers/client";
import { checkLikeo } from "@/lib/server/providers/balance";
import { getOrder, updateOrder } from "@/lib/server/repo/orders";
import { loadSettings, saveRuleSet, saveSettings } from "@/lib/server/repo/settings";
import { callFn } from "@/lib/server/repo/rpc";
import { saveServices } from "@/lib/server/repo/services-repo";
import { loadProvider, updateProvider } from "@/lib/server/repo/providers";
import { applyCatalogSync, previewCatalogSync } from "@/lib/server/repo/services-repo";
import { notifyOrderStatus, notifyUser } from "@/lib/server/repo/notify";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { LIKEO_ID, providerMode } from "@/lib/server/providers/config";
import { ProviderError } from "@/lib/server/provider-client";
import { approveRefund, autoRefundForOrder, createManualRefund, rejectRefund, refundableRemaining } from "@/lib/server/refunds";
import { refundReasonFor } from "@/lib/server/rules";
import { syncOrders } from "@/lib/server/sync";
import { replyAsAdmin } from "@/lib/server/tickets";
import { notifyAnnouncement } from "@/lib/server/repo/announcements";
import { ipAllowed } from "@/lib/server/access";
import { getClientIp } from "@/lib/auth-server";
import { randomBytes } from "node:crypto";
import { nextRuleVersion } from "@/lib/order-rules";
import { applyAutoMarkup, previewAutoMarkup, recordPriceChange } from "@/lib/server/pricing";
import { ServiceError } from "@/lib/server/tx";

/**
 * Every export here is a server action reachable from the browser, so each one:
 * 1. calls requireAdmin("action") itself (never relies on proxy.ts alone),
 * 2. validates its input with zod on the server,
 * 3. writes to the audit log through logAdminAction().
 * Data lives in the in-memory store, persisted to the dev store file (see lib/server/store.ts). TODO(db): swap for the real database.
 */
export type ActionResult = { ok: true; message?: string; data?: unknown } | { ok: false; error: string };

const ok = (message?: string, data?: unknown): ActionResult => ({ ok: true, message, data });
const fail = (error: string): ActionResult => ({ ok: false, error });

async function run<Schema extends ZodType>(
  schema: Schema,
  input: unknown,
  handler: (data: z.infer<Schema>, admin: SessionPayload) => Promise<ActionResult> | ActionResult,
  opts: { services?: boolean } = {}
): Promise<ActionResult> {
  let admin: SessionPayload;
  try {
    admin = await requireAdmin("action");
  } catch (e) {
    if (e instanceof Error && e.message === "TWO_FACTOR_REQUIRED") return fail("Aktifkan verifikasi dua langkah dulu untuk memakai panel admin.");
    return fail("Kamu tidak punya akses untuk tindakan ini.");
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Data tidak valid.");
  try {
    const result = await withActionDb(async () => {
      const db = getDb();
      // Handlers that edit settings / order rules / price history mutate this request's snapshot; whatever changed is written back below.
      const settingsBefore = JSON.stringify(settingsPart(db.settings));
      const rulesBefore = JSON.stringify(db.settings.orderRules);
      const priceBefore = new Set(db.priceUpdates.map((u) => u.id));
      const res = await handler(parsed.data, admin);
      if (res.ok) {
        if (JSON.stringify(settingsPart(db.settings)) !== settingsBefore) await saveSettings(db.settings, admin.sub);
        if (JSON.stringify(db.settings.orderRules) !== rulesBefore) {
          const before = JSON.parse(rulesBefore) as typeof db.settings.orderRules;
          for (const set of Object.values(db.settings.orderRules)) if (JSON.stringify(set) !== JSON.stringify(before[set.key])) await saveRuleSet(set);
        }
        const fresh = db.priceUpdates.filter((u) => !priceBefore.has(u.id));
        if (fresh.length) await supabaseAdmin().from("price_updates").insert(fresh.map((u) => ({ service_id: u.serviceId, platform: u.platform, name: u.name, type: u.type, detail: u.detail })));
      }
      return res;
    }, opts);
    if (result.ok) {
      // Anything an admin changes (sync apply, prices, switches) must show up in the user area right away.
      revalidatePath("/admin", "layout");
      revalidatePath("/dashboard", "layout");
    }
    return result;
  } catch (e) {
    if (e instanceof ServiceError) return fail(e.message);
    console.error("[admin-actions]", e);
    return fail("Terjadi kesalahan di server. Coba lagi.");
  }
}

const settingsPart = ({ orderRules: _rules, ...rest }: SiteSettings) => (void _rules, rest);

async function audit(
  admin: SessionPayload,
  action: string,
  targetType: string,
  targetId: string,
  before: unknown,
  after: unknown
) {
  await logAdminAction({ adminId: admin.sub, adminName: admin.username, action, targetType, targetId, before, after });
}

async function reauth(admin: SessionPayload, password: string): Promise<boolean> {
  return verifyAdminPassword(admin.sub, password);
}

const rupiah = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export async function adjustBalance(input: unknown) {
  return run(S.adjustBalanceSchema, input, async (d, admin) => {
    if (!(await reauth(admin, d.password))) return fail("Password salah.");
    const { data: user } = await supabaseAdmin().from("profiles").select("id,username,balance").eq("id", d.userId).maybeSingle();
    if (!user) return fail("Pengguna tidak ditemukan.");
    const delta = d.direction === "tambah" ? d.amount : -d.amount;
    // The ledger entry and the audit log are written by ONE Postgres function in ONE transaction (never negative).
    await callFn("admin_adjust_balance", { p_admin: admin.sub, p_user: user.id, p_amount: delta, p_reason: d.reason });
    return ok(`Saldo ${user.username} ${d.direction === "tambah" ? "bertambah" : "berkurang"} ${rupiah(d.amount)}.`);
  });
}

async function profileOf(userId: string) {
  const { data } = await supabaseAdmin().from("profiles").select("id,username,email,status,role,rank,manual_approval").eq("id", userId).maybeSingle();
  return data;
}

export async function setUserStatus(input: unknown) {
  return run(S.userStatusSchema, input, async (d, admin) => {
    if (!(await reauth(admin, d.password))) return fail("Password salah.");
    const user = await profileOf(d.userId);
    if (!user || user.role === "admin") return fail("Pengguna tidak ditemukan.");
    await supabaseAdmin().from("profiles").update({ status: d.status }).eq("id", user.id);
    // A blocked user loses every session at once (they are also rejected on their next request).
    if (d.status === "diblokir") await supabaseAdmin().auth.admin.signOut(user.id, "global").catch(() => undefined);
    await audit(admin, d.status === "diblokir" ? "user.ban" : "user.unban", "user", user.id, { status: user.status }, { status: d.status });
    return ok(d.status === "diblokir" ? `${user.username} diblokir.` : `${user.username} diaktifkan kembali.`);
  });
}

export async function setUserReseller(input: unknown) {
  return run(S.resellerSchema, input, async (d, admin) => {
    const user = await profileOf(d.userId);
    if (!user || user.role === "admin") return fail("Pengguna tidak ditemukan.");
    const next = { role: d.reseller ? "reseller" : "user", rank: d.reseller ? "Reseller" : "Starter" };
    await supabaseAdmin().from("profiles").update(next).eq("id", user.id);
    await audit(admin, "user.reseller", "user", user.id, { reseller: user.role === "reseller", rank: user.rank }, { reseller: d.reseller, rank: next.rank });
    return ok(d.reseller ? `${user.username} kini reseller.` : `${user.username} bukan reseller lagi.`);
  });
}

export async function resetUserPassword(input: unknown) {
  return run(S.userIdSchema, input, async (d, admin) => {
    const user = await profileOf(d.userId);
    if (!user || user.role === "admin") return fail("Pengguna tidak ditemukan.");
    // No e-mail sending from the app yet: the admin gets a one-time temporary password to hand to the user (shown once, never stored by us).
    const temp = `${randomBytes(9).toString("base64url")}9a`;
    const { error } = await supabaseAdmin().auth.admin.updateUserById(user.id, { password: temp });
    if (error) return fail("Password tidak bisa direset. Coba lagi.");
    await supabaseAdmin().auth.admin.signOut(user.id, "global").catch(() => undefined);
    await audit(admin, "user.password.reset", "user", user.id, null, { email: user.email });
    return ok(`Password sementara untuk ${user.username} dibuat.`, { tempPassword: temp });
  });
}

export async function addUserNote(input: unknown) {
  return run(S.userNoteSchema, input, async (d, admin) => {
    const user = await profileOf(d.userId);
    if (!user) return fail("Pengguna tidak ditemukan.");
    await supabaseAdmin().from("user_notes").insert({ user_id: user.id, author_id: admin.sub, body: d.text });
    await audit(admin, "user.note.add", "user", user.id, null, { text: d.text });
    return ok("Catatan ditambahkan.");
  });
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

/** Status change. Final statuses that owe money trigger the same idempotent refund (inside Postgres) as the sync job. */
async function changeStatus(admin: SessionPayload, orderId: string, status: (typeof S.orderStatusEnum)["options"][number]): Promise<string | null> {
  const order = await getOrder(orderId);
  if (!order) return "Pesanan tidak ditemukan.";
  const before = { status: order.status, refundedAmount: order.refundedAmount };
  const patch: Record<string, unknown> = { status };
  if (status === "selesai") patch.remains = 0;
  if (status === "selesai" || status === "sebagian" || status === "dibatalkan" || status === "gagal_kirim") patch.completed_at = new Date().toISOString();
  await updateOrder(order.id, patch);
  if (refundReasonFor(status)) await autoRefundForOrder(order.id);
  await notifyOrderStatus({ id: order.id, userId: order.userId, status });
  const after = (await getOrder(orderId))!;
  await audit(admin, "order.status", "order", order.id, before, { status: after.status, refundedAmount: after.refundedAmount });
  return null;
}

export async function updateOrderStatus(input: unknown) {
  return run(S.orderStatusSchema, input, async (d, admin) => {
    const err = await changeStatus(admin, d.orderId, d.status);
    return err ? fail(err) : ok(`Status pesanan #${d.orderId} diubah.`);
  });
}

export async function setOrderCounts(input: unknown) {
  return run(S.orderCountsSchema, input, async (d, admin) => {
    const order = await getOrder(d.orderId);
    if (!order) return fail("Pesanan tidak ditemukan.");
    if (d.remains > order.quantity) return fail("Sisa tidak boleh melebihi jumlah pesanan.");
    const before = { startCount: order.startCount, remains: order.remains };
    await updateOrder(order.id, { start_count: d.startCount, remains: d.remains });
    await audit(admin, "order.counts", "order", order.id, before, { startCount: d.startCount, remains: d.remains });
    return ok(`Awal dan sisa pesanan #${order.id} diperbarui.`);
  });
}

export async function cancelOrder(input: unknown) {
  return run(S.orderCancelSchema, input, async (d, admin) => {
    if (!(await reauth(admin, d.password))) return fail("Password salah.");
    const order = await getOrder(d.orderId);
    if (!order) return fail("Pesanan tidak ditemukan.");
    if (order.status === "dibatalkan" || order.status === "selesai" || order.status === "gagal_kirim") return fail("Pesanan ini tidak bisa dibatalkan.");
    const before = { status: order.status, refundedAmount: order.refundedAmount };
    await updateOrder(order.id, { status: "dibatalkan", completed_at: new Date().toISOString() });
    await autoRefundForOrder(order.id);
    await notifyOrderStatus({ id: order.id, userId: order.userId, status: "dibatalkan" });
    const after = (await getOrder(order.id))!;
    await audit(admin, "order.cancel", "order", order.id, before, { status: "dibatalkan", refundedAmount: after.refundedAmount });
    return ok(`Pesanan #${order.id} dibatalkan dan ${rupiah(after.refundedAmount)} dikembalikan ke saldo.`);
  });
}

export async function resendOrder(input: unknown) {
  return run(S.orderResendSchema, input, async (d, admin) => {
    const order = await getOrder(d.orderId);
    if (!order) return fail("Pesanan tidak ditemukan.");
    if (order.status !== "gagal_kirim") return fail("Hanya pesanan gagal kirim yang bisa dikirim ulang.");
    const before = { status: order.status };
    const result = await resubmitFailedOrder(order.id, admin.sub, { client: createProviderClient() });
    await audit(admin, "order.resend", "order", order.id, before, { status: result.status, providerOrderId: result.providerOrderId });
    return ok(result.status === "gagal_kirim" ? `Pesanan #${order.id} masih gagal dikirim dan saldo dikembalikan.` : `Pesanan #${order.id} dikirim ulang ke provider.`);
  });
}

export async function resendAllFailedOrders(input: unknown) {
  return run(S.resendAllSchema, input, async (d, admin) => {
    if (!(await reauth(admin, d.password))) return fail("Password salah.");
    const { data: failed } = await supabaseAdmin().from("orders").select("id").eq("status", "gagal_kirim").eq("needs_manual_check", false).order("id").limit(200);
    let sent = 0;
    for (const row of failed ?? []) {
      try {
        const r = await resubmitFailedOrder(String(row.id), admin.sub, { client: createProviderClient() });
        if (r.status !== "gagal_kirim") sent++;
      } catch (e) {
        if (!(e instanceof ServiceError)) throw e; // e.g. the user's balance is too low now: skip this one
      }
    }
    await audit(admin, "order.resend_all", "order", "-", null, { total: failed?.length ?? 0, sent });
    return ok(`${sent} dari ${failed?.length ?? 0} pesanan berhasil dikirim ulang.`);
  });
}

export async function resyncProviders(input: unknown) {
  return run(S.resyncSchema, input, async (_d, admin) => {
    const res = await syncOrders(createProviderClient());
    await audit(admin, "sync.manual", "provider", "-", null, { checked: res.runs.reduce((n, r) => n + r.ordersChecked, 0), refunds: res.refundsCreated });
    return ok(`Sinkronisasi selesai. ${res.refundsCreated} refund otomatis dibuat.`);
  });
}

export async function bulkUpdateOrderStatus(input: unknown) {
  return run(S.bulkOrderStatusSchema, input, async (d, admin) => {
    const changed: string[] = [];
    for (const id of d.orderIds) {
      if (!(await changeStatus(admin, id, d.status))) changed.push(id);
    }
    await audit(admin, "order.bulk.status", "order", changed.join(","), null, { status: d.status, count: changed.length });
    return ok(`${changed.length} pesanan diubah ke status ${d.status}.`);
  });
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

function pushPriceUpdate(service: AdminService, oldPrice: number, newPrice: number) {
  recordPriceChange(getDb(), service, oldPrice, newPrice);
}

export async function updateService(input: unknown) {
  return run(S.serviceUpdateSchema, input, async (d, admin) => {
    const service = getDb().services.find((s) => s.id === d.id);
    if (!service) return fail("Layanan tidak ditemukan.");
    const before = { ...service, finalPrice: finalPrice(service) };
    const oldPrice = finalPrice(service);
    const wasActive = service.active;
    Object.assign(service, {
      name: d.name, providerId: d.providerId, providerServiceId: d.providerServiceId,
      providerPrice: d.providerPrice, markupType: d.markupType, markup: d.markup, min: d.min, max: d.max,
      refill: d.refill, refillDays: null, cancel: d.cancel, active: d.active, sort: d.sort,
    });
    const newPrice = finalPrice(service);
    pushPriceUpdate(service, oldPrice, newPrice);
    if (wasActive && !service.active) {
      getDb().priceUpdates.unshift({
        id: `pu_off_${service.id}`, serviceId: service.id, platform: service.platform, name: service.name,
        type: "nonaktif", date: todayIso(), detail: "Layanan dinonaktifkan sementara.",
      });
    }
    await saveServices([service]);
    await audit(admin, "service.update", "service", service.id, before, { ...service, finalPrice: newPrice });
    return ok(`Layanan ${service.id} disimpan. Harga akhir ${rupiah(newPrice)}/1000.`);
  }, { services: true });
}

export async function createService(input: unknown) {
  return run(S.serviceCreateSchema, input, async (d, admin) => {
    const db = getDb();
    const category = db.services.find((s) => s.categoryId === d.categoryId);
    const nextId = String(Math.max(...db.services.map((s) => Number(s.id))) + 1);
    const created: AdminService = {
      id: nextId, categoryId: d.categoryId, categoryLabel: category?.categoryLabel ?? "Lainnya",
      platform: category?.platform ?? "instagram", name: d.name, badges: [],
      providerId: d.providerId, providerServiceId: d.providerServiceId, providerPrice: d.providerPrice,
      markupType: d.markupType, markup: d.markup, min: d.min, max: d.max,
      refill: d.refill, refillDays: null, cancel: d.cancel, active: d.active, sort: d.sort,
    };
    db.services.push(created);
    await saveServices([created]);
    db.priceUpdates.unshift({
      id: `pu_new_${nextId}`, serviceId: nextId, platform: created.platform, name: created.name, type: "baru",
      date: todayIso(), detail: `Layanan baru tersedia dengan harga ${rupiah(finalPrice(created))} per 1000.`,
    });
    await audit(admin, "service.create", "service", nextId, null, created);
    return ok(`Layanan ${nextId} ditambahkan.`);
  }, { services: true });
}

export async function bulkMarkup(input: unknown) {
  return run(S.bulkMarkupSchema, input, async (d, admin) => {
    if (!(await reauth(admin, d.password))) return fail("Password salah.");
    const targets = getDb().services.filter((s) => d.scope === "semua" || s.categoryId === d.scope);
    if (targets.length === 0) return fail("Tidak ada layanan pada cakupan ini.");
    for (const s of targets) {
      const old = finalPrice(s);
      s.markupType = d.markupType;
      s.markup = d.markup;
      pushPriceUpdate(s, old, finalPrice(s));
    }
    await saveServices(targets);
    await audit(admin, "service.bulk_markup", "service", d.scope, null, { markupType: d.markupType, markup: d.markup, count: targets.length });
    return ok(`Markup diterapkan ke ${targets.length} layanan.`);
  }, { services: true });
}

/** Read-only diff against the provider catalogue (Likeo). Nothing is changed. */
export async function previewProviderSync(): Promise<ActionResult> {
  return run(S.providerIdSchema.partial(), {}, async () => {
    try {
      const items = await (await getAdapter()).getServices();
      // An empty answer is an error to show, not an empty list to accept silently.
      if (items.length === 0) return fail("Likeo mengembalikan 0 layanan. Cek API key dan URL lewat Tes koneksi di halaman Provider.");
      const preview = await previewCatalogSync(items);
      return ok(undefined, { preview, mode: providerMode() });
    } catch (e) {
      if (e instanceof ProviderError) return fail(e.message);
      console.error("[previewProviderSync]", e);
      return fail("Tidak bisa mengambil layanan dari provider.");
    }
  });
}

export async function applyProviderSync(input: unknown) {
  return run(S.syncApplySchema, input, async (d, admin) => {
    if (!(await reauth(admin, d.password))) return fail("Password salah.");
    let items;
    try {
      items = await (await getAdapter()).getServices();
    } catch (e) {
      return fail(e instanceof ProviderError ? e.message : "Tidak bisa mengambil layanan dari provider.");
    }
    // The admin approved a specific preview: if the provider or the rate changed since, ask for a new look.
    const fresh = await previewCatalogSync(items);
    if (fresh.blocked) return fail(fresh.blocked);
    if (fresh.fingerprint !== d.fingerprint) return fail("Katalog provider atau kurs berubah sejak pratinjau. Cek perubahan lagi.");
    const { count } = await supabaseAdmin().from("services").select("id", { count: "exact", head: true }).eq("provider_id", LIKEO_ID);
    const { result } = await applyCatalogSync(items);
    // Users must see the new services right away.
    revalidatePath("/dashboard", "layout");
    revalidatePath("/services");
    await audit(admin, "service.sync", "provider", LIKEO_ID, { services: count ?? 0 }, { ...result, fingerprint: d.fingerprint, mode: providerMode() });
    return ok(`${result.created} layanan baru, ${result.raised} harga naik, ${result.lowered} harga turun, ${result.deactivated} dinonaktifkan.`, result);
  });
}

export async function importServicesCsv(input: unknown) {
  return run(S.csvImportSchema, input, async (d, admin) => {
    // Format: id,providerPrice,markup  (header row optional). TODO: full import with validation per column.
    const db = getDb();
    let updated = 0;
    const touched: AdminService[] = [];
    for (const line of d.csv.split(/\r?\n/)) {
      const [id, price, markup] = line.split(",").map((p) => p.trim());
      const s = db.services.find((x) => x.id === id);
      const priceNum = Number(price);
      const markupNum = Number(markup);
      if (!s || !Number.isFinite(priceNum) || priceNum <= 0 || !Number.isFinite(markupNum) || markupNum < 0) continue;
      const old = finalPrice(s);
      s.providerPrice = priceNum;
      s.markup = markupNum;
      pushPriceUpdate(s, old, finalPrice(s));
      touched.push(s);
      updated++;
    }
    if (updated === 0) return fail("Tidak ada baris valid. Format: id,harga_provider,markup");
    await saveServices(touched);
    await audit(admin, "service.import", "service", "csv", null, { updated });
    return ok(`${updated} layanan diperbarui dari CSV.`);
  }, { services: true });
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

export async function testProviderConnection(input: unknown) {
  return run(S.providerIdSchema, input, async (d, admin) => {
    const p = await loadProvider(d.id);
    if (!p) return fail("Provider tidak ditemukan.");
    const res = await checkLikeo({ force: true });
    await audit(admin, "provider.test", "provider", p.id, null, { result: res.ok ? "ok" : "gagal", mode: providerMode(), http: res.probe?.httpStatus ?? null, reason: res.probe?.reason ?? null, ms: res.probe?.latencyMs ?? null });
    return res.ok ? ok(res.message) : fail(res.message);
  });
}

/** "Segarkan": reads the real balance now, ignoring the 60 second cache. Same request and diagnostics as "Tes koneksi". */
export async function refreshProviderBalanceAction(input: unknown) {
  return run(S.providerIdSchema, input, async (d, admin) => {
    const p = await loadProvider(d.id);
    if (!p) return fail("Provider tidak mendukung penyegaran saldo.");
    const res = await checkLikeo({ force: true });
    await audit(admin, "provider.balance_refresh", "provider", p.id, null, { ok: res.ok, mode: providerMode() });
    return res.ok ? ok(res.message) : fail(res.message);
  });
}

export async function savePricingSettings(input: unknown) {
  return run(S.pricingSettingsSchema, input, async (d, admin) => {
    const settings = await loadSettings();
    const before = { ...settings.pricing };
    settings.pricing = {
      ...settings.pricing, rateIdr: d.rateIdr, roundTo: d.roundTo,
      defaultMarkup: { markupType: d.defaultMarkupType, markup: d.defaultMarkup },
      providerMarkups: { ...settings.pricing.providerMarkups, [LIKEO_ID]: { markupType: d.providerMarkupType, markup: d.providerMarkup } },
    };
    await saveSettings(settings, admin.sub);
    // The balance shown in Rupiah follows the rate.
    const p = await loadProvider(LIKEO_ID);
    if (p?.balanceNative !== undefined && p.currency) await updateProvider(LIKEO_ID, { balance_idr: Math.round(p.balanceNative * d.rateIdr), exchange_rate: d.rateIdr });
    else await updateProvider(LIKEO_ID, { exchange_rate: d.rateIdr });
    await audit(admin, "settings.update", "settings", "pricing", { rateIdr: before.rateIdr, roundTo: before.roundTo }, d);
    return ok("Kurs dan markup disimpan. Jalankan sinkronisasi untuk memperbarui harga layanan.");
  });
}

/** An order whose submit ended in an unknown state: the admin checked the provider panel and decides. */
export async function resolveOrderManualCheck(input: unknown) {
  return run(S.manualCheckSchema, input, async (d, admin) => {
    if (!(await reauth(admin, d.password))) return fail("Password salah.");
    const order = await getOrder(d.orderId);
    if (!order) return fail("Pesanan tidak ditemukan.");
    const before = { status: order.status, refunded: order.refundedAmount };
    if (d.outcome === "sent" && !d.providerOrderId) return fail("Masukkan ID pesanan dari panel provider.");
    const after = await resolveManualCheck(order.id, d.outcome === "sent" ? { kind: "sent", providerOrderId: d.providerOrderId! } : { kind: "refund" });
    await audit(admin, "order.manual_check", "order", order.id, before, { outcome: d.outcome, status: after.status, refunded: after.refundedAmount, providerOrderId: after.providerOrderId });
    return ok(d.outcome === "refund" ? `Pesanan #${order.id} direfund penuh.` : `Pesanan #${order.id} ditautkan ke provider dan akan disinkronkan.`);
  });
}

export async function setProviderStatus(input: unknown) {
  return run(S.providerIdSchema.extend({ active: z.boolean() }), input, async (d, admin) => {
    const p = await loadProvider(d.id);
    if (!p) return fail("Provider tidak ditemukan.");
    const before = { status: p.status };
    await updateProvider(p.id, { active: d.active });
    revalidatePath("/dashboard", "layout");
    await audit(admin, "provider.status", "provider", p.id, before, { status: d.active ? "aktif" : "nonaktif" });
    return ok(`${p.name} ${d.active ? "diaktifkan" : "dinonaktifkan"}.`);
  });
}

// ---------------------------------------------------------------------------
// Deposits, refills, refunds
// ---------------------------------------------------------------------------

export async function confirmDeposit(input: unknown) {
  return run(S.depositConfirmSchema, input, async (d, admin) => {
    if (!(await reauth(admin, d.password))) return fail("Password salah.");
    const { data: deposit } = await supabaseAdmin().from("deposits").select("id,status,amount,external_id,user_id,profiles(username,balance)").eq("id", d.id).maybeSingle();
    if (!deposit) return fail("Deposit tidak ditemukan.");
    if (deposit.status !== "menunggu") return fail("Hanya deposit berstatus Menunggu yang bisa dikonfirmasi.");
    const owner = deposit.profiles as unknown as { username: string; balance: number } | null;
    const before = { status: deposit.status, userBalance: owner ? Number(owner.balance) : undefined };
    // Same function as the payment webhook, so a late webhook for this deposit is ignored as a duplicate.
    const res = await creditDeposit({ depositId: deposit.id, externalId: deposit.external_id, by: admin.sub });
    const { data: after } = await supabaseAdmin().from("profiles").select("balance").eq("id", deposit.user_id).single();
    await audit(admin, "deposit.confirm", "deposit", deposit.id, before, { status: "berhasil", userBalance: Number(after?.balance ?? 0), bonus: res.bonus });
    return ok(`Deposit #${deposit.id.slice(0, 8)} dikonfirmasi. Saldo ${owner?.username ?? "pengguna"} bertambah ${rupiah(Number(deposit.amount) + res.bonus)}.`);
  });
}

export async function rejectDeposit(input: unknown) {
  return run(S.depositRejectSchema, input, async (d, admin) => {
    const { data: deposit } = await supabaseAdmin().from("deposits").select("id,status,amount,user_id").eq("id", d.id).maybeSingle();
    if (!deposit) return fail("Deposit tidak ditemukan.");
    if (deposit.status !== "menunggu") return fail("Hanya deposit berstatus Menunggu yang bisa ditolak.");
    const { data: updated } = await supabaseAdmin().from("deposits").update({ status: "gagal" }).eq("id", deposit.id).eq("status", "menunggu").select("id");
    if (!updated?.length) return fail("Deposit ini sudah diproses.");
    await notifyUser(deposit.user_id, {
      type: "deposit", title: `Deposit ${rupiah(Number(deposit.amount))} gagal`,
      body: "Deposit tidak dapat diproses. Hubungi support jika kamu sudah membayar.", href: "/dashboard/add-funds", dedupeKey: `deposit:${deposit.id}:gagal`,
    });
    await audit(admin, "deposit.reject", "deposit", deposit.id, { status: "menunggu" }, { status: "gagal", reason: d.reason });
    return ok(`Deposit #${deposit.id.slice(0, 8)} ditolak.`);
  });
}

export async function reviewRefill(input: unknown) {
  return run(S.reviewSchema, input, async (d, admin) => {
    const db = supabaseAdmin();
    const { data: refill } = await db.from("refill_requests").select("id,status,user_id,order_id").eq("id", d.id).maybeSingle();
    if (!refill) return fail("Refill tidak ditemukan.");
    const status = d.action === "setujui" ? "berjalan" : d.action === "tolak" ? "ditolak" : "selesai";
    await db.from("refill_requests").update({ status, ...(d.action === "tolak" ? { reject_reason: "Ditolak oleh admin." } : {}) }).eq("id", refill.id);
    await notifyUser(refill.user_id, {
      type: "pesanan", title: `Refill pesanan #${refill.order_id} ${d.action === "setujui" ? "diproses" : d.action === "tolak" ? "ditolak" : "selesai"}`,
      body: d.action === "tolak" ? "Permintaan refill ditolak. Buka tiket bila ada pertanyaan." : "Lihat statusnya di halaman Refill.",
      href: "/dashboard/refill", dedupeKey: `refill:${refill.id}:${status}`,
    });
    await audit(admin, `refill.${d.action}`, "refill", refill.id, { status: refill.status }, { status });
    return ok(`Refill #${refill.id.slice(0, 8)} ${d.action === "setujui" ? "diproses" : d.action === "tolak" ? "ditolak" : "ditandai selesai"}.`);
  });
}

export async function reviewRefund(input: unknown) {
  return run(S.refundReviewSchema, input, async (d, admin) => {
    const db = supabaseAdmin();
    const { data: refund } = await db.from("refunds").select("id,status,amount,reason,user_id,order_id,policy_percent,overridden,profiles(username)").eq("id", d.id).maybeSingle();
    if (!refund) return fail("Refund tidak ditemukan.");
    const username = (refund.profiles as unknown as { username: string } | null)?.username ?? "pengguna";
    const before = { status: refund.status, amount: Number(refund.amount) };
    if (d.action === "setujui") {
      // Money action: re-enter the admin password.
      if (!d.password || !(await reauth(admin, d.password))) return fail("Password salah.");
      const order = await getOrder(refund.order_id);
      const res = await approveRefund(refund.id, admin.sub, { overrideAmount: d.overrideAmount, overrideReason: d.overrideReason });
      if (!res.duplicate && refund.reason === "user_cancel" && order?.providerOrderId) {
        // Best effort: the panel-side cancellation and refund already happened; ask the provider to stop the order too.
        try {
          await createProviderClient().cancelOrder(order.providerId, order.providerOrderId);
        } catch {
          /* provider unreachable: the order is cancelled here either way */
        }
      }
      await audit(admin, refund.reason === "user_cancel" ? "refund.approve_user_cancel" : "refund.approve", "refund", refund.id, before, {
        status: res.status, amount: Number(res.amount), userId: refund.user_id, policyPercent: refund.policy_percent, overridden: d.overrideAmount !== undefined, overrideReason: d.overrideReason ?? null,
      });
      return ok(res.duplicate ? "Refund ini sudah diproses sebelumnya." : `Refund ${rupiah(Number(res.amount))} dikembalikan ke saldo ${username}.`);
    }
    await rejectRefund(refund.id, admin.sub, d.reason);
    await audit(admin, "refund.reject", "refund", refund.id, before, { status: "ditolak", reason: d.reason });
    return ok(`Refund untuk ${username} ditolak.`);
  });
}

/** Manual refund created by an admin. Amount can never exceed charge minus what was already refunded (enforced in Postgres). */
export async function createRefund(input: unknown) {
  return run(S.refundCreateSchema, input, async (d, admin) => {
    if (!(await reauth(admin, d.password))) return fail("Password salah.");
    const order = await getOrder(d.orderId);
    if (!order) return fail("Pesanan tidak ditemukan.");
    if (d.amount > refundableRemaining(order)) return fail(`Nominal melebihi sisa yang bisa direfund (${rupiah(refundableRemaining(order))}).`);
    const row = await createManualRefund({ orderId: order.id, amount: d.amount, note: d.reason, source: "admin", adminId: admin.sub, settleNow: true });
    await audit(admin, "refund.create", "refund", row.refund_id, { refundedAmount: order.refundedAmount }, { refundedAmount: order.refundedAmount + d.amount, amount: d.amount, reason: d.reason });
    return ok(`Refund ${rupiah(d.amount)} untuk pesanan #${order.id} dikirim ke saldo ${order.username}.`);
  });
}

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------

export async function setTicketStatus(input: unknown) {
  return run(S.ticketStatusSchema, input, async (d, admin) => {
    const db = supabaseAdmin();
    const { data: ticket } = await db.from("tickets").select("id,status").eq("number", Number(d.ticketId)).maybeSingle();
    if (!ticket) return fail("Tiket tidak ditemukan.");
    await db.from("tickets").update({ status: d.status }).eq("id", ticket.id);
    await audit(admin, "ticket.status", "ticket", d.ticketId, { status: ticket.status }, { status: d.status });
    return ok(`Status tiket #${d.ticketId} diubah.`);
  });
}

export async function assignTicket(input: unknown) {
  return run(S.ticketAssignSchema, input, async (d, admin) => {
    const db = supabaseAdmin();
    const { data: ticket } = await db.from("tickets").select("id,assignee").eq("number", Number(d.ticketId)).maybeSingle();
    if (!ticket) return fail("Tiket tidak ditemukan.");
    // The assignee is an admin username; resolve it to the profile id (empty = unassign).
    let assignee: string | null = null;
    if (d.assignee) {
      const { data: who } = await db.from("profiles").select("id").eq("username", d.assignee).eq("role", "admin").maybeSingle();
      if (!who) return fail("Admin tidak ditemukan.");
      assignee = who.id;
    }
    await db.from("tickets").update({ assignee }).eq("id", ticket.id);
    await audit(admin, "ticket.assign", "ticket", d.ticketId, { assignee: ticket.assignee }, { assignee });
    return ok(d.assignee ? `Tiket ditugaskan ke ${d.assignee}.` : "Penugasan tiket dihapus.");
  });
}

export async function addTicketNote(input: unknown) {
  return run(S.ticketNoteSchema, input, async (d, admin) => {
    await replyAsAdmin(admin.sub, d.ticketId, { message: d.text, internal: true });
    await audit(admin, "ticket.note", "ticket", d.ticketId, null, { text: d.text });
    return ok("Catatan internal disimpan.");
  });
}

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

/** The user area reads the same rows (lib/server/announcements.ts), so a save must refresh those pages. */
function refreshUserAnnouncements() {
  revalidatePath("/dashboard", "layout");
  revalidatePath("/dashboard/updates");
}

export async function saveAnnouncement(input: unknown) {
  return run(S.announcementSchema, input, async (d, admin) => {
    const db = supabaseAdmin();
    const fields = { title: d.title, body: d.body, audience: d.audience, placements: d.placements, level: d.level, publish_at: d.publishAt, expires_at: d.expiresAt || null, active: d.active };
    if (d.id) {
      const { data: before } = await db.from("announcements").select("*").eq("id", d.id).maybeSingle();
      if (!before) return fail("Pengumuman tidak ditemukan.");
      // updated_at changes on every edit: users who dismissed the old text see the banner again.
      const { data: a, error } = await db.from("announcements").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", d.id).select("*").single();
      if (error) return fail("Pengumuman tidak bisa disimpan.");
      await notifyAnnouncement(a);
      await audit(admin, "announcement.update", "announcement", a.id, before, a);
      refreshUserAnnouncements();
      return ok("Pengumuman diperbarui.");
    }
    const { data: created, error } = await db.from("announcements").insert({ ...fields, created_by: admin.sub }).select("*").single();
    if (error) return fail("Pengumuman tidak bisa dibuat.");
    await notifyAnnouncement(created);
    await audit(admin, "announcement.create", "announcement", created.id, null, created);
    refreshUserAnnouncements();
    return ok("Pengumuman dibuat.");
  });
}

export async function deleteAnnouncement(input: unknown) {
  return run(S.announcementDeleteSchema, input, async (d, admin) => {
    if (!(await reauth(admin, d.password))) return fail("Password salah.");
    const db = supabaseAdmin();
    const { data: removed } = await db.from("announcements").delete().eq("id", d.id).select("*").maybeSingle();
    if (!removed) return fail("Pengumuman tidak ditemukan.");
    await audit(admin, "announcement.delete", "announcement", removed.id, removed, null);
    refreshUserAnnouncements();
    return ok("Pengumuman dihapus.");
  });
}

// ---------------------------------------------------------------------------
// Order rules and cancel policy ("Ketentuan Order")
// ---------------------------------------------------------------------------

/** Editing a platform's rules bumps its version, so every user has to accept the new text before ordering again. */
export async function saveOrderRule(input: unknown) {
  return run(S.orderRuleSchema, input, async (d, admin) => {
    const db = getDb();
    const current = db.settings.orderRules[d.key];
    const before = { title: current.title, bullets: current.bullets, version: current.version };
    db.settings.orderRules[d.key] = { ...current, title: d.title, bullets: d.bullets, version: nextRuleVersion(current.version), updatedAt: new Date().toISOString() };
    await audit(admin, "settings.order_rules", "settings", d.key, before, { title: d.title, bullets: d.bullets, version: db.settings.orderRules[d.key].version });
    revalidatePath("/dashboard", "layout");
    revalidatePath("/refund-policy");
    return ok(`Ketentuan ${current.label} disimpan (${db.settings.orderRules[d.key].version}). Pengguna perlu menyetujui ulang.`);
  });
}

/** The numbers in the policy text are part of what users accept, so changing them bumps every platform's version. */
export async function saveCancelPolicy(input: unknown) {
  return run(S.cancelPolicySchema, input, async (d, admin) => {
    const db = getDb();
    const before = { ...db.settings.cancelPolicy, versions: Object.fromEntries(Object.values(db.settings.orderRules).map((r) => [r.key, r.version])) };
    db.settings.cancelPolicy = { minAgeHours: d.minAgeHours, refundPercent: d.refundPercent };
    const now = new Date().toISOString();
    for (const key of Object.keys(db.settings.orderRules) as (keyof typeof db.settings.orderRules)[]) {
      const r = db.settings.orderRules[key];
      db.settings.orderRules[key] = { ...r, version: nextRuleVersion(r.version), updatedAt: now };
    }
    await audit(admin, "settings.cancel_policy", "settings", "cancel_policy", before, { ...db.settings.cancelPolicy });
    revalidatePath("/dashboard", "layout");
    revalidatePath("/refund-policy");
    return ok("Kebijakan pembatalan disimpan. Pengguna perlu menyetujui ulang ketentuan order.");
  });
}

// ---------------------------------------------------------------------------
// Site settings
// ---------------------------------------------------------------------------

export async function saveGeneralSettings(input: unknown) {
  return run(S.settingsGeneralSchema, input, async (d, admin) => {
    const db = getDb();
    const before = { ...db.settings.general };
    db.settings.general = { ...db.settings.general, ...d };
    await audit(admin, "settings.update", "settings", "general", before, db.settings.general);
    return ok("Pengaturan umum disimpan.");
  });
}

export async function savePaymentSettings(input: unknown) {
  return run(S.settingsPaymentsSchema, input, async (d, admin) => {
    const db = getDb();
    const before = { ...db.settings.payments };
    db.settings.payments = { ...d, bonusTiers: [...d.bonusTiers].sort((a, b) => a.min - b.min) };
    await audit(admin, "settings.update", "settings", "payments", before, db.settings.payments);
    return ok("Pengaturan pembayaran disimpan.");
  });
}

export async function saveRankSettings(input: unknown) {
  return run(S.settingsRanksSchema, input, async (d, admin) => {
    const db = getDb();
    const before = db.settings.ranks;
    db.settings.ranks = d.ranks;
    await audit(admin, "settings.update", "settings", "ranks", before, d.ranks);
    return ok("Pengaturan peringkat disimpan.");
  });
}

export async function saveOperationsSettings(input: unknown) {
  return run(S.settingsOperationsSchema, input, async (d, admin) => {
    const db = getDb();
    const before = { operations: { ...db.settings.operations }, risk: { ...db.settings.risk }, pricing: { ...db.settings.pricing }, limits: { ...db.settings.limits } };
    db.settings.operations = { stuckHours: d.stuckHours, lowBalanceThreshold: d.lowBalanceThreshold, autoDisableLowBalance: d.autoDisableLowBalance };
    db.settings.risk = { ratioPercent: d.riskRatioPercent, minOrders: d.riskMinOrders };
    db.settings.pricing = { ...db.settings.pricing, minMarginPercent: d.minMarginPercent, autoAdjust: d.autoAdjustPrice };
    db.settings.limits = { ordersPerMinute: d.ordersPerMinute, ticketsPerHour: d.ticketsPerHour };
    await audit(admin, "settings.update", "settings", "operations", before, d);
    return ok("Pengaturan operasional disimpan.");
  });
}

export async function saveMonitoringSettings(input: unknown) {
  return run(S.settingsMonitoringSchema, input, async (d, admin) => {
    const db = getDb();
    const before = { configured: Boolean(db.settings.ops.monitoringDsn) };
    db.settings.ops.monitoringDsn = d.monitoringDsn;
    await audit(admin, "settings.update", "settings", "monitoring", before, { configured: Boolean(d.monitoringDsn) });
    return ok("Pengaturan pemantauan error disimpan.");
  });
}

export async function saveSecuritySettings(input: unknown) {
  return run(S.settingsSecuritySchema, input, async (d, admin) => {
    const db = getDb();
    // Turning the 2FA requirement OFF lowers security: password again.
    if (!d.requireAdmin2fa && db.settings.security.requireAdmin2fa && !(await reauth(admin, d.password ?? ""))) return fail("Password salah.");
    const before = { requireAdmin2fa: db.settings.security.requireAdmin2fa };
    db.settings.security.requireAdmin2fa = d.requireAdmin2fa;
    await audit(admin, "settings.update", "settings", "security", before, { requireAdmin2fa: d.requireAdmin2fa });
    return ok("Pengaturan keamanan disimpan.");
  });
}

/** Lockout-safe: the list must contain the caller's own IP, otherwise the save would lock them out. */
export async function saveIpAllowlist(input: unknown) {
  return run(S.ipAllowlistSchema, input, async (d, admin) => {
    if (!(await reauth(admin, d.password))) return fail("Password salah.");
    const ip = await getClientIp();
    const list = Array.from(new Set(d.ips));
    if (list.length > 0 && !ipAllowed(list, ip)) {
      return fail(`Alamat IP kamu (${ip}) tidak ada di daftar. Tambahkan dulu supaya kamu tidak terkunci.`);
    }
    const db = getDb();
    const before = { ipAllowlist: db.settings.security.ipAllowlist };
    db.settings.security.ipAllowlist = list;
    await audit(admin, "settings.ip_allowlist", "settings", "security", before, { ipAllowlist: list });
    return ok(list.length ? `Daftar IP disimpan (${list.length} alamat).` : "Daftar IP dikosongkan. Pembatasan IP nonaktif.");
  });
}

export async function revokeAdminSession(input: unknown) {
  return run(S.sessionRevokeSchema, input, async (d, admin) => {
    if (!(await revokeSession(d.id, admin.sub))) return fail("Sesi tidak ditemukan.");
    await audit(admin, "session.revoke", "session", d.id, null, { revoked: true });
    return ok(d.id === admin.sid ? "Sesi ini dicabut. Kamu akan keluar." : "Sesi dicabut.");
  });
}

export async function revokeOtherAdminSessions() {
  return run(S.resyncSchema, {}, async (_d, admin) => {
    const n = await revokeOthers(admin.sub, admin.sid);
    await audit(admin, "session.revoke_all", "session", admin.sub, null, { revoked: n });
    return ok(n ? `${n} sesi lain dicabut.` : "Tidak ada sesi lain yang aktif.");
  });
}

export async function saveNotificationSettings(input: unknown) {
  return run(S.settingsNotificationsSchema, input, async (d, admin) => {
    const db = getDb();
    const before = { ...db.settings.notifications };
    db.settings.notifications = d;
    await audit(admin, "settings.update", "settings", "notifications", before, d);
    return ok("Pengaturan notifikasi disimpan.");
  });
}

// ---------------------------------------------------------------------------
// Risk, held orders, pricing safety
// ---------------------------------------------------------------------------

export async function setUserManualApproval(input: unknown) {
  return run(S.userApprovalSchema, input, async (d, admin) => {
    const user = await profileOf(d.userId);
    if (!user) return fail("Pengguna tidak ditemukan.");
    await supabaseAdmin().from("profiles").update({ manual_approval: d.manualApproval }).eq("id", user.id);
    await audit(admin, "user.manual_approval", "user", user.id, { manualApproval: user.manual_approval }, { manualApproval: d.manualApproval });
    return ok(d.manualApproval ? `Pesanan dan refund ${user.username} sekarang perlu persetujuan admin.` : `Persetujuan manual untuk ${user.username} dimatikan.`);
  });
}

export async function releaseHeldOrder(input: unknown) {
  return run(S.orderApproveSchema, input, async (d, admin) => {
    const before = { held: (await getOrder(d.orderId))?.held };
    const order = await approveHeldOrder(d.orderId, { client: createProviderClient() });
    await audit(admin, "order.release", "order", order.id, before, { held: false, status: order.status });
    return ok(order.status === "gagal_kirim" ? `Pesanan #${order.id} gagal dikirim dan saldo dikembalikan.` : `Pesanan #${order.id} disetujui dan dikirim ke provider.`);
  });
}

export async function previewMarginFix(input: unknown) {
  return run(S.autoMarkupSchema.omit({ password: true }), input, (d) => ok(undefined, { changes: previewAutoMarkup(getDb(), d.serviceIds) }), { services: true });
}

export async function applyMarginFix(input: unknown) {
  return run(S.autoMarkupSchema, input, async (d, admin) => {
    if (!(await reauth(admin, d.password))) return fail("Password salah.");
    const db = getDb();
    const preview = previewAutoMarkup(db, d.serviceIds);
    const changes = applyAutoMarkup(db, d.serviceIds);
    await saveServices(db.services.filter((x) => changes.some((c) => c.serviceId === x.id)));
    await audit(admin, "service.auto_markup", "service", "margin", { services: preview.map((c) => ({ id: c.serviceId, price: c.oldPrice })) }, { services: changes.map((c) => ({ id: c.serviceId, price: c.newPrice })) });
    return ok(changes.length ? `Markup otomatis diterapkan ke ${changes.length} layanan.` : "Tidak ada layanan dengan margin tipis.");
  }, { services: true });
}

export async function changeAdminPassword(input: unknown) {
  return run(S.changePasswordSchema, input, async (d, admin) => {
    if (!(await verifyAdminPassword(admin.sub, d.current))) return fail("Password saat ini salah.");
    const { error } = await (await createSupabase()).auth.updateUser({ password: d.next });
    if (error) return fail(error.code === "same_password" ? "Password baru harus berbeda dari yang lama." : "Password tidak bisa diubah. Coba lagi.");
    await audit(admin, "admin.password.change", "admin", admin.sub, null, { changed: true });
    return ok("Password berhasil diubah.");
  });
}
