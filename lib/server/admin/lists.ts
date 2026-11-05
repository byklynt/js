import "server-only";
import type { AdminDeposit, AdminTicket, AdminUser, AuditLog } from "@/lib/admin-data";
import type { AdminRefill } from "@/lib/admin-data";
import { computeExpectedRefund, computeUserCancelRefund, DELIVERED, isStuck } from "@/lib/server/rules";
import { ORDER_SELECT, toAdminOrder } from "@/lib/server/repo/orders";
import { loadSettings } from "@/lib/server/repo/settings";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { listAllTickets } from "@/lib/server/tickets";
import type { LedgerEntry, LedgerType, RefundRecord } from "@/lib/server/types";
import type { RefundRow } from "@/lib/server/views";
import type { AdminOrder } from "@/lib/admin-data";

/**
 * Server-side lists of the admin panel: keyset pagination (stable under inserts, index friendly), SQL filters and search, no row
 * windows held in memory. Every loader returns `{ rows, next }`; pass `next` back as `cursor` for the following page.
 */
export const PAGE_SIZE = 100;
export type Paged<T> = { rows: T[]; next: string | null };

const enc = (t: string, id: string) => Buffer.from(`${t}|${id}`).toString("base64url");
function dec(cursor?: string | null): { t: string; id: string } | null {
  if (!cursor) return null;
  const [t, id] = Buffer.from(cursor, "base64url").toString().split("|");
  // Only a timestamp and an id shape are accepted: the value goes into a PostgREST filter.
  return t && id && /^[0-9TZ:.+\- ]{10,40}$/.test(t) && /^[0-9a-fA-F-]{1,40}$/.test(id) ? { t, id } : null;
}
/** Text search input: letters, digits and a few separators only (it is used inside an ilike filter). */
const clean = (q?: string | null) => (q ?? "").replace(/[^\p{L}\p{N}@._:/ -]/gu, "").trim().slice(0, 60);
const num = (v: unknown) => Number(v ?? 0);

// A generic query type is overkill here: filters are applied before the keyset clause.
type Q = { or(f: string): Q; order(c: string, o?: { ascending: boolean }): Q; limit(n: number): Q };
function after<T extends Q>(q: T, cursor: { t: string; id: string } | null, idCol = "id"): T {
  return cursor ? (q.or(`created_at.lt."${cursor.t}",and(created_at.eq."${cursor.t}",${idCol}.lt."${cursor.id}")`) as T) : q;
}
function page<R extends { created_at: string; id: string | number }>(rows: R[], limit: number): { slice: R[]; next: string | null } {
  const slice = rows.slice(0, limit);
  return { slice, next: rows.length > limit ? enc(slice[slice.length - 1].created_at, String(slice[slice.length - 1].id)) : null };
}

// ---------------------------------------------------------------------------------------------------------------- orders
export async function listOrders(o: { cursor?: string | null; q?: string | null; limit?: number } = {}): Promise<Paged<AdminOrder> & { stuckIds: string[] }> {
  const limit = o.limit ?? PAGE_SIZE;
  const q = clean(o.q);
  let query = supabaseAdmin().from("orders").select(ORDER_SELECT).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
  if (q) query = /^\d{1,12}$/.test(q) ? query.eq("id", Number(q)) : query.ilike("link", `%${q}%`);
  const { data, error } = await after(query as unknown as Q, dec(o.cursor)) as unknown as { data: unknown[] | null; error: { message: string } | null };
  if (error) throw new Error(`orders: ${error.message}`);
  const { slice, next } = page((data ?? []) as { created_at: string; id: number }[], limit);
  const rows = (slice as unknown as Parameters<typeof toAdminOrder>[0][]).map(toAdminOrder);
  const hours = (await loadSettings()).operations.stuckHours;
  const now = new Date();
  return { rows, next, stuckIds: rows.filter((r) => isStuck(r, now, hours)).map((r) => r.id) };
}

