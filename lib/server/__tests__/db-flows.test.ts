/**
 * End-to-end flows of the REAL server code (catalogue, place order, provider submit, sync, refunds, user cancel, webhook)
 * against the linked DEV Supabase project, with the mock provider. Run with: npm run test:db
 * Temp users (@jagoansosmed-test.invalid) and ZT- fixtures are removed afterwards by scripts/db-cleanup-test-data.sql.
 */
import { spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

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
const fileEnv = loadEnv();
for (const [k, v] of Object.entries(fileEnv)) if (process.env[k] === undefined) process.env[k] = v;
const enabled = process.env.RUN_DB_TESTS === "1" && Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY));

describe.skipIf(!enabled)("server flows on Supabase (mock provider)", () => {
  const run = Math.random().toString(36).slice(2, 7);
  // Loaded lazily so the env above is in place before the modules read it.
  let m: {
    db: ReturnType<typeof import("@/lib/server/supabase-admin").supabaseAdmin>;
    services: typeof import("@/lib/server/services");
    orders: typeof import("@/lib/server/orders");
    sync: typeof import("@/lib/server/sync");
    refunds: typeof import("@/lib/server/refunds");
    requests: typeof import("@/lib/server/requests");
    deposits: typeof import("@/lib/server/deposits");
    client: typeof import("@/lib/server/providers/client");
    config: typeof import("@/lib/server/providers/config");
  };
  let user = "";
  let admin = "";
  const SVC = `ZT-${run}`.toUpperCase();

  async function newUser(label: string, role?: "admin"): Promise<string> {
    const username = `zt_${label}_${run}`.slice(0, 24);
    const { data, error } = await m.db.auth.admin.createUser({ email: `${username}@jagoansosmed-test.invalid`, password: `Tmp-${run}-pass1`, email_confirm: true, user_metadata: { username } });
    if (error || !data.user) throw new Error(error?.message);
    if (role) await m.db.from("profiles").update({ role }).eq("id", data.user.id);
    return data.user.id;
  }
  const balance = async (id: string) => Number((await m.db.from("profiles").select("balance").eq("id", id).single()).data!.balance);
  const credit = (id: string, amount: number, ref: string) => m.db.rpc("apply_ledger_entry", { p_user: id, p_type: "deposit", p_amount: amount, p_ref_type: "zt", p_ref_id: `${run}:${id}:${ref}`, p_note: "t", p_by: "t" });

  beforeAll(async () => {
    const ref = process.env.SUPABASE_DEV_PROJECT_REF;
    if (!ref || !process.env.NEXT_PUBLIC_SUPABASE_URL!.includes(ref)) throw new Error("Refusing to run: SUPABASE_DEV_PROJECT_REF does not match NEXT_PUBLIC_SUPABASE_URL.");
    process.env.PROVIDER_MODE = "mock";
    m = {
      db: (await import("@/lib/server/supabase-admin")).supabaseAdmin(),
      services: await import("@/lib/server/services"),
      orders: await import("@/lib/server/orders"),
      sync: await import("@/lib/server/sync"),
      refunds: await import("@/lib/server/refunds"),
      requests: await import("@/lib/server/requests"),
      deposits: await import("@/lib/server/deposits"),
      client: await import("@/lib/server/providers/client"),
      config: await import("@/lib/server/providers/config"),
    };
    const prov = await m.db.from("providers").select("id,active").eq("id", m.config.LIKEO_ID).maybeSingle();
    if (!prov.data) throw new Error("Run `npm run bootstrap` first (Likeo provider row is missing).");
    await m.db.from("providers").update({ active: true }).eq("id", m.config.LIKEO_ID);
    await m.db.from("service_categories").insert({ id: `zt-cat-${run}`, label: `ZT Kategori ${run}`, platform: "instagram" });
    const svc = await m.db.from("services").insert({
      id: SVC, provider_id: m.config.LIKEO_ID, provider_service_id: "1001", category_id: `zt-cat-${run}`, name: `ZT Followers ${run}`, platform: "instagram",
      provider_price: 1000, price_per_1000: 1500, min: 100, max: 100000, cancel: true, refill: true, refill_days: 30, active: true, imported: true,
    });
    expect(svc.error).toBeNull();
    user = await newUser("u");
    admin = await newUser("adm", "admin");
    await credit(user, 50_000, "seed");
  }, 90_000);

  afterAll(() => {
    const r = spawnSync("npx", ["supabase", "db", "query", "--remote", "--file", "scripts/db-cleanup-test-data.sql", "--yes"], { encoding: "utf8", shell: process.platform === "win32" });
    if (r.status !== 0) console.error("CLEANUP FAILED:", `${r.stdout}${r.stderr}`.slice(-1500));
  }, 120_000);

  it("the catalogue shows the service with public fields only, with search, category counts and favorites filter", async () => {
    const page = await m.services.getServices({ search: `zt followers ${run}` });
    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({ id: SVC, price: 1500, min: 100, max: 100000, refillDays: 30 });
    expect(Object.keys(page.items[0]).sort()).toEqual(["categoryId", "id", "max", "min", "name", "price", "refillDays"]);
    expect((await m.services.listCategories({ search: `zt followers ${run}` })).map((c) => c.id)).toEqual([`zt-cat-${run}`]);
    expect((await m.services.getServices({ favoritesOnly: true, favoriteIds: [] })).total).toBe(0);
    expect((await m.services.getServices({ favoritesOnly: true, favoriteIds: [SVC] })).items.map((s) => s.id)).toEqual([SVC]);
    expect((await m.services.getServicesByIds([SVC, "NOPE"])).map((s) => s.id)).toEqual([SVC]);
    expect((await m.services.getServiceDetail(SVC))?.guarantee).toBe("Garansi refill");
    // switched off -> gone for users
    await m.db.from("services").update({ active: false }).eq("id", SVC);
    expect((await m.services.getServices({ search: `zt followers ${run}` })).total).toBe(0);
    await m.db.from("services").update({ active: true }).eq("id", SVC);
  }, 60_000);

  let orderId = "";
  it("place order: debits once, submits to the (mock) provider, stores the provider order id", async () => {
    const order = await m.orders.placeOrder({ userId: user, serviceId: SVC, link: "https://zt.test/flow", quantity: 1000 }, { client: m.client.createProviderClient() });
    orderId = order.id;
    expect(order).toMatchObject({ status: "menunggu", charge: 1500, quantity: 1000 });
    expect(order.providerOrderId).toMatch(/^MK-/);
    expect(await balance(user)).toBe(48_500);
    await expect(m.orders.placeOrder({ userId: user, serviceId: SVC, link: "https://ZT.test/flow/", quantity: 1000 }, { client: m.client.createProviderClient() })).rejects.toThrow(/masih berjalan/);
    expect(await balance(user)).toBe(48_500);
  }, 60_000);

  it("sync: a partial status refunds floor(charge * remains / quantity) once, and a second sync changes nothing", async () => {
    const o = (await m.db.from("orders").select("provider_order_id").eq("id", Number(orderId)).single()).data!;
    m.client.mockWorld().providerOrders[o.provider_order_id] = { status: "Partial", startCount: 10, remains: 250 };
    const first = await m.sync.syncOrders(m.client.createProviderClient());
    expect(first.refundsCreated).toBe(1);
    const after = (await m.db.from("orders").select("status,refunded_amount,remains").eq("id", Number(orderId)).single()).data!;
    expect(after).toMatchObject({ status: "sebagian", refunded_amount: 375, remains: 250 });
    expect(await balance(user)).toBe(48_875);
    const second = await m.sync.syncOrders(m.client.createProviderClient());
    expect(second.refundsCreated).toBe(0);
    expect(await balance(user)).toBe(48_875);
    // direct replay of the refund is a no-op too
    expect((await m.refunds.autoRefundForOrder(orderId)).created).toBe(false);
  }, 90_000);

  it("user cancel: only after the minimum age, waits for the admin, approval refunds 50% of the undelivered part and cancels the order", async () => {
    const placed = await m.orders.placeOrder({ userId: user, serviceId: SVC, link: "https://zt.test/cancel", quantity: 1000 }, { client: m.client.createProviderClient() });
    await expect(m.requests.requestCancel(user, placed.id)).rejects.toThrow(/belum bisa diajukan/);
    await m.db.from("orders").update({ created_at: new Date(Date.now() - 80 * 3_600_000).toISOString(), remains: 600 }).eq("id", Number(placed.id));
    const req = await m.requests.requestCancel(user, placed.id);
    expect(req.calculatedRefund).toBe(450); // charge 1500, remains 600/1000, 50% => floor(1500*600*50/(1000*100)) = 450
    await expect(m.requests.requestCancel(user, placed.id)).rejects.toThrow(/masih diproses/);
    const refund = (await m.db.from("refunds").select("id,status").eq("order_id", Number(placed.id)).single()).data!;
    expect(refund.status).toBe("menunggu");
    const before = await balance(user);
    const res = await m.refunds.approveRefund(refund.id, admin);
    expect(res).toMatchObject({ status: "selesai", duplicate: false });
    expect(await balance(user)).toBe(before + 450);
    expect((await m.db.from("orders").select("status,cancelled_by").eq("id", Number(placed.id)).single()).data).toMatchObject({ status: "dibatalkan", cancelled_by: "user" });
    expect((await m.refunds.approveRefund(refund.id, admin)).duplicate).toBe(true);
    expect(await balance(user)).toBe(before + 450);
  }, 90_000);

  it("a provider that fails every attempt: gagal_kirim with an automatic full refund", async () => {
    const before = await balance(user);
    const failing = { ...m.client.createProviderClient(), addOrder: async () => { throw new Error("boom"); } };
    const order = await m.orders.placeOrder({ userId: user, serviceId: SVC, link: "https://zt.test/fail", quantity: 1000 }, { client: failing, sleep: async () => {} });
    expect(order.status).toBe("gagal_kirim");
    expect(order.submitAttempts).toBe(3);
    expect(order.refundedAmount).toBe(1500);
    expect(await balance(user)).toBe(before);
  }, 90_000);

  it("payment webhook: bad signature rejected, valid one credits (with bonus tiers if configured), a replay credits nothing", async () => {
    const secret = `zt-secret-${run}`;
    const dep = await m.deposits.createDepositRequest({ userId: user, amount: 20_000, methodId: "manual" });
    const body = JSON.stringify({ transactionId: `zt-tx-${run}`, reference: dep.id, amount: 20_000, status: "paid" });
    const sig = createHmac("sha256", secret).update(body).digest("hex");
    expect((await m.deposits.handlePaymentWebhook(body, "bad", secret)).status).toBe(401);
    const before = await balance(user);
    const first = await m.deposits.handlePaymentWebhook(body, sig, secret);
    expect(first).toMatchObject({ status: 200, body: { ok: true, message: "Saldo ditambahkan." } });
    const afterFirst = await balance(user);
    expect(afterFirst).toBeGreaterThanOrEqual(before + 20_000);
    const replay = await m.deposits.handlePaymentWebhook(body, sig, secret);
    expect(replay.body.message).toBe("Duplikat diabaikan.");
    expect(await balance(user)).toBe(afterFirst);
    // a webhook for another amount is refused
    const other = await m.deposits.createDepositRequest({ userId: user, amount: 20_000, methodId: "manual" });
    const wrong = JSON.stringify({ transactionId: `zt-tx2-${run}`, reference: other.id, amount: 99, status: "paid" });
    expect((await m.deposits.handlePaymentWebhook(wrong, createHmac("sha256", secret).update(wrong).digest("hex"), secret)).status).toBe(422);
  }, 90_000);

  it("ledger equals balance for every temp user", async () => {
    for (const id of [user, admin]) {
      const sum = ((await m.db.from("balance_ledger").select("amount").eq("user_id", id)).data ?? []).reduce((n, r) => n + Number(r.amount), 0);
      expect(await balance(id)).toBe(sum);
    }
  });

  it("performance: 5,000 services stay fast (page, search, category counts)", async () => {
    const rows = Array.from({ length: 5000 }, (_, i) => ({
      id: `ZT-P${run.toUpperCase()}${i}`, provider_id: m.config.LIKEO_ID, provider_service_id: `p${run}${i}`, category_id: `zt-cat-${run}`, name: `Perf Service ${i} ${i % 7 === 0 ? "Instagram Likes" : "TikTok Views"}`,
      platform: "instagram", provider_price: 500 + (i % 90), price_per_1000: 700 + (i % 90), min: 10, max: 100000, active: true, imported: true,
    }));
    for (let i = 0; i < rows.length; i += 500) expect((await m.db.from("services").insert(rows.slice(i, i + 500))).error).toBeNull();
    const time = async <T>(fn: () => Promise<T>) => { const t = performance.now(); const r = await fn(); return [r, Math.round(performance.now() - t)] as const; };
    await m.services.getServices({}); // warm up the connection
    const [page, tPage] = await time(() => m.services.getServices({ category: `zt-cat-${run}`, limit: 20 }));
    const [search, tSearch] = await time(() => m.services.getServices({ search: "instagram likes 70" }));
    const [cats, tCats] = await time(() => m.services.listCategories({}));
    const [sorted, tSort] = await time(() => m.services.getServices({ sort: "termurah", limit: 20 }));
    console.info(`[perf] 5000 services: page=${tPage}ms search=${tSearch}ms categories=${tCats}ms sort=${tSort}ms (round trip to ap-northeast-2)`);
    expect(page.items).toHaveLength(20);
    expect(page.total).toBeGreaterThanOrEqual(5000);
    expect(search.total).toBeGreaterThan(0);
    expect(cats.some((c) => c.id === `zt-cat-${run}` && c.count >= 5000)).toBe(true);
    expect(sorted.items[0].price).toBeLessThanOrEqual(sorted.items[19].price);
    for (const t of [tPage, tSearch, tCats, tSort]) expect(t).toBeLessThan(2500);
  }, 180_000);
});
