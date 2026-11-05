import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { createEmptyDb, setPriceRounding, type AdminDb, type AdminDeposit, type AdminUser, type AuditLog } from "@/lib/admin-data";
import type { CancelRequestRecord, LedgerEntry, LedgerType, RefillRequestRecord, RefundRecord } from "./types";
import { LIKEO_ID } from "./providers/config";
import { listAnnouncements } from "./repo/announcements";
import { ORDER_SELECT, toAdminOrder } from "./repo/orders";
import { loadProviders } from "./repo/providers";
import { loadServicesOf } from "./repo/services-repo";
import { loadSettings } from "./repo/settings";
import { supabaseAdmin } from "./supabase-admin";
import { setSnapshotBalanceMismatches } from "./snapshot-flags";
import { listAllTickets } from "./tickets";

/**
 * READ SIDE of the admin panel. The existing admin pages and the (unit-tested) stats/metrics functions compute from an
 * AdminDb-shaped object. For every admin request that object is now built from Supabase and held in AsyncLocalStorage, so
 * getDb() returns THIS request's data and nothing is shared between requests or admins.
 *
 * It is a BOUNDED window, not the whole database: the latest rows of each table (see LIMITS), all services of the provider,
 * all settings. Anything beyond the window is not shown in the lists and not counted in the dashboard aggregates; the money
 * itself (balances, ledger, refunds) is always read and written by Postgres functions, never from this snapshot.
 * WRITES never go through this object: admin handlers write with queries / RPCs (see lib/admin-actions.ts).
 */
export const SNAPSHOT_LIMITS = { users: 2000, orders: 1500, deposits: 500, refunds: 500, requests: 300, tickets: 200, audit: 300, ledger: 500, runs: 100, alerts: 100, updates: 100 } as const;

const als = new AsyncLocalStorage<AdminDb>();

export function currentSnapshot(): AdminDb | undefined {
  return als.getStore();
}

/** Runs `fn` with a fresh snapshot as the request's getDb(). */
export async function withAdminDb<T>(fn: () => Promise<T>): Promise<T> {
  const db = await buildSnapshot();
  return als.run(db, fn);
}

const n = (v: unknown) => Number(v ?? 0);