// -------------------------------------------------------------------------------------------------------------- deposits
type DepRow = { id: string; user_id: string; method: string; amount: number; status: string; created_at: string; proof: string | null; external_id: string | null; user: { username: string } | null };
const toDeposit = (d: DepRow): AdminDeposit => ({
  id: d.id, userId: d.user_id, username: d.user?.username ?? "", method: d.method, amount: num(d.amount), status: d.status as AdminDeposit["status"], createdAt: d.created_at, proof: d.proof ?? "", externalId: d.external_id,
});
export async function listDeposits(o: { cursor?: string | null; q?: string | null; limit?: number } = {}): Promise<Paged<AdminDeposit>> {
  const limit = o.limit ?? PAGE_SIZE;
  const q = clean(o.q);
  let query = supabaseAdmin().from("deposits").select("id,user_id,method,amount,status,created_at,proof,external_id,user:profiles!deposits_user_id_fkey(username)").order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
  if (q) query = query.or(`method.ilike.%${q}%,external_id.ilike.%${q}%`);
  const { data, error } = await after(query as unknown as Q, dec(o.cursor)) as unknown as { data: DepRow[] | null; error: { message: string } | null };
  if (error) throw new Error(`deposits: ${error.message}`);
  const { slice, next } = page(data ?? [], limit);
  return { rows: slice.map(toDeposit), next };
}

// --------------------------------------------------------------------------------------------------------------- refunds
type RfRow = { id: string; order_id: number; user_id: string; amount: number; reason: string; source: string; status: string; processed_by: string | null; reject_reason: string | null; note: string | null; reversed: boolean; overridden: boolean; policy_percent: number | null; cancel_request_id: string | null; created_at: string; processed_at: string | null; user: { username: string } | null };
const RF_SELECT = "*, user:profiles!refunds_user_id_fkey(username)";

