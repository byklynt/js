/**
 * Measured delivery-time estimates against the linked DEV Supabase project (mock provider, never the real Likeo). Run with: npm run test:db
 * Durations are exact: provider_accepted_at = T - d and the sync is applied with now = T, so completed_at - provider_accepted_at = d seconds.
 * Users (@jagoansosmed-test.invalid) and ZT- services are removed afterwards by scripts/db-cleanup-test-data.sql.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { chooseEstimate, statsFromColumns, summarizeDurations, quantityBucket } from "@/lib/service-estimate";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const fileEnv: Record<string, string> = {};
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0 && !line.startsWith("#")) fileEnv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
}
for (const [k, v] of Object.entries(fileEnv)) if (process.env[k] === undefined) process.env[k] = v;
const enabled = process.env.RUN_DB_TESTS === "1" && Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY));

describe.skipIf(!enabled)("measured delivery-time estimates (mock provider)", () => {
  const run = Math.random().toString(36).slice(2, 7);
  let m: {
    db: ReturnType<typeof import("@/lib/server/supabase-admin").supabaseAdmin>;
    sync: typeof import("@/lib/server/sync");
    orders: typeof import("@/lib/server/orders");
    services: typeof import("@/lib/server/services");
    client: typeof import("@/lib/server/providers/client");
    config: typeof import("@/lib/server/providers/config");
  };
  const SVC = `ZT-E${run}`.toUpperCase();
  const SVC2 = `ZT-F${run}`.toUpperCase();
  let user = "";
  let admin = "";
  let seq = 0;
  const password = `Est-${run}-pass1`;

  const newUser = async (label: string, role?: "admin") => {
    const username = `zt_${label}_${run}`.slice(0, 24);
    const { data, error } = await m.db.auth.admin.createUser({ email: `${username}@jagoansosmed-test.invalid`, password, email_confirm: true, user_metadata: { username } });
    if (error || !data.user) throw new Error(error?.message);
    if (role) await m.db.from("profiles").update({ role }).eq("id", data.user.id);
    return { id: data.user.id, email: `${username}@jagoansosmed-test.invalid` };
  };
  const stats = async (service = SVC) => (await m.db.from("service_completion_stats").select("*").eq("service_id", service).maybeSingle()).data;
  const orderRow = async (id: number) => (await m.db.from("orders").select("status,completed_at,completion_counts,completed_approx,provider_accepted_at,status_manual,sync_error").eq("id", id).single()).data!;

  type Opts = { service?: string; quantity?: number; lastSyncedAgo?: number | null; syncError?: string; statusManual?: boolean; provider?: string; remains?: number; completeAt?: Date };
  /** An active order accepted `d` seconds before T, completed through the real sync code at T (or left as is when the provider says something else). */
  async function finish(d: number, o: Opts = {}) {
    const T = o.completeAt ?? new Date();
    seq++;
    const pid = `MK-ZE${run}${seq}`;
    const { data, error } = await m.db.from("orders").insert({
      user_id: user, service_id: o.service ?? SVC, provider_id: m.config.LIKEO_ID, provider_order_id: pid, link: `https://zt.test/${run}/e${seq}`,
      quantity: o.quantity ?? 1000, charge: 0, remains: o.quantity ?? 1000, status: "berjalan",
      provider_accepted_at: new Date(T.getTime() - d * 1000).toISOString(), created_at: new Date(T.getTime() - d * 1000 - 5000).toISOString(),
      last_synced_at: o.lastSyncedAgo === null ? null : new Date(T.getTime() - (o.lastSyncedAgo ?? 60) * 1000).toISOString(),
      ...(o.syncError ? { sync_error: o.syncError } : {}), ...(o.statusManual ? { status_manual: true } : {}),
    }).select("id").single();
    expect(error).toBeNull();
    const id = Number(data!.id);
    m.client.mockWorld().providerOrders[pid] = { status: o.provider ?? "Completed", startCount: 0, remains: o.remains ?? 0 };
    await m.sync.syncOrderNow(m.client.createProviderClient(), id, T);
    return { id, pid, T };
  }

  beforeAll(async () => {
    const ref = process.env.SUPABASE_DEV_PROJECT_REF;
    if (!ref || !process.env.NEXT_PUBLIC_SUPABASE_URL!.includes(ref)) throw new Error("Refusing to run: SUPABASE_DEV_PROJECT_REF does not match NEXT_PUBLIC_SUPABASE_URL.");
    process.env.PROVIDER_MODE = "mock";
    m = {
      db: (await import("@/lib/server/supabase-admin")).supabaseAdmin(),
      sync: await import("@/lib/server/sync"),
      orders: await import("@/lib/server/orders"),
      services: await import("@/lib/server/services"),
      client: await import("@/lib/server/providers/client"),
      config: await import("@/lib/server/providers/config"),
    };
    expect((await m.db.from("providers").select("id").eq("id", m.config.LIKEO_ID).maybeSingle()).data).not.toBeNull();
    await m.db.from("service_categories").insert({ id: `zt-cat-${run}`, label: `ZT Kategori ${run}`, platform: "instagram" });
    for (const id of [SVC, SVC2]) {
      const r = await m.db.from("services").insert({ id, provider_id: m.config.LIKEO_ID, provider_service_id: id === SVC2 ? "1001" : `zt${run}`, category_id: `zt-cat-${run}`, name: `ZT Estimasi ${id}`, platform: "instagram", provider_price: 1000, price_per_1000: 1500, min: 1, max: 100000, active: true, imported: true });
      expect(r.error).toBeNull();
    }
    user = (await newUser("u")).id;
    admin = (await newUser("adm", "admin")).id;
  }, 90_000);

  afterAll(async () => {
    const r = spawnSync("npx", ["supabase", "db", "query", "--remote", "--file", "scripts/db-cleanup-test-data.sql", "--yes"], { encoding: "utf8", shell: process.platform === "win32" });
    if (r.status !== 0) console.error("CLEANUP FAILED:", `${r.stdout}${r.stderr}`.slice(-1500));
  }, 120_000);

  it("the stats follow the first completions: exact median / p25 / p75, display threshold at 2 -> 3 -> 5 samples", async () => {
    expect(await stats()).toBeNull();
    const a = await finish(300);
    expect(await orderRow(a.id)).toMatchObject({ status: "selesai", completion_counts: true, completed_approx: false });
    expect((await orderRow(a.id)).completed_at).toBe(a.T.toISOString().replace("Z", "+00:00")); // stamped once, with the sync's time
    await finish(420);
    const two = await stats();
    expect(two).toMatchObject({ sample_count: 2 });
    const view = (row: typeof two) => chooseEstimate(statsFromColumns({ est_n: row?.sample_count, est_median: row?.median_seconds, est_p25: row?.p25_seconds, est_p75: row?.p75_seconds, est_buckets: row?.buckets, est_min: 3 }));
    expect(view(two).text).toBe("Belum ada estimasi"); // 2 samples: not shown
    await finish(360);
    const three = await stats();
    const ref3 = summarizeDurations([300, 420, 360])!;
    expect(three).toMatchObject({ sample_count: 3, median_seconds: ref3.median, p25_seconds: ref3.p25, p75_seconds: ref3.p75 });
    expect(view(three)).toMatchObject({ text: "± 6 menit", note: "Berdasarkan 3 pesanan terakhir" });
    await finish(1500);
    await finish(240);
    const five = await stats();
    const ref5 = summarizeDurations([300, 420, 360, 1500, 240])!;
    expect(five).toMatchObject({ sample_count: 5, median_seconds: ref5.median, p25_seconds: ref5.p25, p75_seconds: ref5.p75 });
    expect(view(five).text).toBe("5 - 7 menit"); // the range from 5 samples (p25 300 s, p75 420 s)
  }, 120_000);

  it("the stats change only on the FIRST transition to selesai: repeated syncs are idempotent and completed_at never moves", async () => {
    const before = await stats();
    const o = await finish(600);
    const afterFirst = await stats();
    expect(afterFirst!.sample_count).toBe(before!.sample_count + 1);
    const row = await orderRow(o.id);
    for (let i = 0; i < 3; i++) await m.sync.syncOrderNow(m.client.createProviderClient(), o.id, new Date(o.T.getTime() + (i + 1) * 120_000));
    const again = await stats();
    expect(again).toMatchObject({ sample_count: afterFirst!.sample_count, median_seconds: afterFirst!.median_seconds, updated_at: afterFirst!.updated_at });
    expect((await orderRow(o.id)).completed_at).toBe(row.completed_at);
    // even a direct write cannot move it
    await m.db.from("orders").update({ completed_at: new Date(Date.UTC(2020, 0, 1)).toISOString() }).eq("id", o.id);
    expect((await orderRow(o.id)).completed_at).toBe(row.completed_at);
  }, 90_000);

  it("excluded: partial, canceled, failed, violation-cancelled, sync_error, manual status, stalled sync, approximate time, refilled afterwards", async () => {
    const base = (await stats())!;
    const same = async (why: string, strictTime = true) => {
      const now = (await stats())!;
      expect({ why, n: now.sample_count, median: now.median_seconds, ...(strictTime ? { updated: now.updated_at } : {}) }).toEqual({ why, n: base.sample_count, median: base.median_seconds, ...(strictTime ? { updated: base.updated_at } : {}) });
    };
    const partial = await finish(200, { provider: "Partial", remains: 10 });
    expect((await orderRow(partial.id)).status).toBe("sebagian");
    await same("partial");
    expect((await orderRow((await finish(200, { provider: "Canceled", remains: 1000 })).id)).status).toBe("dibatalkan");
    await same("canceled");
    expect((await orderRow((await finish(200, { provider: "Failed", remains: 1000 })).id)).status).toBe("dibatalkan");
    await same("failed");
    // violation-cancelled by an admin, the provider later says Completed: not selesai for us, so not counted
    const v = await finish(200, { provider: "Pending", remains: 1000 });
    expect((await m.db.rpc("admin_cancel_order_violation", { p_order: v.id, p_admin: admin, p_reason: "Penipuan" })).error).toBeNull();
    m.client.mockWorld().providerOrders[v.pid] = { status: "Completed", startCount: 0, remains: 0 };
    await m.sync.syncOrderNow(m.client.createProviderClient(), v.id, new Date());
    expect((await orderRow(v.id)).status).toBe("dibatalkan");
    await same("violation-cancelled");
    // finished normally, but the order had a sync problem before it completed
    const se = await finish(200, { syncError: 'Status provider tidak dikenal: "x"' });
    expect(await orderRow(se.id)).toMatchObject({ status: "selesai", completion_counts: false });
    await same("sync_error");
    // an admin had changed its status by hand
    const mn = await finish(200, { statusManual: true });
    expect(await orderRow(mn.id)).toMatchObject({ status: "selesai", completion_counts: false });
    await same("manual status");
    // the sync had stalled: the last successful sync is 10 minutes (> 3 x 2 min) before the completion
    const st = await finish(900, { lastSyncedAgo: 600 });
    expect(await orderRow(st.id)).toMatchObject({ status: "selesai", completion_counts: false });
    await same("stalled sync");
    const st2 = await finish(900, { lastSyncedAgo: null }); // never synced and accepted 15 minutes ago
    expect(await orderRow(st2.id)).toMatchObject({ completion_counts: false });
    await same("never synced, long gap");
    // a backfilled / approximate completion time is never used, even if something flags it as counted
    const ap = await finish(200, { provider: "Pending", remains: 1000 });
    await m.db.from("orders").update({ status: "selesai", completion_counts: true, completed_approx: true }).eq("id", ap.id);
    await same("approximate", false); // recomputed (counted flag) but the row is not changed by it
    // a refill asked for afterwards takes the order out of the sample
    const rf = await finish(700);
    const withRf = (await stats())!;
    expect(withRf.sample_count).toBe(base.sample_count + 1);
    const ins = await m.db.from("refill_requests").insert({ order_id: rf.id, user_id: user, status: "menunggu" });
    expect(ins.error).toBeNull();
    const afterRf = (await stats())!;
    expect(afterRf.sample_count).toBe(base.sample_count);
    expect(afterRf.median_seconds).toBe(base.median_seconds);
  }, 180_000);

  it("window N (default 20) and quantity buckets: only the most recent orders count, buckets match the reference", async () => {
    const orders: { d: number; qty: number }[] = [];
    // 22 orders for SVC2, oldest first; completion times one minute apart so the order of completion is known
    const t0 = Date.now() - 40 * 60_000;
    for (let i = 0; i < 22; i++) {
      const qty = i % 2 === 0 ? 500 : i % 5 === 0 ? 5000 : 20_000;
      const d = 120 + i * 30;
      orders.push({ d, qty });
      await finish(d, { service: SVC2, quantity: qty, completeAt: new Date(t0 + i * 60_000) });
    }
    const last20 = orders.slice(2); // the two oldest fall out of the window
    const ref = summarizeDurations(last20.map((o) => o.d))!;
    const row = (await stats(SVC2))!;
    expect(row).toMatchObject({ sample_count: 20, median_seconds: ref.median, p25_seconds: ref.p25, p75_seconds: ref.p75 });
    for (const bucket of ["small", "medium", "large"] as const) {
      const inBucket = last20.filter((o) => quantityBucket(o.qty) === bucket).map((o) => o.d);
      const b = (row.buckets as Record<string, { n: number; median: number; p25: number; p75: number }>)[bucket];
      const r = summarizeDurations(inBucket)!;
      expect(b, bucket).toMatchObject({ n: inBucket.length, median: r.median, p25: r.p25, p75: r.p75 });
    }
    // the display rule on the real numbers: 5+ samples overall and 3+ in the bucket -> the bucket estimate
    const est = statsFromColumns({ est_n: row.sample_count, est_median: row.median_seconds, est_p25: row.p25_seconds, est_p75: row.p75_seconds, est_buckets: row.buckets, est_min: 3 })!;
    expect(chooseEstimate(est, 500)).toMatchObject({ scope: "bucket" });
    expect(chooseEstimate(est, 500).note).toContain("jumlah serupa");
  }, 240_000);

  it("the catalogue returns the aggregates in the same query and the detail panel uses them", async () => {
    const page = await m.services.getServices({ search: SVC });
    expect(page.items).toHaveLength(1);
    const est = page.items[0].est!;
    const row = (await stats())!;
    expect(est).toMatchObject({ n: row.sample_count, med: row.median_seconds, p25: row.p25_seconds, p75: row.p75_seconds, ms: 3 });
    const detail = await m.services.getServiceDetail(SVC);
    expect(detail!.estimate).toBe(chooseEstimate(est).text);
    // a service nobody completed an order for carries no estimate at all (nothing misleading)
    expect((await m.services.getServices({ search: `ZT Estimasi ${SVC2}` })).items[0]?.est?.n).toBe(20);
    await m.db.from("services").insert({ id: `ZT-N${run}`.toUpperCase(), provider_id: m.config.LIKEO_ID, provider_service_id: `zt${run}n`, category_id: `zt-cat-${run}`, name: `ZT Kosong ${run}`, platform: "instagram", provider_price: 1000, price_per_1000: 1500, min: 1, max: 1000, active: true, imported: true });
    const none = (await m.services.getServices({ search: `ZT Kosong ${run}` })).items[0];
    expect(none.est).toBeUndefined();
    expect(chooseEstimate(none.est).text).toBe("Belum ada estimasi");
  }, 90_000);

  it("RLS: users can read the aggregate but never other users' order-level data, the manual text, or write the stats", async () => {
    const other = await newUser("o");
    const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    expect((await c.auth.signInWithPassword({ email: other.email, password })).error).toBeNull();
    const agg = await c.from("service_completion_stats").select("service_id,sample_count,median_seconds").eq("service_id", SVC);
    expect(agg.data).toHaveLength(1); // the aggregate is readable
    expect((await c.from("orders").select("id,completed_at,provider_accepted_at").eq("service_id", SVC)).data ?? []).toHaveLength(0); // other users' durations are not
    expect((await c.from("services").select("estimate_override")).error).not.toBeNull(); // column not granted
    expect((await c.from("services").select("stats_reset_at")).error).not.toBeNull();
    const upd = await c.from("service_completion_stats").update({ median_seconds: 1 }).eq("service_id", SVC).select();
    expect(upd.data ?? []).toHaveLength(0);
    expect((await c.from("service_completion_stats").insert({ service_id: SVC2, sample_count: 99, median_seconds: 1, p25_seconds: 1, p75_seconds: 1 })).error).not.toBeNull();
    expect((await c.rpc("recompute_service_completion_stats", { p_service: SVC })).error).not.toBeNull();
    expect((await c.rpc("reset_service_completion_stats", { p_service: SVC, p_admin: admin })).error).not.toBeNull();
    expect((await stats())!.median_seconds).not.toBe(1);
  }, 90_000);

  it("the cron pass refreshes missing / stale rows; a reset forgets the past, is audited, and later completions count again", async () => {
    // cron: a counted service whose row is gone gets it back
    await m.db.from("service_completion_stats").delete().eq("service_id", SVC2);
    const refreshed = await m.db.rpc("refresh_completion_stats", { p_all: false });
    expect(Number(refreshed.data)).toBeGreaterThanOrEqual(1);
    expect((await stats(SVC2))!.sample_count).toBe(20);

    const nBefore = (await stats())!.sample_count;
    expect(nBefore).toBeGreaterThanOrEqual(5);
    expect((await m.db.rpc("reset_service_completion_stats", { p_service: SVC, p_admin: admin })).error).toBeNull();
    expect(await stats()).toBeNull();
    expect((await m.db.from("services").select("stats_reset_at").eq("id", SVC).single()).data!.stats_reset_at).not.toBeNull();
    const audit = (await m.db.from("audit_logs").select("admin_id,before,after").eq("action", "service.stats_reset").eq("target_id", SVC)).data ?? [];
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ admin_id: admin, before: { sampleCount: nBefore }, after: { sampleCount: 0 } });
    // the old orders are not counted again by a full refresh ...
    await m.db.rpc("refresh_completion_stats", { p_all: true });
    expect(await stats()).toBeNull();
    // ... but a completion after the reset is
    await new Promise((r) => setTimeout(r, 1200));
    await finish(480);
    expect((await stats())).toMatchObject({ sample_count: 1, median_seconds: 480 });
    // a non-admin cannot reset
    expect((await m.db.rpc("reset_service_completion_stats", { p_service: SVC, p_admin: user })).error).not.toBeNull();
  }, 120_000);

  it("provider_accepted_at is stamped when the provider accepts the order", async () => {
    await m.db.rpc("apply_ledger_entry", { p_user: user, p_type: "deposit", p_amount: 50_000, p_ref_type: "zt", p_ref_id: `${run}:est`, p_note: "seed", p_by: "t" });
    const before = Date.now();
    const o = await m.orders.placeOrder({ userId: user, serviceId: SVC2, link: `https://zt.test/${run}/placed`, quantity: 1000 }, { client: m.client.createProviderClient() });
    const row = (await m.db.from("orders").select("provider_order_id,provider_accepted_at,completed_at").eq("id", Number(o.id)).single()).data!;
    expect(row.provider_order_id).toMatch(/^MK-/);
    expect(new Date(row.provider_accepted_at!).getTime()).toBeGreaterThanOrEqual(before - 2000);
    expect(row.completed_at).toBeNull();
  }, 90_000);
});
