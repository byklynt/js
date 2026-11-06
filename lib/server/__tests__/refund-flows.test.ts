/**
 * Refund and cancellation money flows, end to end, against the linked DEV Supabase project with the MOCK provider (never the real Likeo).
 * Every scenario has its own user and order, so the expected balances are exact. Run with: npm run test:db
 * Users (@jagoansosmed-test.invalid) and ZT- fixtures are removed afterwards by scripts/db-cleanup-test-data.sql.
 */
import { existsSync, readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanupOrFail } from "../../../scripts/lib/test-cleanup.mjs";

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

type Row = { scenario: string; expected: string; actual: string; ok: boolean };
const report: Row[] = [];
/** Runs one scenario and records "expected / actual / pass" for the final table. */
async function scenario(name: string, expected: string, fn: () => Promise<string>) {
  try {
    const actual = await fn();
    report.push({ scenario: name, expected, actual, ok: true });
  } catch (e) {
    report.push({ scenario: name, expected, actual: e instanceof Error ? e.message.split("\n")[0] : String(e), ok: false });
    throw e;
  }
}

describe.skipIf(!enabled)("refund and cancellation flows (mock provider)", () => {
  /** Every fixture of this file carries MARKER (ids, usernames, slugs): the pre-clean removes leftovers by it. */
  const MARKER = "rf";
  const run = MARKER + Math.random().toString(36).slice(2, 7);
  let PROV = "";
  let m: {
    db: ReturnType<typeof import("@/lib/server/supabase-admin").supabaseAdmin>;
    sync: typeof import("@/lib/server/sync");
    refunds: typeof import("@/lib/server/refunds");
    requests: typeof import("@/lib/server/requests");
    client: typeof import("@/lib/server/providers/client");
    config: typeof import("@/lib/server/providers/config");
  };
  const users: string[] = [];
  let admin = "";
  let seq = 0;
  const SVC = `ZT-${run}`.toUpperCase();

  const newUser = async (label: string, role?: "admin") => {
    const username = `zt_${label}${++seq}_${run}`.slice(0, 24);
    const { data, error } = await m.db.auth.admin.createUser({ email: `${username}@jagoansosmed-test.invalid`, password: `Tmp-${run}-pass1`, email_confirm: true, user_metadata: { username } });
    if (error || !data.user) throw new Error(error?.message);
    if (role) await m.db.from("profiles").update({ role }).eq("id", data.user.id);
    users.push(data.user.id);
    return data.user.id;
  };
  const balanceOf = async (id: string) => Number((await m.db.from("profiles").select("balance").eq("id", id).single()).data!.balance);
  const ledgerOf = async (id: string) => ((await m.db.from("balance_ledger").select("type,amount,ref_type,ref_id").eq("user_id", id).order("created_at")).data ?? []).map((l) => ({ ...l, amount: Number(l.amount) }));
  /** INVARIANT: profile balance == SUM(ledger). Checked after every scenario. */
  const expectLedgerSum = async (id: string) => {
    const sum = (await ledgerOf(id)).reduce((s, l) => s + l.amount, 0);
    expect(await balanceOf(id)).toBe(sum);
  };
  const orderRow = async (id: number) => (await m.db.from("orders").select("status,refunded_amount,remains,cancelled_by,sync_error,quantity,charge").eq("id", id).single()).data!;
  const refundRows = async (orderId: number) => (await m.db.from("refunds").select("id,amount,reason,status,source").eq("order_id", orderId)).data ?? [];
  const notifs = async (id: string) => (await m.db.from("notifications").select("type,title").eq("user_id", id)).data ?? [];
  const refundEntries = async (id: string) => (await ledgerOf(id)).filter((l) => l.type === "refund");

  /** A user with an order for exactly `charge` (debited through the ledger like place_order does), submitted to the mock provider as "MK-ZT...". */
  async function makeOrder(o: { charge: number; quantity: number; balanceExtra?: number; ageHours?: number }) {
    const user = await newUser("u");
    const { error: ce } = await m.db.rpc("apply_ledger_entry", { p_user: user, p_type: "deposit", p_amount: o.charge + (o.balanceExtra ?? 1000), p_ref_type: "zt", p_ref_id: `${run}:${user}`, p_note: "seed", p_by: "t" });
    expect(ce).toBeNull();
    const providerOrderId = `MK-ZT${run}${seq}`;
    const { data, error } = await m.db.from("orders").insert({
      user_id: user, service_id: SVC, provider_id: PROV, provider_order_id: providerOrderId, link: `https://zt.test/${run}/${seq}`,
      quantity: o.quantity, charge: o.charge, remains: o.quantity, status: "menunggu",
      ...(o.ageHours ? { created_at: new Date(Date.now() - o.ageHours * 3_600_000).toISOString() } : {}),
    }).select("id").single();
    expect(error).toBeNull();
    const id = Number(data!.id);
    const { error: de } = await m.db.rpc("apply_ledger_entry", { p_user: user, p_type: "order", p_amount: -o.charge, p_ref_type: "order", p_ref_id: String(id), p_note: "order", p_by: user });
    expect(de).toBeNull();
    return { user, id, providerOrderId, quantity: o.quantity, charge: o.charge, startBalance: o.charge + (o.balanceExtra ?? 1000) };
  }
  const setProvider = (pid: string, status: string, remains: number) => { m.client.mockWorld().providerOrders[pid] = { status, startCount: 10, remains }; };
  const syncNow = (id: number) => m.sync.syncOrderNow(m.client.createProviderClient(), id);

  beforeAll(async () => {
    const ref = process.env.SUPABASE_DEV_PROJECT_REF;
    if (!ref || new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname !== `${ref}.supabase.co`) throw new Error("Refusing to run: SUPABASE_DEV_PROJECT_REF does not match NEXT_PUBLIC_SUPABASE_URL.");
    process.env.PROVIDER_MODE = "mock"; // the real Likeo `add` is never called from these tests
    m = {
      db: (await import("@/lib/server/supabase-admin")).supabaseAdmin(),
      sync: await import("@/lib/server/sync"),
      refunds: await import("@/lib/server/refunds"),
      requests: await import("@/lib/server/requests"),
      client: await import("@/lib/server/providers/client"),
      config: await import("@/lib/server/providers/config"),
    };
    expect(m.config.providerMode()).toBe("mock");
    // pre-clean: leftovers of an earlier (killed) run of THIS suite only, found by the suite marker; then fixtures that are unique to this run
    await cleanupOrFail({ marker: MARKER });
    const provRow = await m.db.from("providers").insert({ name: `ZT ${run}`, slug: `zt-${run}`, mode: "mock", active: true }).select("id").single();
    expect(provRow.error).toBeNull();
    PROV = provRow.data!.id;
    await m.db.from("service_categories").insert({ id: `zt-cat-${run}`, label: `ZT Kategori ${run}`, platform: "instagram" });
    const svc = await m.db.from("services").insert({
      id: SVC, provider_id: PROV, provider_service_id: `zt${run}`, category_id: `zt-cat-${run}`, name: `ZT Refund ${run}`, platform: "instagram",
      provider_price: 1000, price_per_1000: 1500, min: 1, max: 100000, cancel: true, refill: true, refill_days: 30, active: true, imported: true,
    });
    expect(svc.error).toBeNull();
    admin = await newUser("adm", "admin");
  }, 240_000);

  afterAll(async () => {
    console.log("\nSCENARIO TABLE\n" + report.map((r) => `${r.ok ? "PASS" : "FAIL"} | ${r.scenario} | expected: ${r.expected} | actual: ${r.actual}`).join("\n"));
    await cleanupOrFail({ marker: MARKER }); // in-process, loud on failure (prints the manual command)
  }, 300_000);

  it("Canceled by provider: full refund, one refund entry, status dibatalkan, notifications", async () => {
    await scenario("Canceled by provider", "balance back to start; 1 refund entry of 1500; dibatalkan; notified", async () => {
      const o = await makeOrder({ charge: 1500, quantity: 1000 });
      expect(await balanceOf(o.user)).toBe(o.startBalance - 1500);
      setProvider(o.providerOrderId, "Canceled", 1000);
      const res = await syncNow(o.id);
      expect(res).toMatchObject({ before: "menunggu", after: "dibatalkan", refunded: true });
      expect(await balanceOf(o.user)).toBe(o.startBalance);
      expect((await refundEntries(o.user)).map((l) => l.amount)).toEqual([1500]);
      expect(await orderRow(o.id)).toMatchObject({ status: "dibatalkan", refunded_amount: 1500, cancelled_by: "provider" });
      const n = await notifs(o.user);
      expect(n.some((x) => x.type === "pesanan" && x.title.includes(`#${o.id}`))).toBe(true);
      expect(n.some((x) => x.type === "refund")).toBe(true);
      await expectLedgerSum(o.user);
      return `balance ${o.startBalance}, 1 refund entry (1500), dibatalkan`;
    });
  }, 60_000);

  it("Failed by provider: full refund, one refund entry, status dibatalkan, notifications", async () => {
    await scenario("Failed by provider", "balance back to start; 1 refund entry of 2000; dibatalkan; notified", async () => {
      const o = await makeOrder({ charge: 2000, quantity: 500 });
      setProvider(o.providerOrderId, "Failed", 500);
      expect(await syncNow(o.id)).toMatchObject({ after: "dibatalkan", refunded: true });
      expect(await balanceOf(o.user)).toBe(o.startBalance);
      expect((await refundEntries(o.user)).map((l) => l.amount)).toEqual([2000]);
      expect((await notifs(o.user)).some((x) => x.type === "refund")).toBe(true);
      await expectLedgerSum(o.user);
      return `balance ${o.startBalance}, 1 refund entry (2000), dibatalkan`;
    });
  }, 60_000);

  it("Partial: refund = floor(charge * remains / quantity), never rounded up, status sebagian", async () => {
    await scenario("Partial 250/1000, charge 1500", "refund 375, sebagian", async () => {
      const o = await makeOrder({ charge: 1500, quantity: 1000 });
      setProvider(o.providerOrderId, "Partial", 250);
      await syncNow(o.id);
      expect(await orderRow(o.id)).toMatchObject({ status: "sebagian", refunded_amount: 375, remains: 250 });
      expect(await balanceOf(o.user)).toBe(o.startBalance - 1500 + 375);
      expect((await refundEntries(o.user)).map((l) => l.amount)).toEqual([375]);
      await expectLedgerSum(o.user);
      return "refund 375, sebagian";
    });
    await scenario("Partial, charge not evenly divisible (1000 x 1/3)", "refund 333 (floor, not 334)", async () => {
      const o = await makeOrder({ charge: 1000, quantity: 3 });
      setProvider(o.providerOrderId, "Partial", 1);
      await syncNow(o.id);
      expect((await refundEntries(o.user)).map((l) => l.amount)).toEqual([333]);
      expect(await balanceOf(o.user)).toBe(o.startBalance - 1000 + 333);
      await expectLedgerSum(o.user);
      return "refund 333";
    });
    await scenario("Partial, 2/3 of 1001", "refund 667 (floor of 667.33)", async () => {
      const o = await makeOrder({ charge: 1001, quantity: 3 });
      setProvider(o.providerOrderId, "Partial", 2);
      await syncNow(o.id);
      expect((await refundEntries(o.user)).map((l) => l.amount)).toEqual([667]);
      await expectLedgerSum(o.user);
      return "refund 667";
    });
  }, 90_000);

  it("running the sync 3 times on one order: exactly one refund", async () => {
    await scenario("Sync x3 on the same Partial order", "1 refund row, 1 ledger entry, balance credited once", async () => {
      const o = await makeOrder({ charge: 1500, quantity: 1000 });
      setProvider(o.providerOrderId, "Partial", 400);
      const results = [await syncNow(o.id), await syncNow(o.id), await syncNow(o.id)];
      expect(results.map((r) => r.refunded)).toEqual([true, false, false]);
      expect(await refundRows(o.id)).toHaveLength(1);
      expect((await refundEntries(o.user)).map((l) => l.amount)).toEqual([600]);
      expect(await balanceOf(o.user)).toBe(o.startBalance - 1500 + 600);
      // a direct replay of the SQL function is a no-op too, and the ledger UNIQUE(type, ref_type, ref_id) rejects a forged duplicate
      expect((await m.refunds.autoRefundForOrder(String(o.id))).created).toBe(false);
      const ref = (await refundRows(o.id))[0];
      const dup = await m.db.rpc("apply_ledger_entry", { p_user: o.user, p_type: "refund", p_amount: 600, p_ref_type: "refund", p_ref_id: ref.id, p_note: "dup", p_by: "t" });
      expect(dup.error !== null || (dup.data as { duplicate?: boolean }[] | null)?.[0]?.duplicate === true).toBe(true);
      expect(await balanceOf(o.user)).toBe(o.startBalance - 1500 + 600);
      await expectLedgerSum(o.user);
      return "1 refund row, balance credited once (600)";
    });
  }, 90_000);

  it("two concurrent sync runs on the same order: exactly one refund", async () => {
    await scenario("Promise.all of 2 and 4 concurrent syncs", "1 refund entry", async () => {
      for (const parallel of [2, 4]) {
        const o = await makeOrder({ charge: 3000, quantity: 1000 });
        setProvider(o.providerOrderId, "Canceled", 1000);
        const results = await Promise.all(Array.from({ length: parallel }, () => syncNow(o.id)));
        expect(results.filter((r) => r.refunded)).toHaveLength(1);
        expect(await refundRows(o.id)).toHaveLength(1);
        expect((await refundEntries(o.user)).map((l) => l.amount)).toEqual([3000]);
        expect(await balanceOf(o.user)).toBe(o.startBalance);
        await expectLedgerSum(o.user);
      }
      return "exactly 1 refund each time";
    });
  }, 90_000);

  it("a manual admin refund already exists, then the sync runs: no double refund", async () => {
    await scenario("Manual refund = owed amount, then Partial sync", "total refunded stays 375 (no second 375)", async () => {
      const o = await makeOrder({ charge: 1500, quantity: 1000 });
      await m.refunds.createManualRefund({ orderId: String(o.id), amount: 375, note: "Refund manual oleh admin untuk uji", source: "admin", adminId: admin, settleNow: true });
      expect(await balanceOf(o.user)).toBe(o.startBalance - 1500 + 375);
      setProvider(o.providerOrderId, "Partial", 250);
      await syncNow(o.id);
      await syncNow(o.id);
      expect(await orderRow(o.id)).toMatchObject({ status: "sebagian", refunded_amount: 375 });
      expect(await balanceOf(o.user)).toBe(o.startBalance - 1500 + 375);
      expect((await refundEntries(o.user)).map((l) => l.amount)).toEqual([375]);
      await expectLedgerSum(o.user);
      return "refunded_amount 375, 1 refund entry";
    });
    await scenario("Manual refund smaller than owed, then Canceled sync", "auto refund pays only the rest (1500 - 400 = 1100)", async () => {
      const o = await makeOrder({ charge: 1500, quantity: 1000 });
      await m.refunds.createManualRefund({ orderId: String(o.id), amount: 400, note: "Refund manual sebagian oleh admin", source: "admin", adminId: admin, settleNow: true });
      setProvider(o.providerOrderId, "Canceled", 1000);
      await syncNow(o.id);
      expect(await orderRow(o.id)).toMatchObject({ status: "dibatalkan", refunded_amount: 1500 });
      expect(await balanceOf(o.user)).toBe(o.startBalance);
      expect((await refundEntries(o.user)).map((l) => l.amount).sort((a, b) => a - b)).toEqual([400, 1100]);
      await expectLedgerSum(o.user);
      return "total refunded 1500 (400 manual + 1100 auto)";
    });
    await scenario("Manual full refund, then Canceled sync", "no extra refund", async () => {
      const o = await makeOrder({ charge: 1500, quantity: 1000 });
      await m.refunds.createManualRefund({ orderId: String(o.id), amount: 1500, note: "Refund manual penuh oleh admin", source: "admin", adminId: admin, settleNow: true });
      setProvider(o.providerOrderId, "Canceled", 1000);
      await syncNow(o.id);
      expect(await balanceOf(o.user)).toBe(o.startBalance);
      expect((await refundEntries(o.user)).map((l) => l.amount)).toEqual([1500]);
      await expectLedgerSum(o.user);
      return "balance == start, 1 refund entry";
    });
  }, 120_000);

  it("user cancel: refused before 72h (Indonesian message); after 72h the policy refund is paid once and the order closes", async () => {
    await scenario("User cancel before 72h", "rejected: \"Pembatalan belum bisa diajukan.\"", async () => {
      const o = await makeOrder({ charge: 1500, quantity: 1000, ageHours: 10 });
      await expect(m.requests.requestCancel(o.user, String(o.id))).rejects.toThrow("Pembatalan belum bisa diajukan.");
      expect(await refundRows(o.id)).toHaveLength(0);
      expect(await balanceOf(o.user)).toBe(o.startBalance - 1500);
      await expectLedgerSum(o.user);
      return "Pembatalan belum bisa diajukan.";
    });
    await scenario("User cancel after 72h (nothing delivered)", "refund floor(1500 * 0.5) = 750, once, order dibatalkan", async () => {
      const o = await makeOrder({ charge: 1500, quantity: 1000, ageHours: 80 });
      const req = await m.requests.requestCancel(o.user, String(o.id));
      expect(req.calculatedRefund).toBe(750);
      const refund = (await refundRows(o.id))[0];
      expect(refund).toMatchObject({ reason: "user_cancel", status: "menunggu" });
      expect(await balanceOf(o.user)).toBe(o.startBalance - 1500); // nothing moves until the admin decides
      expect(await m.refunds.approveRefund(refund.id, admin)).toMatchObject({ status: "selesai", duplicate: false });
      expect((await m.refunds.approveRefund(refund.id, admin)).duplicate).toBe(true);
      expect(await balanceOf(o.user)).toBe(o.startBalance - 1500 + 750);
      expect(await orderRow(o.id)).toMatchObject({ status: "dibatalkan", cancelled_by: "user", refunded_amount: 750 });
      expect((await refundEntries(o.user)).map((l) => l.amount)).toEqual([750]);
      await expect(m.requests.requestCancel(o.user, String(o.id))).rejects.toThrow(/sudah selesai/); // closed: cannot be cancelled again
      // the provider later confirming the cancel must not add the automatic 100% refund on top of the policy refund
      setProvider(o.providerOrderId, "Canceled", 1000);
      await syncNow(o.id);
      expect(await balanceOf(o.user)).toBe(o.startBalance - 1500 + 750);
      expect((await refundEntries(o.user)).map((l) => l.amount)).toEqual([750]);
      await expectLedgerSum(o.user);
      return "refund 750 once, dibatalkan, closed";
    });
    await scenario("User cancel after 72h with 600/1000 still undelivered", "refund floor(1500*600*50/(1000*100)) = 450", async () => {
      const o = await makeOrder({ charge: 1500, quantity: 1000, ageHours: 80 });
      await m.db.from("orders").update({ remains: 600 }).eq("id", o.id);
      expect((await m.requests.requestCancel(o.user, String(o.id))).calculatedRefund).toBe(450);
      await m.refunds.approveRefund((await refundRows(o.id))[0].id, admin);
      expect(await balanceOf(o.user)).toBe(o.startBalance - 1500 + 450);
      await expectLedgerSum(o.user);
      return "refund 450";
    });
  }, 120_000);

  it("edge cases: remains 0, remains = quantity, remains > quantity, quantity 0, very large charge, indivisible charge", async () => {
    await scenario("Partial with remains = 0", "no refund, no ledger entry, status sebagian", async () => {
      const o = await makeOrder({ charge: 1500, quantity: 1000 });
      setProvider(o.providerOrderId, "Partial", 0);
      const res = await syncNow(o.id);
      expect(res).toMatchObject({ after: "sebagian", refunded: false });
      expect(await refundRows(o.id)).toHaveLength(0);
      expect(await refundEntries(o.user)).toHaveLength(0);
      expect(await balanceOf(o.user)).toBe(o.startBalance - 1500);
      await expectLedgerSum(o.user);
      return "sebagian, refunded 0";
    });
    await scenario("Partial with remains = quantity", "full charge refunded (1500), sebagian", async () => {
      const o = await makeOrder({ charge: 1500, quantity: 1000 });
      setProvider(o.providerOrderId, "Partial", 1000);
      await syncNow(o.id);
      expect(await orderRow(o.id)).toMatchObject({ status: "sebagian", refunded_amount: 1500 });
      expect(await balanceOf(o.user)).toBe(o.startBalance);
      await expectLedgerSum(o.user);
      return "refund 1500";
    });
    await scenario("Partial with remains > quantity", "rejected and logged: status unchanged, no refund, sync_error set, audit row", async () => {
      const o = await makeOrder({ charge: 1500, quantity: 1000 });
      setProvider(o.providerOrderId, "Partial", 1001);
      const res = await syncNow(o.id);
      expect(res).toMatchObject({ before: "menunggu", after: "menunggu", changed: false, refunded: false });
      const row = await orderRow(o.id);
      expect(row).toMatchObject({ status: "menunggu", refunded_amount: 0, remains: 1000 });
      expect(row.sync_error).toMatch(/tidak valid/);
      expect(await refundRows(o.id)).toHaveLength(0);
      expect(await balanceOf(o.user)).toBe(o.startBalance - 1500);
      const logs = (await m.db.from("audit_logs").select("id").eq("action", "sync.invalid_remains").eq("target_id", String(o.id))).data ?? [];
      expect(logs.length).toBe(1);
      await syncNow(o.id); // the same bad answer again: still rejected, logged only once
      expect(((await m.db.from("audit_logs").select("id").eq("action", "sync.invalid_remains").eq("target_id", String(o.id))).data ?? []).length).toBe(1);
      // a later sane answer repairs the order
      setProvider(o.providerOrderId, "Partial", 100);
      await syncNow(o.id);
      expect(await orderRow(o.id)).toMatchObject({ status: "sebagian", refunded_amount: 150, sync_error: null });
      await expectLedgerSum(o.user);
      return "rejected + logged once; repaired by the next good answer";
    });
    await scenario("Quantity 0", "impossible: the database refuses the order and place_order refuses the form", async () => {
      const user = await newUser("q0");
      const ins = await m.db.from("orders").insert({ user_id: user, service_id: SVC, provider_id: PROV, link: `https://zt.test/${run}/q0`, quantity: 0, charge: 100 });
      expect(ins.error?.message).toMatch(/orders_quantity_check|check constraint/i);
      await m.db.rpc("apply_ledger_entry", { p_user: user, p_type: "deposit", p_amount: 50_000, p_ref_type: "zt", p_ref_id: `${run}:${user}:q0`, p_note: "seed", p_by: "t" });
      const placed = await m.db.rpc("place_order", { p_user: user, p_service: SVC, p_link: `https://zt.test/${run}/q0b`, p_quantity: 0 });
      expect(placed.error).not.toBeNull();
      expect(await balanceOf(user)).toBe(50_000);
      await expectLedgerSum(user);
      return "refused (check constraint / place_order error)";
    });
    await scenario("Very large charge (Rp 5.000.000.000, 333.333 of 1.000.000 remain)", "floor(5e9 * 333333 / 1e6) = 1.666.665.000, no overflow", async () => {
      const o = await makeOrder({ charge: 5_000_000_000, quantity: 1_000_000 });
      setProvider(o.providerOrderId, "Partial", 333_333);
      await syncNow(o.id);
      const want = Math.floor((5_000_000_000 * 333_333) / 1_000_000);
      expect(want).toBe(1_666_665_000);
      expect((await refundEntries(o.user)).map((l) => l.amount)).toEqual([want]);
      expect(await balanceOf(o.user)).toBe(o.startBalance - 5_000_000_000 + want);
      await expectLedgerSum(o.user);
      return `refund ${want}`;
    });
    await scenario("Very large charge, full cancel", "full 5.000.000.000 refunded", async () => {
      const o = await makeOrder({ charge: 5_000_000_000, quantity: 1_000_000 });
      setProvider(o.providerOrderId, "Canceled", 1_000_000);
      await syncNow(o.id);
      expect(await balanceOf(o.user)).toBe(o.startBalance);
      await expectLedgerSum(o.user);
      return "balance == start";
    });
  }, 180_000);

  it("a refund can never exceed the charge, and an unknown provider answer leaves the order alone", async () => {
    await scenario("Manual refund above charge / Unknown status", "refused; order unchanged + sync_error", async () => {
      const o = await makeOrder({ charge: 1500, quantity: 1000 });
      await expect(m.refunds.createManualRefund({ orderId: String(o.id), amount: 1501, note: "Terlalu besar untuk uji", source: "admin", adminId: admin, settleNow: true })).rejects.toThrow(/melebihi/);
      setProvider(o.providerOrderId, "Quantum Pending", 1000);
      const res = await syncNow(o.id);
      expect(res).toMatchObject({ after: "menunggu", refunded: false });
      expect((await orderRow(o.id)).sync_error).toMatch(/tidak dikenal/);
      expect(await balanceOf(o.user)).toBe(o.startBalance - 1500);
      await expectLedgerSum(o.user);
      return "refused / unchanged";
    });
  }, 60_000);

  it("cancel without refund (violation): no ledger entry, generic notification, audit, and the sync never refunds it afterwards", async () => {
    await scenario("Violation cancel, then provider reports Canceled", "balance stays start - charge; 0 refund rows; sync x2 and auto refund create nothing", async () => {
      const o = await makeOrder({ charge: 1500, quantity: 1000 });
      const ledgerBefore = (await ledgerOf(o.user)).length;
      const res = await m.db.rpc("admin_cancel_order_violation", { p_order: o.id, p_admin: admin, p_reason: "Pelanggaran kebijakan konten", p_note: "link kampanye" });
      expect(res.error).toBeNull();
      expect(await orderRow(o.id)).toMatchObject({ status: "dibatalkan", cancelled_by: "admin", refunded_amount: 0 });
      expect((await m.db.from("orders").select("violation_reason").eq("id", o.id).single()).data!.violation_reason).toBe("Pelanggaran kebijakan konten");
      expect((await ledgerOf(o.user)).length).toBe(ledgerBefore); // NO ledger entry
      expect(await balanceOf(o.user)).toBe(o.startBalance - 1500);
      const n = (await m.db.from("notifications").select("type,title,body").eq("user_id", o.user)).data ?? [];
      expect(n.some((x) => x.type === "pesanan" && x.body === "Pesananmu dibatalkan karena melanggar ketentuan layanan.")).toBe(true);
      const audit = (await m.db.from("audit_logs").select("admin_id,after").eq("action", "order.cancel_violation").eq("target_id", String(o.id))).data ?? [];
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ admin_id: admin, after: { reason: "Pelanggaran kebijakan konten", note: "link kampanye", refund: 0 } });
      // the provider keeps going / later reports Canceled: the sync must not refund
      setProvider(o.providerOrderId, "Canceled", 1000);
      expect((await syncNow(o.id)).refunded).toBe(false);
      expect((await syncNow(o.id)).refunded).toBe(false);
      setProvider(o.providerOrderId, "Partial", 400);
      expect((await syncNow(o.id)).refunded).toBe(false);
      expect((await m.refunds.autoRefundForOrder(String(o.id))).created).toBe(false);
      const direct = await m.db.rpc("create_refund_for_order", { p_order: o.id, p_reason: "dibatalkan" });
      expect(direct.data?.[0]?.created).toBe(false);
      expect(await refundRows(o.id)).toHaveLength(0);
      expect(await refundEntries(o.user)).toHaveLength(0);
      expect(await orderRow(o.id)).toMatchObject({ status: "dibatalkan", cancelled_by: "admin", refunded_amount: 0 });
      expect(await balanceOf(o.user)).toBe(o.startBalance - 1500);
      await expectLedgerSum(o.user);
      // a finished order cannot be violation-cancelled again, and a non-admin cannot do it
      const again = await m.db.rpc("admin_cancel_order_violation", { p_order: o.id, p_admin: admin, p_reason: "Penipuan" });
      expect(again.error?.message).toMatch(/sudah selesai atau dibatalkan/);
      const o2 = await makeOrder({ charge: 1000, quantity: 100 });
      const denied = await m.db.rpc("admin_cancel_order_violation", { p_order: o2.id, p_admin: o2.user, p_reason: "Penipuan" });
      expect(denied.error).not.toBeNull();
      expect((await orderRow(o2.id)).status).toBe("menunggu");
      return "balance 1000 left, 0 refunds, sync x3 + auto refund: nothing";
    });
  }, 120_000);

  it("admin_dashboard: failedCount is the REAL number of failed orders (the list is capped at 20), syncErrors counts active orders with a sync problem", async () => {
    await scenario("Dashboard RPC counts", "failedCount grows by 25 although the list stays at 20; syncErrors grows by 1", async () => {
      const dash = async () => (await m.db.rpc("admin_dashboard")).data as unknown as { failedCount: number; syncErrors: number; failedOrders: unknown[] };
      const before = await dash();
      const o = await makeOrder({ charge: 1000, quantity: 100 });
      await m.db.from("orders").update({ sync_error: "Status provider tidak dikenal: \"x\"" }).eq("id", o.id);
      const rows = Array.from({ length: 25 }, (_, i) => ({ user_id: o.user, service_id: SVC, provider_id: PROV, link: `https://zt.test/${run}/failed-${i}`, quantity: 100, charge: 0, remains: 100, status: "gagal_kirim", needs_manual_check: true }));
      expect((await m.db.from("orders").insert(rows)).error).toBeNull();
      const after = await dash();
      expect(after.failedCount - before.failedCount).toBe(25);
      expect(after.failedOrders.length).toBeLessThanOrEqual(20);
      expect(after.syncErrors - before.syncErrors).toBe(1);
      return `failedCount +${after.failedCount - before.failedCount}, list ${after.failedOrders.length}, syncErrors +${after.syncErrors - before.syncErrors}`;
    });
  }, 120_000);

  it("end of run: every user balance equals SUM(ledger) and /api/cron/sanity reports 0 mismatches", async () => {
    await scenario("Sanity check", "balanceMismatches = 0 and refundMismatches = 0", async () => {
      for (const u of users) await expectLedgerSum(u);
      const secret = (process.env.CRON_SECRET ||= `zt-cron-${run}`);
      const { GET } = await import("@/app/api/cron/sanity/route");
      const res = await GET(new Request("http://localhost/api/cron/sanity", { headers: { authorization: `Bearer ${secret}` } }));
      const body = await res.json();
      expect(res.status).toBe(200);
      const result = body.result ?? body;
      expect(result.balanceMismatches).toBe(0);
      expect(result.refundMismatches).toBe(0);
      return `balanceMismatches ${result.balanceMismatches}, refundMismatches ${result.refundMismatches}`;
    });
  }, 90_000);
});