/** Refunds waiting for a decision come first (all of them, first page only), then history newest first. Also lists orders that owe a refund nobody created. */
export async function listRefunds(o: { cursor?: string | null; limit?: number } = {}): Promise<Paged<RefundRow>> {
  const limit = o.limit ?? PAGE_SIZE;
  const sb = supabaseAdmin();
  const cursor = dec(o.cursor);
  const settings = await loadSettings();
  let hist = sb.from("refunds").select(RF_SELECT).neq("status", "menunggu").order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
  hist = after(hist as unknown as Q, cursor) as unknown as typeof hist;
  const [{ data: histRows }, waiting] = await Promise.all([
    hist as unknown as Promise<{ data: RfRow[] | null }>,
    cursor ? Promise.resolve({ data: [] as RfRow[] }) : (sb.from("refunds").select(RF_SELECT).eq("status", "menunggu").order("created_at", { ascending: false }).limit(200) as unknown as Promise<{ data: RfRow[] | null }>),
  ]);
  const { slice, next } = page(histRows ?? [], limit);
  const refunds = [...(waiting.data ?? []), ...slice];

  const orderIds = [...new Set(refunds.map((r) => r.order_id))];
  const [orders, ledger, owing] = await Promise.all([
    orderIds.length ? sb.from("orders").select(ORDER_SELECT).in("id", orderIds) : Promise.resolve({ data: [] }),
    refunds.length ? sb.from("balance_ledger").select("*").eq("ref_type", "refund").in("ref_id", refunds.map((r) => r.id)) : Promise.resolve({ data: [] }),
    cursor ? Promise.resolve({ data: [] }) : sb.from("orders").select(ORDER_SELECT).in("status", ["dibatalkan", "sebagian", "gagal_kirim"]).eq("refunded_amount", 0).eq("needs_manual_check", false).order("id", { ascending: false }).limit(100),
  ]);
  const byOrder = new Map(((orders.data ?? []) as unknown as Parameters<typeof toAdminOrder>[0][]).map((r) => [String(r.id), toAdminOrder(r)]));
  const ledgerBy = new Map<string, LedgerEntry[]>();
  for (const l of ledger.data ?? []) ledgerBy.set(l.ref_id, [...(ledgerBy.get(l.ref_id) ?? []), toLedger(l)]);

  const rows: RefundRow[] = refunds.map((r) => {
    const rec = toRefundRecord(r);
    const ord = byOrder.get(String(r.order_id));
    const expected = ord ? computeExpectedRefund(ord) : 0;
    const owes = ord ? ["dibatalkan", "sebagian", "gagal_kirim"].includes(ord.status) : false;
    const percent = r.policy_percent ?? settings.cancelPolicy.refundPercent;
    return {
      ...rec,
      order: { status: ord?.status ?? "selesai", charge: ord?.charge ?? 0, quantity: ord?.quantity ?? 0, delivered: ord ? DELIVERED(ord) : 0, remains: ord?.remains ?? 0, refundedAmount: ord?.refundedAmount ?? 0, providerStatus: "-", expected, mismatch: owes && ord ? ord.refundedAmount !== expected : false },
      ledger: ledgerBy.get(r.id) ?? [],
      cancel: r.reason === "user_cancel" && ord ? {
        ageHours: Math.floor(((r.processed_at ? new Date(r.processed_at).getTime() : Date.now()) - new Date(ord.createdAt).getTime()) / 3_600_000),
        remains: ord.remains, quantity: ord.quantity, percent, calculated: r.status === "selesai" ? num(r.amount) : computeUserCancelRefund(ord, percent),
      } : undefined,
    };
  });
  const waitingOrders = new Set(refunds.filter((r) => r.status === "menunggu").map((r) => String(r.order_id)));
  for (const raw of (owing.data ?? []) as unknown as Parameters<typeof toAdminOrder>[0][]) {
    const ord = toAdminOrder(raw);
    const expected = computeExpectedRefund(ord);
    if (expected <= 0 || waitingOrders.has(ord.id)) continue;
    rows.push({
      id: `missing_${ord.id}`, orderId: ord.id, userId: ord.userId, username: ord.username, amount: expected,
      reason: ord.status === "sebagian" ? "sebagian" : ord.status === "gagal_kirim" ? "gagal_kirim" : "dibatalkan", source: "auto", status: "menunggu", processedBy: null, rejectReason: null,
      note: "Belum ada refund untuk pesanan ini.", createdAt: ord.completedAt ?? ord.createdAt, processedAt: null, reversed: false, virtual: true,
      order: { status: ord.status, charge: ord.charge, quantity: ord.quantity, delivered: DELIVERED(ord), remains: ord.remains, refundedAmount: ord.refundedAmount, providerStatus: "-", expected, mismatch: true },
      ledger: [],
    });
  }
  return { rows, next };
}

const toRefundRecord = (r: RfRow): RefundRecord => ({
  id: r.id, orderId: String(r.order_id), userId: r.user_id, username: r.user?.username ?? "", amount: num(r.amount), reason: r.reason as RefundRecord["reason"], source: r.source as RefundRecord["source"],
  status: r.status as RefundRecord["status"], processedBy: r.processed_by, rejectReason: r.reject_reason, note: r.note, createdAt: r.created_at, processedAt: r.processed_at, reversed: r.reversed,
  policyPercent: r.policy_percent ?? undefined, overridden: r.overridden || undefined, cancelRequestId: r.cancel_request_id,
});

// ---------------------------------------------------------------------------------------------------------------- refills
export async function listRefills(o: { cursor?: string | null; limit?: number } = {}): Promise<Paged<AdminRefill>> {
  const limit = o.limit ?? PAGE_SIZE;
  const query = supabaseAdmin().from("refill_requests").select("id,order_id,user_id,status,created_at,orders!inner(link,services(id,name,platform),user:profiles!orders_user_id_fkey(username))").order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
  const { data, error } = await after(query as unknown as Q, dec(o.cursor)) as unknown as { data: unknown[] | null; error: { message: string } | null };
  if (error) throw new Error(`refill_requests: ${error.message}`);
  const { slice, next } = page((data ?? []) as { created_at: string; id: string }[], limit);
  type R = { id: string; order_id: number; user_id: string; status: string; created_at: string; orders: { link: string; services: { id: string; name: string; platform: string } | null; user: { username: string } | null } };
  return {
    next,
    rows: (slice as unknown as R[]).map((r) => ({
      id: r.id, orderId: String(r.order_id), platform: r.orders.services?.platform ?? "", name: `${r.orders.services?.id ?? ""} - ${r.orders.services?.name ?? ""}`, link: r.orders.link,
      status: r.status as AdminRefill["status"], createdAt: r.created_at, userId: r.user_id, username: r.orders.user?.username ?? "",
    })),
  };
}

