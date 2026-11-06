import "server-only";
import { BLOCKED_MESSAGE } from "@/lib/account-status";
import { hitRateLimit, minutes } from "@/lib/rate-limit";
import { siteUrl } from "@/lib/site-url";
import { logSystem } from "@/lib/server/repo/notify";
import { notifyAdmins } from "@/lib/server/repo/notify";
import { loadSettings } from "@/lib/server/repo/settings";
import { ServiceError } from "@/lib/server/tx";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { amountLimits, channelAllowed, checkPassthroughQuote, checkQuote, feeQuote, MAX_PENDING_GATEWAY_DEPOSITS, passesFeeToCustomer, RECONCILE_AFTER_MINUTES, totalLimitProblem, type RuleChannel } from "./gateway-rules";
import {
  getPaymenkuClient, paymenkuMode, PaymenkuError, parseTransaction, sanitizePaymentInfo, verifyPaymenkuSignature,
  type PaymenkuChannel, type PaymenkuClient, type PaymenkuTransaction,
} from "./paymenku";

/**
 * Top-ups through Paymenku. The deposit row is created BEFORE the gateway is called (reference_id = deposit id), and balance changes ONLY in
 * Postgres (paymenku_settle_deposit -> credit_deposit), after the server re-fetched the transaction from Paymenku and every check passed:
 * the webhook, the reconciliation cron and the admin "Cek status ke Paymenku" button all go through applyTransaction().
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_WEBHOOK_BYTES = 64 * 1024;
const FALLBACK_EXPIRY_MINUTES = 60;

// ---------------------------------------------------------------------------------------------------------------------------------
// Channels (cached for a minute: the checkout page asks on every visit)
// ---------------------------------------------------------------------------------------------------------------------------------
let channelCache: { at: number; key: string; list: PaymenkuChannel[] } | null = null;

export async function listChannels(opts: { force?: boolean; client?: PaymenkuClient } = {}): Promise<PaymenkuChannel[]> {
  const gw = opts.client ? { client: opts.client, mode: "sandbox" as const } : getPaymenkuClient();
  if (!gw) return [];
  const key = String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  if (!opts.force && !opts.client && channelCache && channelCache.key === key && Date.now() - channelCache.at < 60_000) return channelCache.list;
  const list = await gw.client.listChannels();
  if (!opts.client) channelCache = { at: Date.now(), key, list };
  return list;
}

export type GatewayConfig = {
  enabled: boolean;
  mode: "sandbox" | "live" | "off";
  maxDeposit: number;
  feePolicy: "ikuti" | "pengguna" | "kami";
  /** "Teruskan biaya ke pelanggan": the app adds the fee of merchant-billed channels to what the customer pays. */
  feePassthrough: boolean;
  channels: RuleChannel[];
};

