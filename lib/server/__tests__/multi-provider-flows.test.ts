/**
 * Two providers at once on the REAL server code against the linked DEV Supabase project, with the mock provider (never the real smmsoc):
 * orders go to their service's provider, one provider failing does not block the other, a switched-off provider hides its services but its open
 * orders are still followed, refunds stay per order and idempotent, and service ids never collide across providers.
 * Run with: npm run test:db multi-provider
 * Fixtures carry ZT- / zt- names, so scripts/db-cleanup-test-data.sql removes leftovers of a killed run.
 */
import { existsSync, readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanupOrFail } from "../../../scripts/lib/test-cleanup.mjs";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(".env.local")) return out;
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0 && !line.startsWith("#")) out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}
for (const [k, v] of Object.entries(loadEnv())) if (process.env[k] === undefined) process.env[k] = v;
const enabled = process.env.RUN_DB_TESTS === "1" && Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY));

describe.skipIf(!enabled)("two providers on Supabase (mock provider)", () => {
  const MARKER = "mp";
  const run = MARKER + Math.random().toString(36).slice(2, 7);
  let P1 = "";
  let P2 = "";
  const S1 = `ZT-${run}-A`.toUpperCase();
  const S2 = `ZT-${run}-B`.toUpperCase();
  const PS1 = `zt${run}a`;
  const PS2 = `zt${run}b`;
  let m: {
    db: ReturnType<typeof import("@/lib/server/supabase-admin").supabaseAdmin>;
    orders: typeof import("@/lib/server/orders");
    sync: typeof import("@/lib/server/sync");
    services: typeof import("@/lib/server/services");
    repoServices: typeof import("@/lib/server/repo/services-repo");
    balance: typeof import("@/lib/server/providers/balance");
    client: typeof import("@/lib/server/providers/client");
  };
  let user = "";
  const created: string[] = [];
  const balance = async (id: string) => Number((await m.db.from("profiles").select("balance").eq("id", id).single()).data!.balance);
  const orderRow = async (id: string) => (await m.db.from("orders").select("provider_id,provider_order_id,status,refunded_amount,sync_error").eq("id", Number(id)).single()).data!;

  beforeAll(async () => {
    const ref = process.env.SUPABASE_DEV_PROJECT_REF;
    if (!ref || new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname !== `${ref}.supabase.co`) throw new Error("Refusing to run: SUPABASE_DEV_PROJECT_REF does not match NEXT_PUBLIC_SUPABASE_URL.");
    process.env.PROVIDER_MODE = "mock";
    m = {
      db: (await import("@/lib/server/supabase-admin")).supabaseAdmin(),
      orders: await import("@/lib/server/orders"),
      sync: await import("@/lib/server/sync"),
      services: await import("@/lib/server/services"),
      repoServices: await import("@/lib/server/repo/services-repo"),
      balance: await import("@/lib/server/providers/balance"),
      client: await import("@/lib/server/providers/client"),
    };
    await cleanupOrFail({ marker: MARKER });
    const mk = async (suffix: string, currency: string, rate: number) => {
      const r = await m.db.from("providers").insert({ name: `ZT ${run} ${suffix}`, slug: `zt-${run}-${suffix}`, mode: "mock", active: true, currency, exchange_rate: rate }).select("id").single();
      expect(r.error).toBeNull();
      return r.data!.id as string;
    };
    P1 = await mk("one", "USD", 16_000);
    P2 = await mk("two", "USD", 15_000);
    await m.db.from("service_categories").insert({ id: `zt-cat-${run}`, label: `ZT Kategori ${run}`, platform: "instagram" });
    for (const [id, provider, psid] of [[S1, P1, PS1], [S2, P2, PS2]] as const) {
      const svc = await m.db.from("services").insert({
        id, provider_id: provider, provider_service_id: psid, category_id: `zt-cat-${run}`, name: `ZT ${id}`, platform: "instagram",
        provider_price: 1000, price_per_1000: 1500, min: 100, max: 100000, cancel: true, refill: true, refill_days: 30, active: true, imported: true,
      });
      expect(svc.error).toBeNull();
      m.client.mockWorld().services.push({ providerId: "5c1e0a00-0000-4000-8000-00000000e001", providerServiceId: psid } as never); // the mock provider accepts these ids
    }
    const username = `zt_mp_${run}`.slice(0, 24);
    const { data, error } = await m.db.auth.admin.createUser({ email: `${username}@jagoansosmed-test.invalid`, password: `Tmp-${run}-pass1`, email_confirm: true, user_metadata: { username } });
    if (error || !data.user) throw new Error(error?.message);
    user = data.user.id;
    created.push(user);
    await m.db.rpc("apply_ledger_entry", { p_user: user, p_type: "deposit", p_amount: 100_000, p_ref_type: "zt", p_ref_id: `${run}:seed`, p_note: "t", p_by: "t" });
  }, 240_000);

  afterAll(async () => {
    await cleanupOrFail({ marker: MARKER });
  }, 300_000);

  let o1 = "";
  let o2 = "";
  it("routes each order to the provider of its service, and the mock gives each provider its own order ids", async () => {
    const a = await m.orders.placeOrder({ userId: user, serviceId: S1, link: "https://zt.test/one", quantity: 1000 }, { client: m.client.createProviderClient() });
    const b = await m.orders.placeOrder({ userId: user, serviceId: S2, link: "https://zt.test/two", quantity: 1000 }, { client: m.client.createProviderClient() });
    o1 = a.id;
    o2 = b.id;
    expect((await orderRow(o1)).provider_id).toBe(P1);
    expect((await orderRow(o2)).provider_id).toBe(P2);
    expect(a.providerOrderId).toMatch(/^MK-/);
    expect(b.providerOrderId).toMatch(/^MK-/);
    expect(a.providerOrderId).not.toBe(b.providerOrderId);
    expect(await balance(user)).toBe(100_000 - 1500 * 2);
  }, 90_000);

  it("sync: one provider failing does not block the other, and the failure is recorded for that provider only", async () => {
    const real = m.client.createProviderClient();
    m.client.mockWorld().providerOrders[(await orderRow(o1)).provider_order_id] = { status: "Completed", startCount: 0, remains: 0 };
    const flaky = { ...real, getOrdersStatus: async (pid: string, ids: string[]) => { if (pid === P2) throw new Error("smmsoc sedang down"); return real.getOrdersStatus!(pid, ids); } };
    await m.sync.syncOrders(flaky);
    expect((await orderRow(o1)).status).toBe("selesai");
    const two = await orderRow(o2);
    expect(two.status).not.toBe("selesai");
    expect(two.sync_error).toContain("smmsoc sedang down");
    const runs = (await m.db.from("provider_sync_runs").select("provider_id,errors").in("provider_id", [P1, P2]).order("started_at", { ascending: false })).data!;
    expect(runs.find((r) => r.provider_id === P1)?.errors).toBe(0);
    expect(runs.find((r) => r.provider_id === P2)?.errors).toBeGreaterThan(0);
  }, 90_000);

  it("a switched-off provider: its services disappear for users, its open order is still followed, a partial refunds once", async () => {
    await m.db.from("providers").update({ active: false }).eq("id", P2);
    const visible = await m.services.getServices({ search: `zt ${run}` });
    expect(visible.items.map((s) => s.id)).toContain(S1);
    expect(visible.items.map((s) => s.id)).not.toContain(S2);
    expect((await m.db.from("services").select("id").eq("id", S2)).data).toHaveLength(1); // not deleted

    const pid = (await orderRow(o2)).provider_order_id;
    m.client.mockWorld().providerOrders[pid] = { status: "Partial", startCount: 10, remains: 250 };
    const before = await balance(user);
    const first = await m.sync.syncOrders(m.client.createProviderClient());
    expect(first.refundsCreated).toBeGreaterThanOrEqual(1);
    expect(await orderRow(o2)).toMatchObject({ status: "sebagian", refunded_amount: 375 });
    expect(await balance(user)).toBe(before + 375);
    await m.sync.syncOrders(m.client.createProviderClient()); // idempotent: nothing moves twice
    expect(await balance(user)).toBe(before + 375);
    const ledger = (await m.db.from("balance_ledger").select("id").eq("user_id", user).eq("type", "refund")).data ?? [];
    expect(ledger).toHaveLength(1);
  }, 120_000);

  it("balance checks are per provider: one entry each, converted with that provider's own rate", async () => {
    await m.db.from("providers").update({ active: true }).eq("id", P2);
    const one = await m.balance.checkProvider(P1, { force: true });
    const two = await m.balance.checkProvider(P2, { force: true });
    expect(one.ok && two.ok).toBe(true);
    const rows = (await m.db.from("providers").select("id,balance_native,balance_idr,exchange_rate").in("id", [P1, P2])).data!;
    const row = (id: string) => rows.find((r) => r.id === id)!;
    expect(Number(row(P1).balance_native)).toBe(31.25); // the mock's second-provider balance
    expect(Number(row(P2).balance_native)).toBe(31.25);
    expect(Number(row(P1).balance_idr)).toBe(Math.round(31.25 * 16_000));
    expect(Number(row(P2).balance_idr)).toBe(Math.round(31.25 * 15_000));
    const all = await m.balance.checkAllProviders({ force: true });
    expect(Object.keys(all)).toEqual(expect.arrayContaining([P1, P2]));
  }, 90_000);

  it("service ids are one global sequence: the highest id of ANY provider is known before a sync of another", async () => {
    const id = "4000000099";
    try {
      const ins = await m.db.from("services").insert({
        id, provider_id: P1, provider_service_id: `zt${run}z`, category_id: `zt-cat-${run}`, name: `ZT numeric ${run}`, platform: "instagram", provider_price: 1, price_per_1000: 2, active: false, imported: true,
      });
      expect(ins.error).toBeNull();
      expect((await m.repoServices.globalServiceMaxima()).maxId).toBeGreaterThanOrEqual(4_000_000_099);
    } finally {
      await m.db.from("services").delete().eq("id", id);
    }
  }, 60_000);
});