// --------------------------------------------------------------------------------------------------------------- tickets
export async function listTicketsPage(o: { cursor?: string | null; limit?: number } = {}): Promise<Paged<AdminTicket>> {
  const limit = o.limit ?? PAGE_SIZE;
  const before = o.cursor && /^[0-9TZ:.+\- ]{10,40}$/.test(Buffer.from(o.cursor, "base64url").toString()) ? Buffer.from(o.cursor, "base64url").toString() : undefined;
  const rows = await listAllTickets({ limit: limit + 1, before });
  const slice = rows.slice(0, limit);
  return { rows: slice, next: rows.length > limit ? Buffer.from(slice[slice.length - 1].updatedAt).toString("base64url") : null };
}

// ----------------------------------------------------------------------------------------------------- ledger / logs / users
const toLedger = (l: { id: string; user_id: string; type: string; amount: number; balance_before: number; balance_after: number; ref_type: string; ref_id: string; note: string; created_by: string; created_at: string }): LedgerEntry => ({
  id: l.id, userId: l.user_id, type: l.type as LedgerType, amount: num(l.amount), balanceBefore: num(l.balance_before), balanceAfter: num(l.balance_after), refType: l.ref_type, refId: l.ref_id, note: l.note, createdBy: l.created_by, createdAt: l.created_at,
});

export async function listLedger(o: { cursor?: string | null; q?: string | null; type?: string | null; limit?: number } = {}): Promise<Paged<LedgerEntry> & { userNames: Record<string, string> }> {
  const limit = o.limit ?? PAGE_SIZE;
  const q = clean(o.q);
  let query = supabaseAdmin().from("balance_ledger").select("*").order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
  if (o.type) query = query.eq("type", o.type);
  if (q) query = query.or(`ref_id.ilike.%${q}%,note.ilike.%${q}%`);
  const { data, error } = await after(query as unknown as Q, dec(o.cursor)) as unknown as { data: Parameters<typeof toLedger>[0][] | null; error: { message: string } | null };
  if (error) throw new Error(`balance_ledger: ${error.message}`);
  const { slice, next } = page(data ?? [], limit);
  const ids = [...new Set(slice.map((l) => l.user_id))];
  const { data: names } = ids.length ? await supabaseAdmin().from("profiles").select("id,username").in("id", ids) : { data: [] };
  return { rows: slice.map(toLedger), next, userNames: Object.fromEntries((names ?? []).map((n) => [n.id, n.username])) };
}

export async function listLogs(o: { cursor?: string | null; q?: string | null; limit?: number } = {}): Promise<Paged<AuditLog>> {
  const limit = o.limit ?? PAGE_SIZE;
  const q = clean(o.q);
  let query = supabaseAdmin().from("audit_logs").select("*").order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
  if (q) query = query.or(`action.ilike.%${q}%,admin_name.ilike.%${q}%,target_id.ilike.%${q}%`);
  const { data, error } = await after(query as unknown as Q, dec(o.cursor)) as unknown as { data: { id: string; created_at: string; admin_id: string | null; admin_name: string; action: string; target_type: string; target_id: string; before: unknown; after: unknown }[] | null; error: { message: string } | null };
  if (error) throw new Error(`audit_logs: ${error.message}`);
  const { slice, next } = page(data ?? [], limit);
  return { next, rows: slice.map((a) => ({ id: a.id, at: a.created_at, adminId: a.admin_id ?? "system", adminName: a.admin_name, action: a.action, targetType: a.target_type, targetId: a.target_id, before: a.before, after: a.after })) };
}

