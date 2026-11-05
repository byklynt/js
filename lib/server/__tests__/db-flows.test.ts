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
  const created: string[] = [];
  const SVC = `ZT-${run}`.toUpperCase();

  async function newUser(label: string, role?: "admin"): Promise<string> {
    const username = `zt_${label}_${run}`.slice(0, 24);
    const { data, error } = await m.db.auth.admin.createUser({ email: `${username}@jagoansosmed-test.invalid`, password: `Tmp-${run}-pass1`, email_confirm: true, user_metadata: { username } });
    if (error || !data.user) throw new Error(error?.message);
    if (role) await m.db.from("profiles").update({ role }).eq("id", data.user.id);
    created.push(data.user.id);
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

  afterAll(async () => {
    // Ticket attachments live in Storage, which SQL cleanup cannot reach: remove ONLY the folders of the users this run created.
    const bucket = m.db.storage.from("ticket-attachments");
    for (const id of created) {
      const { data: folders } = await bucket.list(id, { limit: 100 });
      const paths: string[] = [];
      for (const f of folders ?? []) {
        const { data: files } = await bucket.list(`${id}/${f.name}`, { limit: 100 });
        for (const file of files ?? []) paths.push(`${id}/${f.name}/${file.name}`);
      }
      if (paths.length) await bucket.remove(paths);
    }
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

  it("tickets: create with an attachment (private bucket, signed URL), internal note hidden, other users see nothing", async () => {
    const tickets = await import("@/lib/server/tickets");
    const other = await newUser("o");
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    const created = await tickets.createUserTicket(user, { category: "Pesanan", subcategory: "Lainnya", orderIds: [], message: "Halo, ini pesan uji tiket.", files: [{ name: "bukti.png", size: png.length, type: "image/png", data: png }] });
    const mine = await tickets.findOwnTicket(user, created.id);
    expect(mine?.status).toBe("menunggu");
    const att = mine!.messages[0].attachments![0];
    expect(att.name).toBe("bukti.png");
    expect(att.url).toMatch(/\/object\/sign\//); // signed URL, never a public one
    expect((await fetch(att.url)).status).toBe(200);
    expect((await fetch(att.url.split("?")[0])).status).not.toBe(200); // the bucket path alone is not readable
    await tickets.replyAsAdmin(admin, created.id, { message: "Catatan internal rahasia", internal: true });
    await tickets.replyAsAdmin(admin, created.id, { message: "Balasan untuk pengguna." });
    const after = await tickets.findOwnTicket(user, created.id);
    expect(after?.messages.map((x) => x.text)).toEqual(["Halo, ini pesan uji tiket.", "Balasan untuk pengguna."]);
    expect(after?.unread).toBe(true);
    expect(after?.status).toBe("dibalas");
    expect(await tickets.markTicketRead(user, created.id)).toBe(0);
    expect(await tickets.findOwnTicket(other, created.id)).toBeNull(); // someone else's ticket looks nonexistent
    await expect(tickets.replyAsUser(other, created.id, { message: "bobol", files: [] })).rejects.toThrow(/tidak ditemukan/);
    await expect(tickets.createUserTicket(user, { category: "Pesanan", subcategory: "Lainnya", orderIds: [], message: "x", files: [] })).rejects.toThrow(/minimal 10/);
    const bad = await tickets.createUserTicket(user, { category: "Pesanan", subcategory: "Lainnya", orderIds: [], message: "file buruk", files: [{ name: "a.exe", size: 5, type: "application/x-msdownload", data: Buffer.from("12345") }] }).catch((e: Error) => e.message);
    expect(bad).toMatch(/format harus/);
    await tickets.closeOwnTicket(user, created.id);
    await expect(tickets.replyAsUser(user, created.id, { message: "setelah tutup", files: [] })).rejects.toThrow(/sudah ditutup/);
  }, 90_000);

  it("notifications: created by the money functions, own rows only, mark read", async () => {
    const repo = await import("@/lib/server/repo/notifications");
    const other = await newUser("n");
    const page = await repo.listNotifications(user);
    expect(page.items.some((n) => n.type === "deposit")).toBe(true); // credit_deposit notified in the same transaction
    expect(page.unread).toBeGreaterThan(0);
    const first = page.items[0];
    expect(await repo.markRead(other, first.id)).toBe(false); // another user's notification id is "not found"
    expect(await repo.markRead(user, first.id)).toBe(true);
    expect(await repo.markAllRead(user)).toBeGreaterThanOrEqual(0);
    expect(await repo.unreadCount(user)).toBe(0);
    expect((await repo.listNotifications(other)).items).toHaveLength(0);
  }, 60_000);

  it("announcements: audience, schedule and expiry are applied on the server", async () => {
    const repo = await import("@/lib/server/repo/announcements");
    const ids: string[] = [];
    const add = async (row: Record<string, unknown>) => { const { data } = await m.db.from("announcements").insert({ title: `ZT ${run}`, body: "isi", ...row } as never).select("id").single(); ids.push(data!.id); return data!.id as string; };
    const past = new Date(Date.now() - 120_000).toISOString(); // not "now": the DB clock may differ a little from this machine
    const live = await add({ audience: "semua", placements: ["dashboard"], publish_at: past });
    const resellerOnly = await add({ audience: "reseller", placements: ["dashboard"], publish_at: past });
    const future = await add({ audience: "semua", placements: ["dashboard"], publish_at: new Date(Date.now() + 3_600_000).toISOString() });
    const expired = await add({ audience: "semua", placements: ["dashboard"], publish_at: past, expires_at: new Date(Date.now() - 60_000).toISOString() });
    const inactive = await add({ audience: "semua", placements: ["dashboard"], publish_at: past, active: false });
    const forUser = (await repo.getVisibleAnnouncements({ user: { id: user, reseller: false }, placement: "dashboard" })).map((a) => a.id);
    expect(forUser).toContain(live);
    for (const id of [resellerOnly, future, expired, inactive]) expect(forUser).not.toContain(id);
    const forReseller = (await repo.getVisibleAnnouncements({ user: { id: user, reseller: true }, placement: "dashboard" })).map((a) => a.id);
    expect(forReseller).toContain(resellerOnly);
    expect((await repo.getVisibleAnnouncements({ user: { id: user, reseller: false }, placement: "pembaruan" })).map((a) => a.id)).not.toContain(live);
    await m.db.from("announcements").delete().in("id", ids);
  }, 60_000);

  it("favorites and language live in the database", async () => {
    await m.db.from("favorites").upsert({ user_id: user, service_id: SVC }, { onConflict: "user_id,service_id" });
    expect(((await m.db.from("favorites").select("service_id").eq("user_id", user)).data ?? []).map((r) => r.service_id)).toEqual([SVC]);
    await m.db.from("profiles").update({ language: "en" }).eq("id", user);
    expect((await m.db.from("profiles").select("language").eq("id", user).single()).data!.language).toBe("en");
  });

  it("admin lists: keyset pagination (no duplicates, nothing lost), SQL search, aggregates, services paging, soft-failing shell stats", async () => {
    const lists = await import("@/lib/server/admin/lists");
    const dash = await import("@/lib/server/admin/dashboard");
    const stats = await import("@/lib/server/admin/stats");
    const shell = await import("@/lib/server/admin/shell-stats");
    const adminServices = await import("@/lib/server/admin-services");
    // five deposits created within the same second must still page cleanly (ties are broken by id)
    const rows = Array.from({ length: 5 }, (_, i) => ({ user_id: user, method: `ZT-metode-${i}`, amount: 10_000 + i, status: "menunggu" }));
    expect((await m.db.from("deposits").insert(rows)).error).toBeNull();
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 20; i++) {
      const page: { rows: { id: string; method: string }[]; next: string | null } = await lists.listDeposits({ limit: 2, cursor });
      expect(page.rows.length).toBeLessThanOrEqual(2);
      seen.push(...page.rows.map((r) => r.id));
      cursor = page.next;
      if (!cursor) break;
    }
    expect(new Set(seen).size).toBe(seen.length); // no duplicates
    const mine = ((await m.db.from("deposits").select("id").eq("user_id", user)).data ?? []).map((d) => d.id);
    for (const id of mine) expect(seen).toContain(id); // nothing lost
    expect((await lists.listDeposits({ q: "ZT-metode-3" })).rows.map((d) => d.method)).toEqual(["ZT-metode-3"]);
    expect((await lists.listDeposits({ cursor: "tidak-valid" })).rows.length).toBeGreaterThan(0); // a forged cursor is ignored, never injected
    expect((await lists.listOrders({ q: "zt.test/flow" })).rows.length).toBeGreaterThanOrEqual(1);
    expect((await lists.listOrders({ q: "zt.test/flow%,().*" , limit: 1 })).rows).toBeDefined(); // odd characters cannot break the filter
    const username = (await m.db.from("profiles").select("username").eq("id", user).single()).data!.username;
    const users = await lists.listUsers({ q: username });
    expect(users.rows.map((u) => u.id)).toContain(user);
    expect(users.rows.find((u) => u.id === user)!.totalSpent).toBeGreaterThan(0);
    const detail = await lists.loadUserDetail(user);
    expect(detail.orders.length).toBeGreaterThan(0);
    expect(detail.ledger.length).toBeGreaterThan(0);
    expect((await lists.listLedger({ limit: 3 })).rows.length).toBeLessThanOrEqual(3);
    expect(Array.isArray((await lists.listLogs()).rows)).toBe(true);
    expect(Array.isArray((await lists.listRefunds()).rows)).toBe(true);
    expect(Array.isArray((await lists.listRefills()).rows)).toBe(true);
    expect(Array.isArray((await lists.listTicketsPage()).rows)).toBe(true);

    const d = await dash.loadDashboardData();
    expect(d.stats.ordersToday).toBeGreaterThanOrEqual(1);
    expect(d.series.revenue.hari).toHaveLength(12);
    expect(d.series.revenue["7"]).toHaveLength(7);
    expect(d.series.revenue["30"]).toHaveLength(30);
    expect(d.finance.revenue).toBeGreaterThanOrEqual(1500);
    expect(d.pendingDeposits).toBeGreaterThanOrEqual(5);
    expect(d.series.platforms["30"].some((p) => p.platform === "Instagram")).toBe(true);
    expect(d.reconciliation.balanceMismatches).toEqual([]);
    const ds = await stats.loadStatsDataset();
    expect(ds.daily.some((f) => f.serviceId === SVC && f.orders >= 1 && f.revenue >= 1500)).toBe(true);
    expect(ds.signups).toHaveLength(180);
    expect(ds.spenders.some((x) => x.id === user)).toBe(true);

    const svcPage = await adminServices.adminServicesPage({ search: SVC });
    expect(svcPage.items.map((x) => x.id)).toEqual([SVC]);
    expect(svcPage.items[0].categoryLabel).toBe(`ZT Kategori ${run}`);
    const meta = await adminServices.adminServicesMeta();
    expect(meta.categories.some((c) => c.id === `zt-cat-${run}`)).toBe(true);
    const s2 = await adminServices.adminServicesPage({ category: `zt-cat-${run}`, limit: 1 });
    expect(s2.total).toBeGreaterThanOrEqual(1);
    const st = await shell.getShellStats();
    expect(st.ok).toBe(true);
    expect(st.pendingDeposits).toBeGreaterThanOrEqual(5);
  }, 120_000);

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
