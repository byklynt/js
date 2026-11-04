"use server";

import { revalidatePath } from "next/cache";
import type { ZodType, z } from "zod";
import { requireAdmin } from "@/lib/auth-server";
import type { SessionPayload } from "@/lib/session";
import { getDb } from "@/lib/admin-db";
import { logAdminAction } from "@/lib/admin-audit";
import { setAdminPassword, verifyAdminPassword } from "@/lib/admin-password";
import { finalPrice, setPriceRounding, type AdminService } from "@/lib/admin-data";
import { todayIso } from "@/lib/server/time";
import * as S from "@/lib/admin-schemas";
import { applyLedgerEntry } from "@/lib/server/ledger";
import { creditDeposit } from "@/lib/server/deposits";
import { resolveManualCheck, resubmitFailedOrder } from "@/lib/server/orders";
import { createProviderClient, getAdapter } from "@/lib/server/providers/client";
import { applyCatalog, buildSyncPreview, logStages, serviceStages } from "@/lib/server/providers/catalog";
import { checkLikeo } from "@/lib/server/providers/balance";
import { LIKEO_ID, providerMode } from "@/lib/server/providers/config";
import { ProviderError } from "@/lib/server/provider-client";
import { approveRefund, autoRefundForOrder, createManualRefund, rejectRefund, refundableRemaining } from "@/lib/server/refunds";
import { refundReasonFor } from "@/lib/server/rules";
import { syncOrders } from "@/lib/server/sync";
import { approveHeldOrder } from "@/lib/server/orders";
import { replyAsAdmin } from "@/lib/server/tickets";
import { notifyDeposit, notifyOrderStatus } from "@/lib/server/notifications";
import { notifyAnnouncement } from "@/lib/server/announcements";
import { ipAllowed, requireReauth } from "@/lib/server/access";
import { getClientIp } from "@/lib/auth-server";
import { persistAdminState } from "@/lib/server/store";
import { nextRuleVersion } from "@/lib/order-rules";
import { applyAutoMarkup, previewAutoMarkup, recordPriceChange } from "@/lib/server/pricing";
import { ServiceError, withTransaction } from "@/lib/server/tx";

/**
 * Every export here is a server action reachable from the browser, so each one:
 * 1. calls requireAdmin("action") itself (never relies on proxy.ts alone),
 * 2. validates its input with zod on the server,
 * 3. writes to the audit log through logAdminAction().
 * All data lives in the mock in-memory DB. TODO: swap for the real database/API calls.
 */
export type ActionResult = { ok: true; message?: string; data?: unknown } | { ok: false; error: string };

const ok = (message?: string, data?: unknown): ActionResult => ({ ok: true, message, data });
const fail = (error: string): ActionResult => ({ ok: false, error });

async function run<Schema extends ZodType>(
  schema: Schema,
  input: unknown,
  handler: (data: z.infer<Schema>, admin: SessionPayload) => Promise<ActionResult> | ActionResult
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
    const result = await handler(parsed.data, admin);
    if (result.ok) {
      persistAdminState(getDb());
      revalidatePath("/admin", "layout");
    }
    return result;
  } catch (e) {
    if (e instanceof ServiceError) return fail(e.message);
    return fail("Terjadi kesalahan di server. Coba lagi.");
  }
}

function audit(
  admin: SessionPayload,
  action: string,
  targetType: string,
  targetId: string,
  before: unknown,
  after: unknown
) {
  logAdminAction({ adminId: admin.sub, adminName: admin.username, action, targetType, targetId, before, after });
}

function reauth(admin: SessionPayload, password: string): boolean {
  return verifyAdminPassword(admin.sub, password);
}

const rupiah = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export async function adjustBalance(input: unknown) {
  return run(S.adjustBalanceSchema, input, (d, admin) => {
    if (!reauth(admin, d.password)) return fail("Password salah.");
    const db = getDb();
    const user = db.users.find((u) => u.id === d.userId);
    if (!user) return fail("Pengguna tidak ditemukan.");
    const before = { balance: user.balance };
    const delta = d.direction === "tambah" ? d.amount : -d.amount;
    // Every balance change goes through the ledger (single transaction, never negative).
    withTransaction(db, () =>
      applyLedgerEntry(db, {
        userId: user.id, type: "adjustment", amount: delta, refType: "admin_adjust", refId: `${user.id}:${Date.now()}`,
        note: d.reason, createdBy: admin.sub,
      })
    );
    audit(admin, "user.balance.adjust", "user", user.id, before, { balance: user.balance, delta, reason: d.reason });
    return ok(`Saldo ${user.username} ${d.direction === "tambah" ? "bertambah" : "berkurang"} ${rupiah(d.amount)}.`);
  });
}

export async function setUserStatus(input: unknown) {
  return run(S.userStatusSchema, input, (d, admin) => {
    if (!reauth(admin, d.password)) return fail("Password salah.");
    const user = getDb().users.find((u) => u.id === d.userId);
    if (!user) return fail("Pengguna tidak ditemukan.");
    const before = { status: user.status };
    user.status = d.status;
    audit(admin, d.status === "diblokir" ? "user.ban" : "user.unban", "user", user.id, before, { status: user.status });
    return ok(d.status === "diblokir" ? `${user.username} diblokir.` : `${user.username} diaktifkan kembali.`);
  });
}

