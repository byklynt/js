/**
 * Concurrency + idempotency tests against a REAL Supabase database (the linked DEV project, or a local one).
 * Run with: npm run test:db   (skipped in a normal `npm test`).
 * The tests create their own temporary users (@jagoansosmed-test.invalid) and ZT- fixtures and remove them afterwards
 * with scripts/db-cleanup-test-data.sql. They refuse to run unless SUPABASE_DEV_PROJECT_REF matches the project URL.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(".env.local")) return out;
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0 && !line.startsWith("#")) out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = { ...loadEnv(), ...(process.env as Record<string, string>) };
const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "";
const enabled = env.RUN_DB_TESTS === "1" && Boolean(url && key);

describe.skipIf(!enabled)("money functions under concurrency (real database)", () => {
  let db: SupabaseClient;
  const run = Math.random().toString(36).slice(2, 8);
  const users: string[] = [];

  async function newUser(label: string): Promise<string> {
    const username = `zt_${label}_${run}`.slice(0, 24);
    const { data, error } = await db.auth.admin.createUser({
      email: `${username}@jagoansosmed-test.invalid`, password: `Tmp-${run}-pass1`, email_confirm: true, user_metadata: { username },
    });
    if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
    users.push(data.user.id);
    return data.user.id;
  }
  const credit = (user: string, amount: number, ref: string) =>
    db.rpc("apply_ledger_entry", { p_user: user, p_type: "deposit", p_amount: amount, p_ref_type: "zt", p_ref_id: `${run}:${user}:${ref}`, p_note: "test", p_by: "test" });
  const balance = async (user: string) => Number((await db.from("profiles").select("balance").eq("id", user).single()).data!.balance);
  const ledgerSum = async (user: string) => ((await db.from("balance_ledger").select("amount").eq("user_id", user)).data ?? []).reduce((n, r) => n + Number(r.amount), 0);

  beforeAll(async () => {
    const ref = env.SUPABASE_DEV_PROJECT_REF;
    if (!ref || new URL(url).hostname !== `${ref}.supabase.co`) throw new Error("Refusing to run: SUPABASE_DEV_PROJECT_REF does not match NEXT_PUBLIC_SUPABASE_URL.");
    db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const prov = await db.from("providers").insert({ name: "ZT", slug: `zt-${run}`, mode: "mock" }).select("id").single();
    expect(prov.error).toBeNull();
    await db.from("service_categories").insert({ id: `zt-cat-${run}`, label: "ZT", platform: "instagram" });
    const svc = await db.from("services").insert({
      id: `ZT-${run}`, provider_id: prov.data!.id, provider_service_id: "1", category_id: `zt-cat-${run}`, name: "ZT", platform: "instagram",
      provider_price: 1000, price_per_1000: 1500, min: 100, max: 100000, active: true,
    });
    expect(svc.error).toBeNull();
    // Order rules are required to order. Insert a test-owned row only when the platform has none yet.
    const rules = await db.from("service_rules").select("platform").in("platform", ["instagram"]);
    if (!rules.data?.length) await db.from("service_rules").insert({ platform: "instagram", label: "Instagram", title: "t", bullets: [], version: "zt-rules" });
  }, 60_000);

  afterAll(() => {
    const r = spawnSync("node", ["scripts/db-cleanup.mjs"], { encoding: "utf8", shell: process.platform === "win32" });
    if (r.status !== 0) console.error("CLEANUP FAILED:", `${r.stdout}${r.stderr}`.slice(-1500));
  }, 120_000);

  const order = (user: string, link: string, quantity = 1000) =>
    db.rpc("place_order", { p_user: user, p_service: `ZT-${run}`, p_link: link, p_quantity: quantity });

  it("two simultaneous orders cannot overdraw the balance", async () => {
    const u = await newUser("a");
    expect((await credit(u, 2000, "seed")).error).toBeNull();
    const results = await Promise.all([order(u, "https://zt.test/1"), order(u, "https://zt.test/2")]);
    const ok = results.filter((r) => !r.error);
    const failed = results.filter((r) => r.error);
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0].error!.hint).toBe("insufficient_balance");
    expect(await balance(u)).toBe(500);
    expect(await balance(u)).toBe(await ledgerSum(u));
  }, 60_000);

  it("five simultaneous orders against a balance for three: exactly three succeed", async () => {
    const u = await newUser("b");
    await credit(u, 4500, "seed");
    const results = await Promise.all([1, 2, 3, 4, 5].map((i) => order(u, `https://zt.test/b${i}`)));
    expect(results.filter((r) => !r.error)).toHaveLength(3);
    expect(results.filter((r) => r.error).every((r) => r.error!.hint === "insufficient_balance")).toBe(true);
    expect(await balance(u)).toBe(0);
    expect(await balance(u)).toBe(await ledgerSum(u));
  }, 60_000);

  it("simultaneous orders for the same link: only one is created and charged", async () => {
    const u = await newUser("c");
    await credit(u, 10000, "seed");
    const results = await Promise.all([1, 2, 3, 4].map(() => order(u, "https://zt.test/same")));
    expect(results.filter((r) => !r.error)).toHaveLength(1);
    expect(results.filter((r) => r.error).every((r) => r.error!.hint === "duplicate_active" || r.error!.hint === "rate_limited")).toBe(true);
    expect(await balance(u)).toBe(8500);
    expect(await balance(u)).toBe(await ledgerSum(u));
  }, 60_000);

  it("the same ledger reference posted five times in parallel credits once", async () => {
    const u = await newUser("d");
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => credit(u, 700, "same-ref")));
    expect(results.every((r) => !r.error)).toBe(true);
    expect(results.filter((r) => (r.data as { duplicate: boolean }[])[0].duplicate === false)).toHaveLength(1);
    expect(await balance(u)).toBe(700);
  }, 60_000);

  it("a double webhook (same external_id, five at once) credits once, bonus included", async () => {
    const u = await newUser("e");
    const ext = `zt-ext-${run}`;
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map(() => db.rpc("credit_deposit", { p_external_id: ext, p_user_id: u, p_amount: 20000, p_method: "qris", p_by: "webhook" }))
    );
    expect(results.filter((r) => r.error)).toHaveLength(0);
    const rows = results.map((r) => (r.data as { duplicate: boolean }[])[0]);
    expect(rows.filter((r) => !r.duplicate)).toHaveLength(1);
    const deposits = await db.from("deposits").select("id").eq("external_id", ext);
    expect(deposits.data).toHaveLength(1);
    const bal = await balance(u);
    expect([20000, 20000 + Math.floor((20000 * 5) / 100)]).toContain(bal); // 5% only when a tier is configured; never twice
    expect(bal).toBe(await ledgerSum(u));
  }, 60_000);

  it("a double sync (the same refund requested five times at once) refunds once", async () => {
    const u = await newUser("f");
    await credit(u, 3000, "seed");
    const placed = await order(u, "https://zt.test/f1");
    expect(placed.error).toBeNull();
    const orderId = (placed.data as { order_id: number }[])[0].order_id;
    await db.from("orders").update({ status: "sebagian", remains: 250 }).eq("id", orderId);
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map(() => db.rpc("create_refund_for_order", { p_order: orderId, p_reason: "sebagian" }))
    );
    expect(results.filter((r) => r.error)).toHaveLength(0);
    const rows = results.map((r) => (r.data as { created: boolean; amount: number }[])[0]);
    expect(rows.filter((r) => r.created)).toHaveLength(1);
    const o = (await db.from("orders").select("refunded_amount, charge").eq("id", orderId).single()).data!;
    expect(Number(o.refunded_amount)).toBe(375);
    expect((await db.from("refunds").select("id").eq("order_id", orderId)).data).toHaveLength(1);
    expect(await balance(u)).toBe(3000 - 1500 + 375);
    expect(await balance(u)).toBe(await ledgerSum(u));
  }, 60_000);

  it("concurrent manual refunds can never exceed the charge", async () => {
    const u = await newUser("g");
    await credit(u, 3000, "seed");
    const placed = await order(u, "https://zt.test/g1");
    const orderId = (placed.data as { order_id: number }[])[0].order_id;
    // Charge is 1500. Five admins each try to refund 1000 at once.
    const admin = await newUser("adm");
    await db.from("profiles").update({ role: "admin" }).eq("id", admin);
    const created = await Promise.all(
      [1, 2, 3, 4, 5].map(() => db.rpc("create_refund_for_order", { p_order: orderId, p_reason: "manual", p_amount: 1000, p_source: "admin", p_by: admin, p_note: "uji refund manual", p_settle: false }))
    );
    const rows = created.filter((r) => !r.error).map((r) => (r.data as { refund_id: string }[])[0].refund_id);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const approvals = await Promise.all(rows.map((id) => db.rpc("approve_refund", { p_refund: id, p_admin: admin })));
    expect(approvals.filter((a) => !a.error).length).toBeLessThanOrEqual(1);
    const o = (await db.from("orders").select("refunded_amount, charge").eq("id", orderId).single()).data!;
    expect(Number(o.refunded_amount)).toBeLessThanOrEqual(Number(o.charge));
    expect(await balance(u)).toBe(await ledgerSum(u));
  }, 60_000);

  it("cron lease: six parallel acquires of one job -> exactly one wins; release and expiry free it", async () => {
    const name = `zt-lease-${run}`;
    const owners = Array.from({ length: 6 }, (_, i) => `o${i}`);
    const results = await Promise.all(owners.map((o) => db.rpc("acquire_cron_lease", { p_name: name, p_ttl_seconds: 60, p_owner: o })));
    expect(results.every((r) => !r.error)).toBe(true);
    const winners = results.map((r, i) => (r.data === true ? owners[i] : null)).filter(Boolean) as string[];
    expect(winners).toHaveLength(1);
    expect((await db.rpc("acquire_cron_lease", { p_name: name, p_ttl_seconds: 60, p_owner: "late" })).data).toBe(false);
    await db.rpc("release_cron_lease", { p_name: name, p_owner: "someone-else" }); // only the owner can release
    expect((await db.rpc("acquire_cron_lease", { p_name: name, p_ttl_seconds: 60, p_owner: "late" })).data).toBe(false);
    await db.rpc("release_cron_lease", { p_name: name, p_owner: winners[0] });
    expect((await db.rpc("acquire_cron_lease", { p_name: name, p_ttl_seconds: 1, p_owner: "next" })).data).toBe(true);
    await new Promise((r) => setTimeout(r, 1500)); // the 1 s lease expires by itself (a crashed run cannot block the job)
    expect((await db.rpc("acquire_cron_lease", { p_name: name, p_ttl_seconds: 60, p_owner: "after-expiry" })).data).toBe(true);
    await db.from("cron_leases").delete().eq("name", name);
  }, 60_000);
});