async function buildSnapshot(): Promise<AdminDb> {
  const sb = supabaseAdmin();
  const L = SNAPSHOT_LIMITS;
  const [settings, providers, services, tickets, announcements, profiles, orders, deposits, refunds, refills, cancels, audit, ledger, runs, alerts, sanity, updates, spend, notes, mismatch] = await Promise.all([
    loadSettings(),
    loadProviders(),
    loadServicesOf(LIKEO_ID),
    listAllTickets({ limit: L.tickets }),
    listAnnouncements(),
    sb.from("profiles").select("id,username,email,role,status,balance,rank,manual_approval,flagged,created_at").neq("role", "admin").order("created_at", { ascending: false }).limit(L.users),
    sb.from("orders").select(ORDER_SELECT).order("created_at", { ascending: false }).limit(L.orders),
    sb.from("deposits").select("*, user:profiles!deposits_user_id_fkey(username)").order("created_at", { ascending: false }).limit(L.deposits),
    sb.from("refunds").select("*, user:profiles!refunds_user_id_fkey(username)").order("created_at", { ascending: false }).limit(L.refunds),
    sb.from("refill_requests").select("*").order("created_at", { ascending: false }).limit(L.requests),
    sb.from("cancel_requests").select("*").order("created_at", { ascending: false }).limit(L.requests),
    sb.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(L.audit),
    sb.from("balance_ledger").select("*").order("created_at", { ascending: false }).limit(L.ledger),
    sb.from("provider_sync_runs").select("*").order("started_at", { ascending: false }).limit(L.runs),
    sb.from("admin_alerts").select("*").order("created_at", { ascending: false }).limit(L.alerts),
    sb.from("sanity_runs").select("*").order("created_at", { ascending: false }).limit(10),
    sb.from("price_updates").select("*").order("created_at", { ascending: false }).limit(L.updates),
    sb.from("user_spend").select("user_id,total_spent"),
    sb.from("user_notes").select("user_id,body,created_at").order("created_at", { ascending: false }).limit(1000),
    sb.rpc("verify_balances"),
  ]);

  const db = createEmptyDb();
  db.settings = settings;
  setPriceRounding(settings.pricing.roundTo);
  db.providers = providers;
  db.services = services;
  db.tickets = tickets;
  db.announcements = announcements;

  const spent = new Map((spend.data ?? []).map((s) => [s.user_id as string, n(s.total_spent)]));
  const notesBy = new Map<string, string[]>();
  for (const x of notes.data ?? []) notesBy.set(x.user_id, [...(notesBy.get(x.user_id) ?? []), x.body]);
  db.users = (profiles.data ?? []).map((p): AdminUser => ({
    id: p.id, username: p.username, email: p.email, balance: n(p.balance), totalSpent: spent.get(p.id) ?? 0, rank: p.rank as AdminUser["rank"], status: p.status as AdminUser["status"],
    reseller: p.role === "reseller", createdAt: p.created_at, notes: notesBy.get(p.id) ?? [], manualApproval: p.manual_approval,
  }));
  const names = new Map(db.users.map((u) => [u.id, u.username]));

  db.orders = ((orders.data ?? []) as unknown as Parameters<typeof toAdminOrder>[0][]).map(toAdminOrder);
  db.deposits = (deposits.data ?? []).map((d): AdminDeposit => ({
    id: d.id, userId: d.user_id, username: (d.user as { username: string } | null)?.username ?? names.get(d.user_id) ?? "", method: d.method, amount: n(d.amount),
    status: d.status as AdminDeposit["status"], createdAt: d.created_at, proof: d.proof ?? "", externalId: d.external_id,
  }));
  db.refunds = (refunds.data ?? []).map((r): RefundRecord => ({
    id: r.id, orderId: String(r.order_id), userId: r.user_id, username: (r.user as { username: string } | null)?.username ?? "", amount: n(r.amount), reason: r.reason as RefundRecord["reason"],
    source: r.source as RefundRecord["source"], status: r.status as RefundRecord["status"], processedBy: r.processed_by, rejectReason: r.reject_reason, note: r.note,
    createdAt: r.created_at, processedAt: r.processed_at, reversed: r.reversed, policyPercent: r.policy_percent ?? undefined, overridden: r.overridden || undefined, cancelRequestId: r.cancel_request_id,
  }));
  db.refillRequests = (refills.data ?? []).map((r): RefillRequestRecord => ({
    id: r.id, orderId: String(r.order_id), userId: r.user_id, status: r.status as RefillRequestRecord["status"], providerRequestId: r.provider_request_id, rejectReason: r.reject_reason, createdAt: r.created_at,
  }));
  db.cancelRequests = (cancels.data ?? []).map((c): CancelRequestRecord => ({
    id: c.id, orderId: String(c.order_id), userId: c.user_id, status: c.status as CancelRequestRecord["status"], providerRequestId: c.provider_request_id, rejectReason: c.reject_reason, createdAt: c.created_at,
    ageHours: c.age_hours ?? undefined, remainsAtRequest: c.remains_at_request === null ? undefined : n(c.remains_at_request), calculatedRefund: c.calculated_refund === null ? undefined : n(c.calculated_refund), policyPercent: c.policy_percent ?? undefined,
  }));
  db.auditLogs = (audit.data ?? []).map((a): AuditLog => ({
    id: a.id, at: a.created_at, adminId: a.admin_id ?? "system", adminName: a.admin_name, action: a.action, targetType: a.target_type, targetId: a.target_id, before: a.before, after: a.after,
  }));
  db.ledger = (ledger.data ?? []).map((l): LedgerEntry => ({
    id: l.id, userId: l.user_id, type: l.type as LedgerType, amount: n(l.amount), balanceBefore: n(l.balance_before), balanceAfter: n(l.balance_after), refType: l.ref_type, refId: l.ref_id, note: l.note, createdBy: l.created_by, createdAt: l.created_at,
  }));
  db.syncRuns = (runs.data ?? []).map((r) => ({
    id: r.id, providerId: r.provider_id, startedAt: r.started_at, finishedAt: r.finished_at, ordersChecked: r.orders_checked, ordersChanged: r.orders_changed, errors: r.errors, errorMessage: r.error_message,
  }));
  db.alerts = (alerts.data ?? []).map((a) => ({ id: a.id, at: a.created_at, providerId: a.provider_id ?? "", message: a.message }));
  db.sanityRuns = (sanity.data ?? []).map((s) => ({ id: s.id, at: s.created_at, balanceMismatches: s.balance_mismatches, refundMismatches: s.refund_mismatches, discrepancies: s.discrepancies, stuck: s.stuck }));
  db.priceUpdates = (updates.data ?? []).map((u) => ({ id: u.id, serviceId: u.service_id, platform: u.platform, name: u.name, type: u.type as "naik", date: u.created_at.slice(0, 10), detail: u.detail }));
  setSnapshotBalanceMismatches(db, (mismatch.data ?? []).map((m) => ({ userId: m.user_id, username: m.username, stored: n(m.stored), computed: n(m.computed), diff: n(m.diff) })));
  return db;
}

/** Just the providers and their latest sync runs: enough for the public status page, without loading the rest. */
export async function loadSyncHealthDb(): Promise<AdminDb> {
  const db = createEmptyDb();
  const [providers, runs] = await Promise.all([loadProviders(), supabaseAdmin().from("provider_sync_runs").select("*").order("started_at", { ascending: false }).limit(60)]);
  db.providers = providers;
  db.syncRuns = (runs.data ?? []).map((r) => ({
    id: r.id, providerId: r.provider_id, startedAt: r.started_at, finishedAt: r.finished_at, ordersChecked: r.orders_checked, ordersChanged: r.orders_changed, errors: r.errors, errorMessage: r.error_message,
  }));
  return db;
}