export async function setUserReseller(input: unknown) {
  return run(S.resellerSchema, input, (d, admin) => {
    const user = getDb().users.find((u) => u.id === d.userId);
    if (!user) return fail("Pengguna tidak ditemukan.");
    const before = { reseller: user.reseller, rank: user.rank };
    user.reseller = d.reseller;
    user.rank = d.reseller ? "Reseller" : "Starter";
    audit(admin, "user.reseller", "user", user.id, before, { reseller: user.reseller, rank: user.rank });
    return ok(d.reseller ? `${user.username} kini reseller.` : `${user.username} bukan reseller lagi.`);
  });
}

export async function resetUserPassword(input: unknown) {
  return run(S.userIdSchema, input, (d, admin) => {
    const user = getDb().users.find((u) => u.id === d.userId);
    if (!user) return fail("Pengguna tidak ditemukan.");
    // TODO: send a real password-reset email through the auth provider.
    audit(admin, "user.password.reset", "user", user.id, null, { email: user.email });
    return ok(`Tautan reset password dikirim ke ${user.email} (contoh).`);
  });
}

export async function addUserNote(input: unknown) {
  return run(S.userNoteSchema, input, (d, admin) => {
    const user = getDb().users.find((u) => u.id === d.userId);
    if (!user) return fail("Pengguna tidak ditemukan.");
    user.notes.push(d.text);
    audit(admin, "user.note.add", "user", user.id, null, { text: d.text });
    return ok("Catatan ditambahkan.");
  });
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

/** Status change. Final statuses that owe money trigger the same idempotent refund as the sync job. */
function changeStatus(admin: SessionPayload, orderId: string, status: (typeof S.orderStatusEnum)["options"][number]): string | null {
  const db = getDb();
  const order = db.orders.find((o) => o.id === orderId);
  if (!order) return "Pesanan tidak ditemukan.";
  const before = { status: order.status, refundedAmount: order.refundedAmount };
  withTransaction(db, () => {
    order.status = status;
    if (status === "selesai") { order.remains = 0; order.completedAt = new Date().toISOString(); }
    if (refundReasonFor(status)) autoRefundForOrder(db, order.id);
    notifyOrderStatus(db, order);
  });
  audit(admin, "order.status", "order", order.id, before, { status: order.status, refundedAmount: order.refundedAmount });
  return null;
}

export async function updateOrderStatus(input: unknown) {
  return run(S.orderStatusSchema, input, (d, admin) => {
    const err = changeStatus(admin, d.orderId, d.status);
    return err ? fail(err) : ok(`Status pesanan #${d.orderId} diubah.`);
  });
}

export async function setOrderCounts(input: unknown) {
  return run(S.orderCountsSchema, input, (d, admin) => {
    const order = getDb().orders.find((o) => o.id === d.orderId);
    if (!order) return fail("Pesanan tidak ditemukan.");
    if (d.remains > order.quantity) return fail("Sisa tidak boleh melebihi jumlah pesanan.");
    const before = { startCount: order.startCount, remains: order.remains };
    order.startCount = d.startCount;
    order.remains = d.remains;
    audit(admin, "order.counts", "order", order.id, before, { startCount: d.startCount, remains: d.remains });
    return ok(`Awal dan sisa pesanan #${order.id} diperbarui.`);
  });
}

export async function cancelOrder(input: unknown) {
  return run(S.orderCancelSchema, input, (d, admin) => {
    if (!reauth(admin, d.password)) return fail("Password salah.");
    const db = getDb();
    const order = db.orders.find((o) => o.id === d.orderId);
    if (!order) return fail("Pesanan tidak ditemukan.");
    if (order.status === "dibatalkan" || order.status === "selesai" || order.status === "gagal_kirim") return fail("Pesanan ini tidak bisa dibatalkan.");
    const before = { status: order.status, refundedAmount: order.refundedAmount };
    withTransaction(db, () => {
      order.status = "dibatalkan";
      autoRefundForOrder(db, order.id);
      notifyOrderStatus(db, order);
    });
    audit(admin, "order.cancel", "order", order.id, before, { status: "dibatalkan", refundedAmount: order.refundedAmount });
    return ok(`Pesanan #${order.id} dibatalkan dan ${rupiah(order.refundedAmount)} dikembalikan ke saldo.`);
  });
}

export async function resendOrder(input: unknown) {
  return run(S.orderResendSchema, input, async (d, admin) => {
    const db = getDb();
    const order = db.orders.find((o) => o.id === d.orderId);
    if (!order) return fail("Pesanan tidak ditemukan.");
    if (order.status !== "gagal_kirim") return fail("Hanya pesanan gagal kirim yang bisa dikirim ulang.");
    const before = { status: order.status };
    const result = await resubmitFailedOrder(db, order.id, admin.sub, { client: createProviderClient(db) });
    audit(admin, "order.resend", "order", order.id, before, { status: result.status, providerOrderId: result.providerOrderId });
    return ok(result.status === "gagal_kirim" ? `Pesanan #${order.id} masih gagal dikirim dan saldo dikembalikan.` : `Pesanan #${order.id} dikirim ulang ke provider.`);
  });
}

export async function resendAllFailedOrders(input: unknown) {
  return run(S.resendAllSchema, input, async (d, admin) => {
    if (!reauth(admin, d.password)) return fail("Password salah.");
    const db = getDb();
    const failed = db.orders.filter((o) => o.status === "gagal_kirim");
    let sent = 0;
    for (const order of failed) {
      try {
        const r = await resubmitFailedOrder(db, order.id, admin.sub, { client: createProviderClient(db) });
        if (r.status !== "gagal_kirim") sent++;
      } catch (e) {
        if (!(e instanceof ServiceError)) throw e; // e.g. the user's balance is too low now: skip this one
      }
    }
    audit(admin, "order.resend_all", "order", "-", null, { total: failed.length, sent });
    return ok(`${sent} dari ${failed.length} pesanan berhasil dikirim ulang.`);
  });
}

export async function resyncProviders(input: unknown) {
  return run(S.resyncSchema, input, async (_d, admin) => {
    const db = getDb();
    const res = await syncOrders(db, createProviderClient(db));
    audit(admin, "sync.manual", "provider", "-", null, { checked: res.runs.reduce((n, r) => n + r.ordersChecked, 0), refunds: res.refundsCreated });
    return ok(`Sinkronisasi selesai. ${res.refundsCreated} refund otomatis dibuat.`);
  });
}

export async function bulkUpdateOrderStatus(input: unknown) {
  return run(S.bulkOrderStatusSchema, input, (d, admin) => {
    const changed: string[] = [];
    for (const id of d.orderIds) {
      if (!changeStatus(admin, id, d.status)) changed.push(id);
    }
    audit(admin, "order.bulk.status", "order", changed.join(","), null, { status: d.status, count: changed.length });
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
  return run(S.serviceUpdateSchema, input, (d, admin) => {
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
    audit(admin, "service.update", "service", service.id, before, { ...service, finalPrice: newPrice });
    return ok(`Layanan ${service.id} disimpan. Harga akhir ${rupiah(newPrice)}/1000.`);
  });
}

export async function createService(input: unknown) {
  return run(S.serviceCreateSchema, input, (d, admin) => {
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
    db.priceUpdates.unshift({
      id: `pu_new_${nextId}`, serviceId: nextId, platform: created.platform, name: created.name, type: "baru",
      date: todayIso(), detail: `Layanan baru tersedia dengan harga ${rupiah(finalPrice(created))} per 1000.`,
    });
    audit(admin, "service.create", "service", nextId, null, created);
    return ok(`Layanan ${nextId} ditambahkan.`);
  });
}

export async function bulkMarkup(input: unknown) {
  return run(S.bulkMarkupSchema, input, (d, admin) => {
    if (!reauth(admin, d.password)) return fail("Password salah.");
    const targets = getDb().services.filter((s) => d.scope === "semua" || s.categoryId === d.scope);
    if (targets.length === 0) return fail("Tidak ada layanan pada cakupan ini.");
    for (const s of targets) {
      const old = finalPrice(s);
      s.markupType = d.markupType;
      s.markup = d.markup;
      pushPriceUpdate(s, old, finalPrice(s));
    }
    audit(admin, "service.bulk_markup", "service", d.scope, null, { markupType: d.markupType, markup: d.markup, count: targets.length });
    return ok(`Markup diterapkan ke ${targets.length} layanan.`);
  });
}

/** Read-only diff against the provider catalogue (Likeo). Nothing is changed. */
export async function previewProviderSync(): Promise<ActionResult> {
  return run(S.providerIdSchema.partial(), {}, async () => {
    const db = getDb();
    try {
      const items = await getAdapter(db).getServices();
      // An empty answer is an error to show, not an empty list to accept silently.
      if (items.length === 0) return fail("Likeo mengembalikan 0 layanan. Cek API key dan URL lewat Tes koneksi di halaman Provider.");
      const preview = buildSyncPreview(db, LIKEO_ID, items);
      logStages("pratinjau sinkron", serviceStages(db, items));
      return ok(undefined, { preview, mode: providerMode() });
    } catch (e) {
      return fail(e instanceof ProviderError ? e.message : "Tidak bisa mengambil layanan dari provider.");
    }
  });
}

export async function applyProviderSync(input: unknown) {
  return run(S.syncApplySchema, input, async (d, admin) => {
    if (!reauth(admin, d.password)) return fail("Password salah.");
    const db = getDb();
    let items;
    try {
      items = await getAdapter(db).getServices();
    } catch (e) {
      return fail(e instanceof ProviderError ? e.message : "Tidak bisa mengambil layanan dari provider.");
    }
    // The admin approved a specific preview: if the provider or the rate changed since, ask for a new look.
    const fresh = buildSyncPreview(db, LIKEO_ID, items);
    if (fresh.blocked) return fail(fresh.blocked);
    if (fresh.fingerprint !== d.fingerprint) return fail("Katalog provider atau kurs berubah sejak pratinjau. Cek perubahan lagi.");
    const before = { services: db.services.filter((s) => s.providerId === LIKEO_ID).length };
    const started = Date.now();
    const result = applyCatalog(db, LIKEO_ID, items);
    if (process.env.NODE_ENV !== "production") console.info(`[layanan] applyCatalog selesai dalam ${Date.now() - started} ms`);
    logStages("setelah Terapkan", serviceStages(db, items));
    // Users must see the new services right away: the whole dashboard area is rendered per request, so drop its cached routes too.
    revalidatePath("/dashboard", "layout");
    audit(admin, "service.sync", "provider", LIKEO_ID, before, { ...result, fingerprint: d.fingerprint, mode: providerMode() });
    return ok(`${result.created} layanan baru, ${result.raised} harga naik, ${result.lowered} harga turun, ${result.deactivated} dinonaktifkan.`, result);
  });
}

export async function importServicesCsv(input: unknown) {
  return run(S.csvImportSchema, input, (d, admin) => {
    // Format: id,providerPrice,markup  (header row optional). TODO: full import with validation per column.
    const db = getDb();
    let updated = 0;
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
      updated++;
    }
    if (updated === 0) return fail("Tidak ada baris valid. Format: id,harga_provider,markup");
    audit(admin, "service.import", "service", "csv", null, { updated });
    return ok(`${updated} layanan diperbarui dari CSV.`);
  });
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

export async function saveProvider(input: unknown) {
  return run(S.providerSchema, input, (d, admin) => {
    const db = getDb();
    // Changing or setting an API key is a sensitive action: password again.
    if (d.apiKey && !requireReauth((p) => reauth(admin, p), d.password)) return fail("Password salah. Masukkan password adminmu untuk mengubah API key.");
    if (d.id) {
      const p = db.providers.find((x) => x.id === d.id);
      if (!p) return fail("Provider tidak ditemukan.");
      if (p.kind === "likeo") return fail("URL dan API key Likeo dibaca dari .env.local dan tidak bisa diubah di sini.");
      const before = { name: p.name, apiUrl: p.apiUrl, status: p.status, apiKeyChanged: false };
      p.name = d.name;
      p.apiUrl = d.apiUrl;
      p.status = d.active ? "aktif" : "nonaktif";
      if (d.apiKey) p.apiKey = d.apiKey;
      audit(admin, "provider.update", "provider", p.id, before, { name: p.name, apiUrl: p.apiUrl, status: p.status, apiKeyChanged: Boolean(d.apiKey) });
      return ok(`Provider ${p.name} disimpan.`);
    }
    if (!d.apiKey) return fail("API key wajib diisi untuk provider baru.");
    const created = {
      id: `prv_${db.providers.length + 1}`, name: d.name, apiUrl: d.apiUrl, apiKey: d.apiKey, balance: 0,
      status: (d.active ? "aktif" : "nonaktif") as "aktif" | "nonaktif", lastSync: new Date().toISOString(),
    };
    db.providers.push(created);
    audit(admin, "provider.create", "provider", created.id, null, { name: created.name, apiUrl: created.apiUrl });
    return ok(`Provider ${created.name} ditambahkan.`);
  });
}

export async function testProviderConnection(input: unknown) {
  return run(S.providerIdSchema, input, async (d, admin) => {
    const db = getDb();
    const p = db.providers.find((x) => x.id === d.id);
    if (!p) return fail("Provider tidak ditemukan.");
    if (p.kind !== "likeo") {
      audit(admin, "provider.test", "provider", p.id, null, { result: "ok", demo: true });
      return ok(`Koneksi ke ${p.name} berhasil (contoh, 184 ms).`);
    }
    const res = await checkLikeo(db, { force: true });
    audit(admin, "provider.test", "provider", p.id, null, { result: res.ok ? "ok" : "gagal", mode: providerMode(), http: res.probe?.httpStatus ?? null, reason: res.probe?.reason ?? null, ms: res.probe?.latencyMs ?? null });
    return res.ok ? ok(res.message) : fail(res.message);
  });
}

/** "Segarkan": reads the real balance now, ignoring the 60 second cache. Same request and diagnostics as "Tes koneksi". */
export async function refreshProviderBalanceAction(input: unknown) {
  return run(S.providerIdSchema, input, async (d, admin) => {
    const db = getDb();
    const p = db.providers.find((x) => x.id === d.id);
    if (!p || p.kind !== "likeo") return fail("Provider tidak mendukung penyegaran saldo.");
    const res = await checkLikeo(db, { force: true });
    audit(admin, "provider.balance_refresh", "provider", p.id, null, { ok: res.ok, mode: providerMode(), balance: p.balance });
    return res.ok ? ok(res.message) : fail(res.message);
  });
}

export async function savePricingSettings(input: unknown) {
  return run(S.pricingSettingsSchema, input, (d, admin) => {
    const db = getDb();
    const before = { ...db.settings.pricing };
    db.settings.pricing = {
      ...db.settings.pricing, rateIdr: d.rateIdr, roundTo: d.roundTo,
      defaultMarkup: { markupType: d.defaultMarkupType, markup: d.defaultMarkup },
      providerMarkups: { ...db.settings.pricing.providerMarkups, [LIKEO_ID]: { markupType: d.providerMarkupType, markup: d.providerMarkup } },
    };
    setPriceRounding(d.roundTo);
    // The balance shown in Rupiah follows the rate.
    const p = db.providers.find((x) => x.id === LIKEO_ID);
    if (p?.balanceNative !== undefined && p.currency) p.balance = Math.round(p.balanceNative * d.rateIdr);
    audit(admin, "settings.update", "settings", "pricing", { rateIdr: before.rateIdr, roundTo: before.roundTo }, d);
    return ok("Kurs dan markup disimpan. Jalankan sinkronisasi untuk memperbarui harga layanan.");
  });
}

/** An order whose submit ended in an unknown state: the admin checked the provider panel and decides. */
export async function resolveOrderManualCheck(input: unknown) {
  return run(S.manualCheckSchema, input, (d, admin) => {
    if (!reauth(admin, d.password)) return fail("Password salah.");
    const db = getDb();
    const order = db.orders.find((o) => o.id === d.orderId);
    if (!order) return fail("Pesanan tidak ditemukan.");
    const before = { status: order.status, refunded: order.refundedAmount };
    if (d.outcome === "sent" && !d.providerOrderId) return fail("Masukkan ID pesanan dari panel provider.");
    resolveManualCheck(db, order.id, d.outcome === "sent" ? { kind: "sent", providerOrderId: d.providerOrderId! } : { kind: "refund" });
    audit(admin, "order.manual_check", "order", order.id, before, { outcome: d.outcome, status: order.status, refunded: order.refundedAmount, providerOrderId: order.providerOrderId });
    return ok(d.outcome === "refund" ? `Pesanan #${order.id} direfund penuh.` : `Pesanan #${order.id} ditautkan ke provider dan akan disinkronkan.`);
  });
}

export async function setProviderStatus(input: unknown) {
  return run(S.providerIdSchema.extend({ active: S.providerSchema.shape.active }), input, (d, admin) => {
    const p = getDb().providers.find((x) => x.id === d.id);
    if (!p) return fail("Provider tidak ditemukan.");
    const before = { status: p.status };
    p.status = d.active ? "aktif" : "nonaktif";
    revalidatePath("/dashboard", "layout");
    audit(admin, "provider.status", "provider", p.id, before, { status: p.status });
    return ok(`${p.name} ${d.active ? "diaktifkan" : "dinonaktifkan"}.`);
  });
}

/**
 * Reveal-on-confirm: after password re-entry the admin sees the first and last characters only.
 * The full key is never sent to the browser.
 */
export async function revealProviderKey(input: unknown) {
  return run(S.providerRevealSchema, input, (d, admin) => {
    if (!reauth(admin, d.password)) return fail("Password salah.");
    const p = getDb().providers.find((x) => x.id === d.id);
    if (!p) return fail("Provider tidak ditemukan.");
    if (p.kind === "likeo") return fail("API key Likeo hanya ada di .env.local dan tidak pernah ditampilkan.");
    audit(admin, "provider.key.reveal", "provider", p.id, null, null);
    return ok(undefined, { partial: `${p.apiKey.slice(0, 8)}${"•".repeat(16)}${p.apiKey.slice(-4)}` });
  });
}

// ---------------------------------------------------------------------------
// Deposits, refills, refunds
// ---------------------------------------------------------------------------

export async function confirmDeposit(input: unknown) {
  return run(S.depositConfirmSchema, input, (d, admin) => {
    if (!reauth(admin, d.password)) return fail("Password salah.");
    const db = getDb();
    const deposit = db.deposits.find((x) => x.id === d.id);
    if (!deposit) return fail("Deposit tidak ditemukan.");
    if (deposit.status !== "menunggu") return fail("Hanya deposit berstatus Menunggu yang bisa dikonfirmasi.");
    const user = db.users.find((u) => u.id === deposit.userId);
    const before = { status: deposit.status, userBalance: user?.balance };
    // Same function as the payment webhook, so a late webhook for this deposit is ignored as a duplicate.
    const res = creditDeposit(db, { depositId: deposit.id, externalId: deposit.externalId, by: admin.sub });
    audit(admin, "deposit.confirm", "deposit", deposit.id, before, { status: "berhasil", userBalance: user?.balance, bonus: res.bonus });
    return ok(`Deposit #${deposit.id} dikonfirmasi. Saldo ${deposit.username} bertambah ${rupiah(deposit.amount + res.bonus)}.`);
  });
}

export async function rejectDeposit(input: unknown) {
  return run(S.depositRejectSchema, input, (d, admin) => {
    const deposit = getDb().deposits.find((x) => x.id === d.id);
    if (!deposit) return fail("Deposit tidak ditemukan.");
    if (deposit.status !== "menunggu") return fail("Hanya deposit berstatus Menunggu yang bisa ditolak.");
    const before = { status: deposit.status };
    deposit.status = "gagal";
    notifyDeposit(getDb(), { id: deposit.id, userId: deposit.userId, amount: deposit.amount, ok: false });
    audit(admin, "deposit.reject", "deposit", deposit.id, before, { status: "gagal", reason: d.reason });
    return ok(`Deposit #${deposit.id} ditolak.`);
  });
}

export async function reviewRefill(input: unknown) {
  return run(S.reviewSchema, input, (d, admin) => {
    const refill = getDb().refills.find((r) => r.id === d.id);
    if (!refill) return fail("Refill tidak ditemukan.");
    const before = { status: refill.status };
    refill.status = d.action === "setujui" ? "berjalan" : d.action === "tolak" ? "ditolak" : "selesai";
    audit(admin, `refill.${d.action}`, "refill", refill.id, before, { status: refill.status });
    return ok(`Refill #${refill.id} ${d.action === "setujui" ? "diproses" : d.action === "tolak" ? "ditolak" : "ditandai selesai"}.`);
  });
}

export async function reviewRefund(input: unknown) {
  return run(S.refundReviewSchema, input, async (d, admin) => {
    const db = getDb();
    const refund = db.refunds.find((r) => r.id === d.id);
    if (!refund) return fail("Refund tidak ditemukan.");
    const before = { status: refund.status, amount: refund.amount };
    if (d.action === "setujui") {
      // Money action: re-enter the admin password.
      if (!d.password || !reauth(admin, d.password)) return fail("Password salah.");
      const order = db.orders.find((o) => o.id === refund.orderId);
      const res = approveRefund(db, refund.id, admin.sub, new Date(), { overrideAmount: d.overrideAmount, overrideReason: d.overrideReason });
      if (!res.duplicate && refund.reason === "user_cancel" && order?.providerOrderId && db.services.find((sv) => sv.id === order.serviceId)?.cancel) {
        // TODO(provider): ask the provider to stop the order. Best effort: the panel-side cancellation and refund already happened.
        try {
          await createProviderClient(db).cancelOrder(order.providerId, order.providerOrderId);
        } catch {
          /* provider unreachable: the order is cancelled here either way */
        }
      }
      audit(admin, refund.reason === "user_cancel" ? "refund.approve_user_cancel" : "refund.approve", "refund", refund.id, before, {
        status: refund.status, amount: refund.amount, userId: refund.userId, policyPercent: refund.policyPercent, overridden: Boolean(refund.overridden), overrideReason: d.overrideReason ?? null,
      });
      return ok(res.duplicate ? "Refund ini sudah diproses sebelumnya." : `Refund ${rupiah(refund.amount)} dikembalikan ke saldo ${refund.username}.`);
    }
    rejectRefund(db, refund.id, admin.sub, d.reason);
    audit(admin, "refund.reject", "refund", refund.id, before, { status: refund.status, reason: d.reason });
    return ok(`Refund untuk ${refund.username} ditolak.`);
  });
}

/** Manual refund created by an admin. Amount can never exceed charge minus what was already refunded. */
export async function createRefund(input: unknown) {
  return run(S.refundCreateSchema, input, (d, admin) => {
    if (!reauth(admin, d.password)) return fail("Password salah.");
    const db = getDb();
    const order = db.orders.find((o) => o.id === d.orderId);
    if (!order) return fail("Pesanan tidak ditemukan.");
    if (d.amount > refundableRemaining(order)) return fail(`Nominal melebihi sisa yang bisa direfund (${rupiah(refundableRemaining(order))}).`);
    const refund = createManualRefund(db, { orderId: order.id, amount: d.amount, note: d.reason, source: "admin", adminId: admin.sub, settleNow: true });
    audit(admin, "refund.create", "refund", refund.id, { refundedAmount: order.refundedAmount - d.amount }, { refundedAmount: order.refundedAmount, amount: d.amount, reason: d.reason });
    return ok(`Refund ${rupiah(d.amount)} untuk pesanan #${order.id} dikirim ke saldo ${order.username}.`);
  });
}

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------

export async function replyAdminTicket(input: unknown) {
  return run(S.ticketReplySchema, input, (d, admin) => {
    const db = getDb();
    const ticket = db.tickets.find((t) => t.id === d.ticketId);
    if (!ticket) return fail("Tiket tidak ditemukan.");
    const before = { status: ticket.status };
    // Same service as the user area: appends the reply, sets "Dibalas" and flags the ticket unread for the user.
    replyAsAdmin(db, ticket.id, { message: d.text });
    if (d.status !== "dibalas") ticket.status = d.status;
    audit(admin, "ticket.reply", "ticket", ticket.id, before, { status: ticket.status });
    return ok(`Balasan untuk tiket #${ticket.id} terkirim.`);
  });
}

export async function setTicketStatus(input: unknown) {
  return run(S.ticketStatusSchema, input, (d, admin) => {
    const ticket = getDb().tickets.find((t) => t.id === d.ticketId);
    if (!ticket) return fail("Tiket tidak ditemukan.");
    const before = { status: ticket.status };
    ticket.status = d.status;
    audit(admin, "ticket.status", "ticket", ticket.id, before, { status: ticket.status });
    return ok(`Status tiket #${ticket.id} diubah.`);
  });
}

export async function assignTicket(input: unknown) {
  return run(S.ticketAssignSchema, input, (d, admin) => {
    const ticket = getDb().tickets.find((t) => t.id === d.ticketId);
    if (!ticket) return fail("Tiket tidak ditemukan.");
    const before = { assignee: ticket.assignee };
    ticket.assignee = d.assignee;
    audit(admin, "ticket.assign", "ticket", ticket.id, before, { assignee: ticket.assignee });
    return ok(d.assignee ? `Tiket ditugaskan ke ${d.assignee}.` : "Penugasan tiket dihapus.");
  });
}

export async function addTicketNote(input: unknown) {
  return run(S.ticketNoteSchema, input, (d, admin) => {
    const ticket = getDb().tickets.find((t) => t.id === d.ticketId);
    if (!ticket) return fail("Tiket tidak ditemukan.");
    ticket.internalNotes.push({ id: `n${ticket.internalNotes.length + 1}`, by: admin.username, text: d.text, at: new Date().toISOString() });
    audit(admin, "ticket.note", "ticket", ticket.id, null, { text: d.text });
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
  return run(S.announcementSchema, input, (d, admin) => {
    const db = getDb();
    const now = new Date().toISOString();
    const fields = { title: d.title, body: d.body, audience: d.audience, placements: d.placements, level: d.level, publishAt: d.publishAt, expiresAt: d.expiresAt || null, active: d.active };
    if (d.id) {
      const a = db.announcements.find((x) => x.id === d.id);
      if (!a) return fail("Pengumuman tidak ditemukan.");
      const before = { ...a };
      // updatedAt changes on every edit: users who dismissed the old text see the banner again.
      Object.assign(a, fields, { updatedAt: now });
      notifyAnnouncement(db, a);
      audit(admin, "announcement.update", "announcement", a.id, before, { ...a });
      refreshUserAnnouncements();
      return ok("Pengumuman diperbarui.");
    }
    const nextNumber = Math.max(0, ...db.announcements.map((x) => Number(x.id.replace("ann_", "")) || 0)) + 1;
    const created = { ...fields, id: `ann_${nextNumber}`, createdBy: admin.username, createdAt: now, updatedAt: now };
    db.announcements.unshift(created);
    notifyAnnouncement(db, created);
    audit(admin, "announcement.create", "announcement", created.id, null, created);
    refreshUserAnnouncements();
    return ok("Pengumuman dibuat.");
  });
}

export async function deleteAnnouncement(input: unknown) {
  return run(S.announcementDeleteSchema, input, (d, admin) => {
    if (!reauth(admin, d.password)) return fail("Password salah.");
    const db = getDb();
    const index = db.announcements.findIndex((a) => a.id === d.id);
    if (index < 0) return fail("Pengumuman tidak ditemukan.");
    const [removed] = db.announcements.splice(index, 1);
    audit(admin, "announcement.delete", "announcement", removed.id, removed, null);
    refreshUserAnnouncements();
    return ok("Pengumuman dihapus.");
  });
}

// ---------------------------------------------------------------------------
// Order rules and cancel policy ("Ketentuan Order")
// ---------------------------------------------------------------------------

/** Editing a platform's rules bumps its version, so every user has to accept the new text before ordering again. */
export async function saveOrderRule(input: unknown) {
  return run(S.orderRuleSchema, input, (d, admin) => {
    const db = getDb();
    const current = db.settings.orderRules[d.key];
    const before = { title: current.title, bullets: current.bullets, version: current.version };
    db.settings.orderRules[d.key] = { ...current, title: d.title, bullets: d.bullets, version: nextRuleVersion(current.version), updatedAt: new Date().toISOString() };
    audit(admin, "settings.order_rules", "settings", d.key, before, { title: d.title, bullets: d.bullets, version: db.settings.orderRules[d.key].version });
    revalidatePath("/dashboard", "layout");
    revalidatePath("/refund-policy");
    return ok(`Ketentuan ${current.label} disimpan (${db.settings.orderRules[d.key].version}). Pengguna perlu menyetujui ulang.`);
  });
}

/** The numbers in the policy text are part of what users accept, so changing them bumps every platform's version. */
export async function saveCancelPolicy(input: unknown) {
  return run(S.cancelPolicySchema, input, (d, admin) => {
    const db = getDb();
    const before = { ...db.settings.cancelPolicy, versions: Object.fromEntries(Object.values(db.settings.orderRules).map((r) => [r.key, r.version])) };
    db.settings.cancelPolicy = { minAgeHours: d.minAgeHours, refundPercent: d.refundPercent };
    const now = new Date().toISOString();
    for (const key of Object.keys(db.settings.orderRules) as (keyof typeof db.settings.orderRules)[]) {
      const r = db.settings.orderRules[key];
      db.settings.orderRules[key] = { ...r, version: nextRuleVersion(r.version), updatedAt: now };
    }
    audit(admin, "settings.cancel_policy", "settings", "cancel_policy", before, { ...db.settings.cancelPolicy });
    revalidatePath("/dashboard", "layout");
    revalidatePath("/refund-policy");
    return ok("Kebijakan pembatalan disimpan. Pengguna perlu menyetujui ulang ketentuan order.");
  });
}

// ---------------------------------------------------------------------------
// Site settings
// ---------------------------------------------------------------------------

export async function saveGeneralSettings(input: unknown) {
  return run(S.settingsGeneralSchema, input, (d, admin) => {
    const db = getDb();
    const before = { ...db.settings.general };
    db.settings.general = { ...db.settings.general, ...d };
    audit(admin, "settings.update", "settings", "general", before, db.settings.general);
    return ok("Pengaturan umum disimpan.");
  });
}

export async function savePaymentSettings(input: unknown) {
  return run(S.settingsPaymentsSchema, input, (d, admin) => {
    const db = getDb();
    const before = { ...db.settings.payments };
    db.settings.payments = { ...d, bonusTiers: [...d.bonusTiers].sort((a, b) => a.min - b.min) };
    audit(admin, "settings.update", "settings", "payments", before, db.settings.payments);
    return ok("Pengaturan pembayaran disimpan.");
  });
}

export async function saveRankSettings(input: unknown) {
  return run(S.settingsRanksSchema, input, (d, admin) => {
    const db = getDb();
    const before = db.settings.ranks;
    db.settings.ranks = d.ranks;
    audit(admin, "settings.update", "settings", "ranks", before, d.ranks);
    return ok("Pengaturan peringkat disimpan.");
  });
}

export async function saveOperationsSettings(input: unknown) {
  return run(S.settingsOperationsSchema, input, (d, admin) => {
    const db = getDb();
    const before = { operations: { ...db.settings.operations }, risk: { ...db.settings.risk }, pricing: { ...db.settings.pricing }, limits: { ...db.settings.limits } };
    db.settings.operations = { stuckHours: d.stuckHours, lowBalanceThreshold: d.lowBalanceThreshold, autoDisableLowBalance: d.autoDisableLowBalance };
    db.settings.risk = { ratioPercent: d.riskRatioPercent, minOrders: d.riskMinOrders };
    db.settings.pricing = { ...db.settings.pricing, minMarginPercent: d.minMarginPercent, autoAdjust: d.autoAdjustPrice };
    db.settings.limits = { ordersPerMinute: d.ordersPerMinute, ticketsPerHour: d.ticketsPerHour };
    audit(admin, "settings.update", "settings", "operations", before, d);
    return ok("Pengaturan operasional disimpan.");
  });
}

export async function saveMonitoringSettings(input: unknown) {
  return run(S.settingsMonitoringSchema, input, (d, admin) => {
    const db = getDb();
    const before = { configured: Boolean(db.settings.ops.monitoringDsn) };
    db.settings.ops.monitoringDsn = d.monitoringDsn;
    audit(admin, "settings.update", "settings", "monitoring", before, { configured: Boolean(d.monitoringDsn) });
    return ok("Pengaturan pemantauan error disimpan.");
  });
}

export async function saveSecuritySettings(input: unknown) {
  return run(S.settingsSecuritySchema, input, (d, admin) => {
    const db = getDb();
    // Turning the 2FA requirement OFF lowers security: password again.
    if (!d.requireAdmin2fa && db.settings.security.requireAdmin2fa && !requireReauth((p) => reauth(admin, p), d.password)) return fail("Password salah.");
    const before = { requireAdmin2fa: db.settings.security.requireAdmin2fa };
    db.settings.security.requireAdmin2fa = d.requireAdmin2fa;
    audit(admin, "settings.update", "settings", "security", before, { requireAdmin2fa: d.requireAdmin2fa });
    return ok("Pengaturan keamanan disimpan.");
  });
}

/** Lockout-safe: the list must contain the caller's own IP, otherwise the save would lock them out. */
export async function saveIpAllowlist(input: unknown) {
  return run(S.ipAllowlistSchema, input, async (d, admin) => {
    if (!reauth(admin, d.password)) return fail("Password salah.");
    const ip = await getClientIp();
    const list = Array.from(new Set(d.ips));
    if (list.length > 0 && !ipAllowed(list, ip)) {
      return fail(`Alamat IP kamu (${ip}) tidak ada di daftar. Tambahkan dulu supaya kamu tidak terkunci.`);
    }
    const db = getDb();
    const before = { ipAllowlist: db.settings.security.ipAllowlist };
    db.settings.security.ipAllowlist = list;
    audit(admin, "settings.ip_allowlist", "settings", "security", before, { ipAllowlist: list });
    return ok(list.length ? `Daftar IP disimpan (${list.length} alamat).` : "Daftar IP dikosongkan. Pembatasan IP nonaktif.");
  });
}

export async function revokeAdminSession(input: unknown) {
  return run(S.sessionRevokeSchema, input, (d, admin) => {
    const db = getDb();
    const target = db.sessions.find((x) => x.id === d.id && x.adminId === admin.sub);
    if (!target || target.revokedAt) return fail("Sesi tidak ditemukan.");
    target.revokedAt = new Date().toISOString();
    audit(admin, "session.revoke", "session", target.id, null, { ip: target.ip });
    return ok(target.id === admin.sid ? "Sesi ini dicabut. Kamu akan keluar." : "Sesi dicabut.");
  });
}

export async function revokeOtherAdminSessions() {
  return run(S.resyncSchema, {}, (_d, admin) => {
    const db = getDb();
    const now = new Date().toISOString();
    let n = 0;
    for (const x of db.sessions) {
      if (x.adminId === admin.sub && !x.revokedAt && x.id !== admin.sid) {
        x.revokedAt = now;
        n++;
      }
    }
    audit(admin, "session.revoke_all", "session", admin.sub, null, { revoked: n });
    return ok(n ? `${n} sesi lain dicabut.` : "Tidak ada sesi lain yang aktif.");
  });
}

export async function saveNotificationSettings(input: unknown) {
  return run(S.settingsNotificationsSchema, input, (d, admin) => {
    const db = getDb();
    const before = { ...db.settings.notifications };
    db.settings.notifications = d;
    audit(admin, "settings.update", "settings", "notifications", before, d);
    return ok("Pengaturan notifikasi disimpan.");
  });
}

// ---------------------------------------------------------------------------
// Risk, held orders, pricing safety
// ---------------------------------------------------------------------------

export async function setUserManualApproval(input: unknown) {
  return run(S.userApprovalSchema, input, (d, admin) => {
    const user = getDb().users.find((u) => u.id === d.userId);
    if (!user) return fail("Pengguna tidak ditemukan.");
    const before = { manualApproval: user.manualApproval };
    user.manualApproval = d.manualApproval;
    audit(admin, "user.manual_approval", "user", user.id, before, { manualApproval: d.manualApproval });
    return ok(d.manualApproval ? `Pesanan dan refund ${user.username} sekarang perlu persetujuan admin.` : `Persetujuan manual untuk ${user.username} dimatikan.`);
  });
}

export async function releaseHeldOrder(input: unknown) {
  return run(S.orderApproveSchema, input, async (d, admin) => {
    const db = getDb();
    const before = { held: db.orders.find((o) => o.id === d.orderId)?.held };
    const order = await approveHeldOrder(db, d.orderId, { client: createProviderClient(db) });
    audit(admin, "order.release", "order", order.id, before, { held: false, status: order.status });
    return ok(order.status === "gagal_kirim" ? `Pesanan #${order.id} gagal dikirim dan saldo dikembalikan.` : `Pesanan #${order.id} disetujui dan dikirim ke provider.`);
  });
}

export async function previewMarginFix(input: unknown) {
  return run(S.autoMarkupSchema.omit({ password: true }), input, (d) => ok(undefined, { changes: previewAutoMarkup(getDb(), d.serviceIds) }));
}

export async function applyMarginFix(input: unknown) {
  return run(S.autoMarkupSchema, input, (d, admin) => {
    if (!reauth(admin, d.password)) return fail("Password salah.");
    const db = getDb();
    const preview = previewAutoMarkup(db, d.serviceIds);
    const changes = applyAutoMarkup(db, d.serviceIds);
    audit(admin, "service.auto_markup", "service", "margin", { services: preview.map((c) => ({ id: c.serviceId, price: c.oldPrice })) }, { services: changes.map((c) => ({ id: c.serviceId, price: c.newPrice })) });
    return ok(changes.length ? `Markup otomatis diterapkan ke ${changes.length} layanan.` : "Tidak ada layanan dengan margin tipis.");
  });
}

export async function changeAdminPassword(input: unknown) {
  return run(S.changePasswordSchema, input, (d, admin) => {
    if (!verifyAdminPassword(admin.sub, d.current)) return fail("Password saat ini salah.");
    setAdminPassword(admin.sub, d.next);
    audit(admin, "admin.password.change", "admin", admin.sub, null, { changed: true });
    return ok("Password berhasil diubah.");
  });
}