/** What the Tambah Saldo page may offer: gateway on, key allowed for this project, channels enabled by the admin AND allowed by the fee policy. Never throws. */
export async function getGatewayConfig(): Promise<GatewayConfig> {
  const { payments } = await loadSettings();
  const g = payments.gateway;
  const mode = paymenkuMode();
  const off: GatewayConfig = { enabled: false, mode: "off", maxDeposit: g.maxDeposit, feePolicy: g.feePolicy, feePassthrough: g.feePassthrough, channels: [] };
  if (!g.enabled || mode.state === "off") return off;
  try {
    const all = await listChannels();
    const channels = all.filter((c) => g.channels.includes(c.code) && channelAllowed(c, g.feePolicy, g.feePassthrough)).map((c): RuleChannel => ({ code: c.code, name: c.name, type: c.type, feeMode: c.feeMode, feeFlat: c.feeFlat, feePercent: c.feePercent, minAmount: c.minAmount, maxAmount: c.maxAmount }));
    return { enabled: channels.length > 0, mode: mode.state, maxDeposit: g.maxDeposit, feePolicy: g.feePolicy, feePassthrough: g.feePassthrough, channels };
  } catch {
    return off;
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------------------------------------------------------------
export type CreatedGatewayDeposit = { id: string; payAmount: number };

export async function createGatewayDeposit(input: { userId: string; ip: string; amount: number; channelCode: string }, deps: { client?: PaymenkuClient; siteOrigin?: string } = {}): Promise<CreatedGatewayDeposit> {
  const db = supabaseAdmin();
  const gw = deps.client ? { client: deps.client, mode: paymenkuMode().state === "live" ? ("live" as const) : ("sandbox" as const) } : getPaymenkuClient();
  const settings = (await loadSettings()).payments;
  if (!gw || !settings.gateway.enabled) throw new ServiceError("Metode pembayaran belum tersedia.", "gateway_off");
  if (!Number.isInteger(input.amount)) throw new ServiceError("Jumlah harus bilangan bulat.", "bad_amount");

  const { data: user } = await db.from("profiles").select("username,email,status").eq("id", input.userId).maybeSingle();
  if (!user) throw new ServiceError("Pengguna tidak ditemukan.", "no_user");
  if (user.status !== "aktif") throw new ServiceError(BLOCKED_MESSAGE, "blocked");

  const channels = await listChannels({ client: deps.client });
  const channel = channels.find((c) => c.code === input.channelCode && settings.gateway.channels.includes(c.code) && channelAllowed(c, settings.gateway.feePolicy, settings.gateway.feePassthrough));
  if (!channel) throw new ServiceError("Kanal pembayaran tidak tersedia.", "bad_channel");
  const { min, max } = amountLimits(channel, { minDeposit: settings.minDeposit, maxDeposit: settings.gateway.maxDeposit });
  if (input.amount < min) throw new ServiceError(`Minimal deposit ${rp(min)} untuk ${channel.name}.`, "below_min");
  if (input.amount > max) throw new ServiceError(`Maksimal deposit ${rp(max)} untuk ${channel.name}.`, "above_max");
  // Fee pass-through: the customer pays base + the channel fee (grossed up so the merchant nets at least the base). The balance and the bonus stay on the base amount.
  const passthrough = passesFeeToCustomer(channel, settings.gateway.feePassthrough);
  const quote = passthrough ? feeQuote(channel, input.amount, true) : null;
  if (passthrough && !quote) throw new ServiceError("Biaya layanan tidak bisa dihitung untuk kanal ini. Pilih kanal lain atau hubungi support.", "bad_fee");
  if (quote) {
    const problem = totalLimitProblem(channel, quote.total);
    if (problem) throw new ServiceError(problem, "total_out_of_range");
  }

  const byUser = await hitRateLimit(`deposit:${input.userId}`, 5, 10 * 60);
  if (!byUser.allowed) throw new ServiceError(`Terlalu banyak permintaan deposit. Coba lagi dalam ${minutes(byUser.retryAfterSeconds)} menit.`, "rate_limited");
  const byIp = await hitRateLimit(`deposit-ip:${input.ip}`, 20, 60 * 60);
  if (!byIp.allowed) throw new ServiceError("Terlalu banyak permintaan deposit dari jaringan ini. Coba lagi nanti.", "rate_limited");

  const { count } = await db.from("deposits").select("id", { count: "exact", head: true }).eq("user_id", input.userId).eq("gateway", "paymenku").eq("status", "menunggu");
  if ((count ?? 0) >= MAX_PENDING_GATEWAY_DEPOSITS) {
    throw new ServiceError(`Masih ada ${MAX_PENDING_GATEWAY_DEPOSITS} deposit yang menunggu pembayaran. Bayar atau batalkan salah satunya dulu.`, "too_many_pending");
  }

  // the row first: Paymenku only ever sees a reference_id we already own
  const { data: dep, error } = await db.from("deposits").insert({
    user_id: input.userId, method: channel.name, amount: input.amount, status: "menunggu", gateway: "paymenku", channel_code: channel.code,
    is_sandbox: gw.mode === "sandbox", expires_at: new Date(Date.now() + FALLBACK_EXPIRY_MINUTES * 60_000).toISOString(), gateway_status: "pending",
    ...(quote ? { pay_amount: quote.total, fee_amount: quote.fee, fee_passthrough: true } : {}),
  }).select("id").single();
  if (error || !dep) throw new Error(`deposits: ${error?.message ?? "insert failed"}`);

  const origin = deps.siteOrigin ?? (await siteUrl());
  let tx: PaymenkuTransaction;
  try {
    tx = await gw.client.createTransaction({
      channelCode: channel.code, amount: quote ? quote.total : input.amount, referenceId: dep.id, customerName: user.username, customerEmail: user.email, returnUrl: `${origin}/deposit/${dep.id}`, idempotencyKey: dep.id,
    });
  } catch (e) {
    if (e instanceof PaymenkuError && e.ambiguous) {
      // it may exist at Paymenku: keep the deposit pending, the reconciliation looks it up by reference_id
      await logSystem("deposit.paymenku_create_ambiguous", "deposit", dep.id, null, { error: e.message });
      throw new ServiceError("Pembayaran sedang disiapkan tetapi belum pasti. Cek riwayat deposit dalam beberapa menit; jangan membuat deposit baru dulu.", "ambiguous");
    }
    await db.from("deposits").update({ status: "gagal", gateway_status: "failed" }).eq("id", dep.id).eq("status", "menunggu");
    await logSystem("deposit.paymenku_create_failed", "deposit", dep.id, null, { error: e instanceof Error ? e.message.slice(0, 160) : "error", status: e instanceof PaymenkuError ? e.status : null });
    if (e instanceof PaymenkuError && e.kind === "rate_limited") throw new ServiceError("Penyedia pembayaran sedang sibuk. Coba lagi sebentar.", "gateway_busy");
    throw new ServiceError("Pembayaran tidak bisa dibuat saat ini. Coba lagi atau pilih metode lain.", "gateway_error");
  }

  const reject = async (why: string, detail: string) => {
    await db.from("deposits").update({ status: "gagal", gateway_status: "failed", external_id: tx.trxId }).eq("id", dep.id).eq("status", "menunggu");
    await logSystem("deposit.paymenku_create_rejected", "deposit", dep.id, null, { why: detail });
    throw new ServiceError(why, "gateway_invalid");
  };
  if (tx.referenceId !== dep.id) return reject("Jawaban Paymenku tidak cocok dengan deposit. Hubungi support.", "reference_mismatch");
  if (tx.isSandbox !== (gw.mode === "sandbox")) return reject("Mode sandbox / live transaksi tidak cocok. Hubungi support.", "sandbox_mismatch");
  const quoteProblem = quote ? checkPassthroughQuote(quote.total, tx.amount) : checkQuote(channel, input.amount, tx.amount);
  if (quoteProblem) return reject(quoteProblem, "quote");

  const info = sanitizePaymentInfo(tx.paymentInfo);
  const exp = typeof info.expiration_date === "string" && !Number.isNaN(Date.parse(info.expiration_date)) ? new Date(info.expiration_date).toISOString() : new Date(Date.now() + FALLBACK_EXPIRY_MINUTES * 60_000).toISOString();
  const { error: upErr } = await db.from("deposits").update({
    external_id: tx.trxId, pay_url: tx.payUrl, payment_info: info, pay_amount: quote ? quote.total : tx.amount, fee_amount: quote ? quote.fee : Math.max(0, tx.amount - input.amount), expires_at: exp, gateway_status: tx.status,
  }).eq("id", dep.id);
  if (upErr) throw new Error(`deposits: ${upErr.message}`);
  await logSystem("deposit.paymenku_created", "deposit", dep.id, null, { channel: channel.code, amount: input.amount, payAmount: tx.amount, feePassthrough: Boolean(quote), sandbox: tx.isSandbox });
  return { id: dep.id, payAmount: tx.amount };
}

const rp = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

// ---------------------------------------------------------------------------------------------------------------------------------
// Apply a VERIFIED transaction (fetched from Paymenku by us) to its deposit
// ---------------------------------------------------------------------------------------------------------------------------------
export type ApplyOutcome = "credited" | "late_credited" | "duplicate" | "changed" | "unchanged" | "flagged" | "rejected" | "error";
export type ApplyResult = { outcome: ApplyOutcome; message: string };

type DepositRow = { id: string; user_id: string; status: string; amount: number; external_id: string | null; gateway: string | null; is_sandbox: boolean | null; created_at: string; expires_at: string | null };

/**
 * `tx` MUST come from client.checkStatus() (server to server), never from a webhook body. Paid -> paymenku_settle_deposit (checks amounts, trx id and the
 * sandbox / live flag inside the transaction); other statuses -> paymenku_mark_deposit (never credits, never touches a credited balance).
 */
export async function applyTransaction(deposit: DepositRow, tx: PaymenkuTransaction, expectSandbox: boolean, by: string): Promise<ApplyResult> {
  const db = supabaseAdmin();
  if (tx.referenceId !== deposit.id) {
    await logSystem("deposit.paymenku_reference_mismatch", "deposit", deposit.id, null, { trx: tx.trxId });
    return { outcome: "rejected", message: "Transaksi bukan milik deposit ini." };
  }
  if (tx.status === "paid") {
    const { data, error } = await db.rpc("paymenku_settle_deposit", {
      p_deposit: deposit.id, p_trx: tx.trxId, p_pay_amount: tx.amount, p_fee: tx.totalFee, p_received: tx.amountReceived, p_paid_at: tx.paidAt ?? new Date().toISOString(),
      p_is_sandbox: tx.isSandbox, p_expect_sandbox: expectSandbox, p_by: by,
    });
    if (error) {
      const hint = (error as { hint?: string }).hint ?? "";
      if (["amount_mismatch", "sandbox_mismatch", "trx_mismatch", "not_gateway", "no_deposit"].includes(hint)) {
        await logSystem("deposit.paymenku_rejected", "deposit", deposit.id, null, { hint, trx: tx.trxId });
        // never credited, and an admin must look at it ("Perlu dicek"), for example when the customer paid only the base amount
        if (["amount_mismatch", "sandbox_mismatch", "trx_mismatch"].includes(hint)) {
          const reason = hint === "amount_mismatch" ? `Nominal yang dilaporkan Paymenku (bayar ${rp(tx.amount)}, diterima ${rp(tx.amountReceived)}) tidak cocok dengan deposit. Tidak dikreditkan: periksa di Paymenku.` : hint === "sandbox_mismatch" ? "Mode sandbox / live transaksi tidak cocok dengan deposit. Tidak dikreditkan." : "ID transaksi tidak cocok dengan deposit. Tidak dikreditkan.";
          await db.rpc("paymenku_flag_deposit", { p_deposit: deposit.id, p_reason: reason, p_by: by });
        }
        return { outcome: "rejected", message: error.message };
      }
      await logSystem("deposit.paymenku_error", "deposit", deposit.id, null, { message: error.message.slice(0, 160) });
      return { outcome: "error", message: "Gagal memproses pembayaran." };
    }
    const r = data as unknown as { result: string; late: boolean };
    if (r.result === "credited" && r.late) {
      await notifyAdmins({ type: "deposit", title: "Deposit dibayar setelah kedaluwarsa", body: `Deposit ${deposit.id.slice(0, 8)} dibayar terlambat dan sudah dikreditkan satu kali setelah diverifikasi ke Paymenku.`, href: "/admin/deposits?status=perlu_dicek", dedupeKey: `deposit-late:${deposit.id}` });
      return { outcome: "late_credited", message: "Saldo ditambahkan (pembayaran terlambat)." };
    }
    return r.result === "credited" ? { outcome: "credited", message: "Saldo ditambahkan." } : { outcome: "duplicate", message: "Sudah diproses." };
  }
  const { data, error } = await db.rpc("paymenku_mark_deposit", { p_deposit: deposit.id, p_gateway_status: tx.status, p_by: by });
  if (error) {
    await logSystem("deposit.paymenku_error", "deposit", deposit.id, null, { message: error.message.slice(0, 160) });
    return { outcome: "error", message: "Gagal memproses status." };
  }
  const r = (data as unknown as { result: string }).result;
  if (r === "flagged") {
    await notifyAdmins({ type: "deposit", title: "Deposit di-refund di Paymenku", body: `Deposit ${deposit.id.slice(0, 8)} sudah dikreditkan lalu di-refund di Paymenku. Saldo tidak diubah otomatis: tinjau manual.`, href: "/admin/deposits?status=perlu_dicek", dedupeKey: `deposit-refund:${deposit.id}` });
    return { outcome: "flagged", message: "Ditandai untuk ditinjau admin." };
  }
  return { outcome: r === "changed" ? "changed" : "unchanged", message: "Status diperbarui." };
}

async function loadDeposit(id: string): Promise<DepositRow | null> {
  const { data } = await supabaseAdmin().from("deposits").select("id,user_id,status,amount,external_id,gateway,is_sandbox,created_at,expires_at").eq("id", id).maybeSingle();
  return data ? ({ ...data, amount: Number(data.amount) } as DepositRow) : null;
}

/** Ask Paymenku about one deposit and apply the answer (reconciliation, "Cek status ke Paymenku", the webhook's verification). */
export async function verifyDeposit(depositId: string, by: string, deps: { client?: PaymenkuClient; sandbox?: boolean } = {}): Promise<ApplyResult> {
  const gw = deps.client ? { client: deps.client, mode: deps.sandbox === false ? ("live" as const) : ("sandbox" as const) } : getPaymenkuClient();
  if (!gw) return { outcome: "error", message: "Gateway Paymenku sedang nonaktif." };
  const dep = await loadDeposit(depositId);
  if (!dep || dep.gateway !== "paymenku") return { outcome: "rejected", message: "Deposit Paymenku tidak ditemukan." };
  try {
    const tx = await gw.client.checkStatus(dep.external_id ?? dep.id);
    return await applyTransaction(dep, tx, gw.mode === "sandbox", by);
  } catch (e) {
    if (e instanceof PaymenkuError && e.status === 404 && !dep.external_id && Date.now() - new Date(dep.created_at).getTime() > 15 * 60_000) {
      // the create never reached Paymenku: nothing to pay
      const r = await supabaseAdmin().rpc("paymenku_mark_deposit", { p_deposit: dep.id, p_gateway_status: "failed", p_by: by });
      return { outcome: r.error ? "error" : "changed", message: "Transaksi tidak ditemukan di Paymenku." };
    }
    await logSystem("deposit.paymenku_check_failed", "deposit", dep.id, null, { error: e instanceof Error ? e.message.slice(0, 160) : "error" });
    return { outcome: "error", message: "Paymenku belum bisa dihubungi. Coba lagi sebentar." };
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------------------------------------------------------------
export type WebhookOutcome = { status: number; body: { ok: boolean; message: string } };
const reply = (status: number, ok: boolean, message: string): WebhookOutcome => ({ status, body: { ok, message } });

/** The fields of a webhook that are worth keeping: no customer name, e-mail or phone. */
function redactWebhook(p: Record<string, unknown>) {
  const keep = ["event", "trx_id", "reference_id", "status", "amount", "total_fee", "amount_received", "payment_channel", "paid_at", "created_at", "is_sandbox"];
  return Object.fromEntries(keep.filter((k) => p[k] !== undefined).map((k) => [k, p[k]]));
}

/**
 * One webhook delivery. The signature is checked on the RAW body first (401 + a log entry without the body when it fails); nothing is trusted after that
 * except the trx_id / reference_id used to find the deposit: the transaction itself is re-fetched from Paymenku before anything is credited.
 * Answers fast: 200 once handled (also for unknown events and unknown references), 503 when Paymenku could not be asked (it will deliver again; the cron covers it).
 */
export async function handlePaymenkuWebhook(
  input: { rawBody: string; signature: string | null; timestamp: string | null },
  deps: { secret?: string; client?: PaymenkuClient; sandbox?: boolean; nowMs?: number } = {},
): Promise<WebhookOutcome> {
  if (input.rawBody.length > MAX_WEBHOOK_BYTES) return reply(413, false, "Payload terlalu besar.");
  const check = verifyPaymenkuSignature({ rawBody: input.rawBody, signature: input.signature, timestamp: input.timestamp, secret: deps.secret ?? process.env.PAYMENKU_WEBHOOK_SECRET, nowMs: deps.nowMs });
  if (!check.ok) {
    await logSystem("webhook.rejected", "deposit", "-", null, { source: "paymenku", reason: check.reason });
    return reply(401, false, "Signature tidak valid.");
  }
  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(input.rawBody) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    payload = parsed as Record<string, unknown>;
  } catch {
    await logSystem("webhook.invalid", "deposit", "-", null, { source: "paymenku" });
    return reply(400, false, "Payload tidak valid.");
  }
  if (payload.event !== "payment.status_updated") {
    await logSystem("webhook.unknown_event", "deposit", "-", null, { source: "paymenku", event: String(payload.event ?? "").slice(0, 60) });
    return reply(200, true, "Event diabaikan.");
  }
  let tx: PaymenkuTransaction;
  try {
    tx = parseTransaction(payload);
  } catch {
    await logSystem("webhook.invalid", "deposit", "-", null, { source: "paymenku", event: "payment.status_updated" });
    return reply(400, false, "Payload tidak lengkap.");
  }
  if (!UUID.test(tx.referenceId)) {
    await logSystem("webhook.unknown_reference", "deposit", "-", null, { source: "paymenku", trx: tx.trxId });
    return reply(200, true, "Referensi tidak dikenal.");
  }
  const db = supabaseAdmin();
  // every delivery once per (transaction, status): a replay is recognised and still safe to process again (the SQL is idempotent)
  const seen = await db.from("webhook_events").upsert({ source: "paymenku", external_id: `${tx.trxId}:${tx.status}`, payload: redactWebhook(payload) as never }, { onConflict: "external_id", ignoreDuplicates: true }).select("id");
  const replay = (seen.data ?? []).length === 0;
  const dep = await loadDeposit(tx.referenceId);
  if (!dep || dep.gateway !== "paymenku") {
    await logSystem("webhook.unknown_reference", "deposit", tx.referenceId, null, { source: "paymenku", trx: tx.trxId });
    return reply(200, true, "Referensi tidak dikenal.");
  }

  const gw = deps.client ? { client: deps.client, mode: deps.sandbox === false ? ("live" as const) : ("sandbox" as const) } : getPaymenkuClient();
  if (!gw) return reply(503, false, "Gateway nonaktif.");
  try {
    // the webhook only says WHERE to look; what is true comes from Paymenku itself
    const fresh = await gw.client.checkStatus(tx.trxId);
    if (fresh.trxId !== tx.trxId) {
      await logSystem("webhook.trx_mismatch", "deposit", dep.id, null, { trx: tx.trxId });
      return reply(200, true, "Transaksi tidak cocok.");
    }
    const res = await applyTransaction(dep, fresh, gw.mode === "sandbox", "webhook");
    await db.from("webhook_events").update({ processed: res.outcome !== "error" }).eq("external_id", `${tx.trxId}:${tx.status}`);
    await logSystem(replay ? "webhook.replay" : "webhook.processed", "deposit", dep.id, null, { source: "paymenku", trx: tx.trxId, status: fresh.status, outcome: res.outcome });
    if (res.outcome === "error") return reply(503, false, res.message);
    return reply(200, true, res.message);
  } catch (e) {
    await logSystem("webhook.verify_failed", "deposit", dep.id, null, { source: "paymenku", trx: tx.trxId, error: e instanceof Error ? e.message.slice(0, 160) : "error" });
    return reply(503, false, "Belum bisa memverifikasi ke Paymenku.");
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Reconciliation (cron) and cancel
// ---------------------------------------------------------------------------------------------------------------------------------
export type ReconcileSummary = { checked: number; credited: number; lateCredited: number; expired: number; failed: number; errors: number };

/**
 * Deposits pending longer than 5 minutes: ask Paymenku (a lost webhook) and apply the same credit function; deposits past their expiry are marked expired
 * when Paymenku says so. Deposits that expired in the last 2 hours are looked at once more (a late payment is credited once, after this verification).
 */
export async function reconcilePendingDeposits(opts: { now?: Date; deadlineAt?: number; limit?: number; client?: PaymenkuClient; sandbox?: boolean } = {}): Promise<ReconcileSummary> {
  const out: ReconcileSummary = { checked: 0, credited: 0, lateCredited: 0, expired: 0, failed: 0, errors: 0 };
  const gw = opts.client ? { client: opts.client, mode: opts.sandbox === false ? ("live" as const) : ("sandbox" as const) } : getPaymenkuClient();
  if (!gw) return out;
  const now = opts.now ?? new Date();
  const db = supabaseAdmin();
  const pendingBefore = new Date(now.getTime() - RECONCILE_AFTER_MINUTES * 60_000).toISOString();
  const { data: pending } = await db.from("deposits").select("id").eq("gateway", "paymenku").eq("status", "menunggu").lt("created_at", pendingBefore).order("created_at").limit(opts.limit ?? 40);
  const recentlyExpired = new Date(now.getTime() - 2 * 3_600_000).toISOString();
  const { data: late } = await db.from("deposits").select("id").eq("gateway", "paymenku").in("status", ["kedaluwarsa", "dibatalkan"]).neq("gateway_status", "expired").gte("updated_at", recentlyExpired).order("updated_at").limit(10);
  for (const row of [...(pending ?? []), ...(late ?? [])]) {
    if (opts.deadlineAt && Date.now() > opts.deadlineAt) break;
    out.checked++;
    const res = await verifyDeposit(row.id, "reconcile", { client: gw.client, sandbox: gw.mode === "sandbox" });
    if (res.outcome === "credited") out.credited++;
    else if (res.outcome === "late_credited") out.lateCredited++;
    else if (res.outcome === "error") out.errors++;
    else if (res.outcome === "changed") {
      const d = await loadDeposit(row.id);
      if (d?.status === "kedaluwarsa") out.expired++;
      if (d?.status === "gagal") out.failed++;
    }
  }
  // our own clock: pending deposits whose expiry has passed and that Paymenku still reports as pending are closed here too
  const { data: overdue } = await db.from("deposits").select("id").eq("gateway", "paymenku").eq("status", "menunggu").lt("expires_at", now.toISOString()).lt("created_at", pendingBefore).limit(40);
  for (const row of overdue ?? []) {
    const r = await db.rpc("paymenku_mark_deposit", { p_deposit: row.id, p_gateway_status: "expired", p_by: "reconcile" });
    if (!r.error && (r.data as unknown as { result: string }).result === "changed") out.expired++;
  }
  return out;
}

/** Cancel a pending gateway deposit (the owner or an admin). Paymenku only cancels some QRIS transactions: when it refuses, the deposit is closed here and a late payment is still credited once. */
export async function cancelGatewayDeposit(depositId: string, actor: { userId?: string; adminId?: string }, deps: { client?: PaymenkuClient } = {}): Promise<{ ok: boolean; message: string }> {
  const db = supabaseAdmin();
  const dep = await loadDeposit(depositId);
  if (!dep || dep.gateway !== "paymenku" || (actor.userId && dep.user_id !== actor.userId)) return { ok: false, message: "Deposit tidak ditemukan." };
  if (dep.status !== "menunggu") return { ok: false, message: "Hanya deposit yang menunggu pembayaran yang bisa dibatalkan." };
  const gw = deps.client ? { client: deps.client } : getPaymenkuClient();
  let note = "";
  if (gw && dep.external_id) {
    try {
      // a payment that already went through must not be cancelled away: look first
      const fresh = await gw.client.checkStatus(dep.external_id);
      if (fresh.status === "paid") {
        const res = await applyTransaction(dep, fresh, getPaymenkuClient()?.mode === "sandbox" || Boolean(deps.client), actor.adminId ? "admin-check" : "user-check");
        return { ok: false, message: res.outcome === "credited" || res.outcome === "late_credited" ? "Pembayaranmu sudah diterima dan saldo ditambahkan." : "Pembayaran sudah diterima." };
      }
      await gw.client.cancelTransaction(dep.external_id);
    } catch (e) {
      if (e instanceof PaymenkuError && e.kind === "rejected") note = " Paymenku tidak mendukung pembatalan untuk kanal ini; bila kamu sudah membayar, saldo tetap masuk.";
      else if (e instanceof PaymenkuError && e.ambiguous) return { ok: false, message: "Paymenku belum bisa dihubungi. Coba lagi sebentar." };
    }
  }
  const { data } = await db.from("deposits").update({ status: "dibatalkan", gateway_status: "cancelled" }).eq("id", dep.id).eq("status", "menunggu").select("id");
  if (!data?.length) return { ok: false, message: "Status deposit sudah berubah." };
  await logSystem("deposit.paymenku_cancelled", "deposit", dep.id, null, { by: actor.adminId ? "admin" : "user" });
  return { ok: true, message: `Deposit dibatalkan.${note}` };
}