export async function listUsers(o: { cursor?: string | null; q?: string | null; limit?: number } = {}): Promise<Paged<AdminUser> & { flaggedIds: string[] }> {
  const limit = o.limit ?? PAGE_SIZE;
  const q = clean(o.q);
  const sb = supabaseAdmin();
  let query = sb.from("profiles").select("id,username,email,role,status,balance,rank,manual_approval,created_at").neq("role", "admin").order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
  if (q) query = query.or(`username.ilike.%${q}%,email.ilike.%${q}%`);
  const { data, error } = await after(query as unknown as Q, dec(o.cursor)) as unknown as { data: { id: string; username: string; email: string; role: string; status: string; balance: number; rank: string; manual_approval: boolean; created_at: string }[] | null; error: { message: string } | null };
  if (error) throw new Error(`profiles: ${error.message}`);
  const { slice, next } = page(data ?? [], limit);
  const ids = slice.map((u) => u.id);
  const [spend, notes, orders, asked, settings] = await Promise.all([
    ids.length ? sb.from("user_spend").select("user_id,total_spent").in("user_id", ids) : Promise.resolve({ data: [] }),
    ids.length ? sb.from("user_notes").select("user_id,body").in("user_id", ids).order("created_at", { ascending: false }).limit(1000) : Promise.resolve({ data: [] }),
    ids.length ? sb.from("orders").select("user_id,status").in("user_id", ids).limit(20000) : Promise.resolve({ data: [] }),
    ids.length ? sb.from("refunds").select("user_id").eq("source", "user_request").in("user_id", ids) : Promise.resolve({ data: [] }),
    loadSettings(),
  ]);
  const spent = new Map((spend.data ?? []).map((s) => [s.user_id as string, num(s.total_spent)]));
  const notesBy = new Map<string, string[]>();
  for (const n of notes.data ?? []) notesBy.set(n.user_id, [...(notesBy.get(n.user_id) ?? []), n.body]);
  const total = new Map<string, number>();
  const bad = new Map<string, number>();
  for (const r of orders.data ?? []) {
    total.set(r.user_id, (total.get(r.user_id) ?? 0) + 1);
    if (r.status === "dibatalkan" || r.status === "sebagian") bad.set(r.user_id, (bad.get(r.user_id) ?? 0) + 1);
  }
  for (const r of asked.data ?? []) bad.set(r.user_id, (bad.get(r.user_id) ?? 0) + 1);
  const { ratioPercent, minOrders } = settings.risk;
  const flaggedIds = ids.filter((id) => (total.get(id) ?? 0) >= minOrders && Math.round(((bad.get(id) ?? 0) / (total.get(id) ?? 1)) * 1000) / 10 > ratioPercent);
  return {
    next, flaggedIds,
    rows: slice.map((p): AdminUser => ({ id: p.id, username: p.username, email: p.email, balance: num(p.balance), totalSpent: spent.get(p.id) ?? 0, rank: p.rank as AdminUser["rank"], status: p.status as AdminUser["status"], reseller: p.role === "reseller", createdAt: p.created_at, notes: notesBy.get(p.id) ?? [], manualApproval: p.manual_approval })),
  };
}

/** The user drawer: the latest few orders, deposits and ledger rows of ONE user (loaded when the drawer opens). */
export async function loadUserDetail(userId: string) {
  const sb = supabaseAdmin();
  const [orders, deposits, ledger] = await Promise.all([
    sb.from("orders").select(ORDER_SELECT).eq("user_id", userId).order("created_at", { ascending: false }).limit(6),
    sb.from("deposits").select("id,user_id,method,amount,status,created_at,proof,external_id,user:profiles!deposits_user_id_fkey(username)").eq("user_id", userId).order("created_at", { ascending: false }).limit(6),
    sb.from("balance_ledger").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(8),
  ]);
  return {
    orders: ((orders.data ?? []) as unknown as Parameters<typeof toAdminOrder>[0][]).map(toAdminOrder),
    deposits: ((deposits.data ?? []) as unknown as DepRow[]).map(toDeposit),
    ledger: (ledger.data ?? []).map(toLedger),
  };
}
