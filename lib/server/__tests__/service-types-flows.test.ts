/**
 * Service types ("Custom Comments", unsupported types) against the linked DEV Supabase project (mock provider, never the real Likeo).
 * Run with: npm run test:db  (node scripts/run-db-tests.mjs service-types)
 * Everything this file creates (users @jagoansosmed-test.invalid, ZT- services, providers zt-...) carries the suite marker and is removed in-process.
 */
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanupOrFail } from "../../../scripts/lib/test-cleanup.mjs";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const fileEnv: Record<string, string> = {};
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0 && !line.trim().startsWith("#")) fileEnv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
}
for (const [k, v] of Object.entries(fileEnv)) if (process.env[k] === undefined) process.env[k] = v;
const enabled = process.env.RUN_DB_TESTS === "1" && Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY));

describe.skipIf(!enabled)("service types: Custom Comments (mock provider)", () => {
  const MARKER = "st";
  const run = MARKER + Math.random().toString(36).slice(2, 7);
  let PROV = "";
  let m: {
    db: ReturnType<typeof import("@/lib/server/supabase-admin").supabaseAdmin>;
    orders: typeof import("@/lib/server/orders");
    sync: typeof import("@/lib/server/sync");
    services: typeof import("@/lib/server/services");
    client: typeof import("@/lib/server/providers/client");
    config: typeof import("@/lib/server/providers/config");
  };
  const CC = `ZT-${run}C`.toUpperCase(); // Custom Comments, 2..10 comments, Rp 2.500 per 1000
  const DEF = `ZT-${run}D`.toUpperCase(); // Default
  const PKG = `ZT-${run}P`.toUpperCase(); // Custom Comments Package (unsupported)
  const POLL = `ZT-${run}Q`.toUpperCase(); // Poll (unsupported)
  const password = `Typ-${run}-pass1`;
  let seq = 0;
  let admin = "";

  const newUser = async (label: string, role?: "admin") => {
    const username = `zt_${label}${++seq}_${run}`.slice(0, 24);
    const email = `${username}@jagoansosmed-test.invalid`;
    const { data, error } = await m.db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username } });
    if (error || !data.user) throw new Error(error?.message);
    if (role) await m.db.from("profiles").update({ role }).eq("id", data.user.id);
    const { error: ce } = await m.db.rpc("apply_ledger_entry", { p_user: data.user.id, p_type: "deposit", p_amount: 100_000, p_ref_type: "zt", p_ref_id: `${run}:${data.user.id}`, p_note: "seed", p_by: "t" });
    expect(ce).toBeNull();
    return { id: data.user.id, email };
  };
  const balanceOf = async (id: string) => Number((await m.db.from("profiles").select("balance").eq("id", id).single()).data!.balance);
  const ledgerSum = async (id: string) => ((await m.db.from("balance_ledger").select("amount").eq("user_id", id)).data ?? []).reduce((s, l) => s + Number(l.amount), 0);
  const link = () => `https://zt.test/${run}/${++seq}`;
  const place = (user: string, service: string, comments: string | undefined, quantity?: number) =>
    m.orders.placeOrder({ userId: user, serviceId: service, link: link(), ...(quantity === undefined ? {} : { quantity }), ...(comments === undefined ? {} : { comments }) }, { client: m.client.createProviderClient(), sleep: async () => {} });
  /** place_order straight through the RPC (what a tampered client would reach if it skipped our TypeScript). */
  const rpcPlace = (user: string, service: string, quantity: number | null, comments: string | null) =>
    m.db.rpc("place_order", { p_user: user, p_service: service, p_link: link(), p_quantity: quantity as unknown as number, p_comments: comments ?? undefined });
  const commentsOf = async (orderId: number) => (await m.db.from("order_comments").select("comments,line_count").eq("order_id", orderId).maybeSingle()).data;
  const signedIn = async (email: string) => {
    const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await c.auth.signInWithPassword({ email, password });
    expect(error).toBeNull();
    return c;
  };

  beforeAll(async () => {
    const ref = process.env.SUPABASE_DEV_PROJECT_REF;
    if (!ref || new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname !== `${ref}.supabase.co`) throw new Error("Refusing to run: SUPABASE_DEV_PROJECT_REF does not match NEXT_PUBLIC_SUPABASE_URL.");
    process.env.PROVIDER_MODE = "mock"; // the real Likeo `add` is never called from these tests
    m = {
      db: (await import("@/lib/server/supabase-admin")).supabaseAdmin(),
      orders: await import("@/lib/server/orders"),
      sync: await import("@/lib/server/sync"),
      services: await import("@/lib/server/services"),
      client: await import("@/lib/server/providers/client"),
      config: await import("@/lib/server/providers/config"),
    };
    expect(m.config.providerMode()).toBe("mock");
    await cleanupOrFail({ marker: MARKER });
    const provRow = await m.db.from("providers").insert({ name: `ZT ${run}`, slug: `zt-${run}`, mode: "mock", active: true }).select("id").single();
    expect(provRow.error).toBeNull();
    PROV = provRow.data!.id;
    await m.db.from("service_categories").insert({ id: `zt-cat-${run}`, label: `ZT Kategori ${run}`, platform: "instagram" });
    const defs: [string, string, number, number][] = [[CC, "Custom Comments", 2, 10], [DEF, "Default", 1, 100000], [PKG, "Custom Comments Package", 1, 1], [POLL, "Poll", 10, 1000]];
    for (const [id, type, min, max] of defs) {
      const pid = `zt${run}${id.slice(-1).toLowerCase()}`;
      const r = await m.db.from("services").insert({
        id, provider_id: PROV, provider_service_id: pid, category_id: `zt-cat-${run}`, name: `ZT ${type} ${run}`, platform: "instagram", provider_type: type,
        provider_price: 1000, price_per_1000: 2500, min, max, cancel: true, active: true, imported: true,
      });
      expect(r.error).toBeNull();
      m.client.mockWorld().services.push({ providerId: m.config.LIKEO_ID, providerServiceId: pid } as never); // the mock provider accepts it
    }
    admin = (await newUser("adm", "admin")).id;
  }, 240_000);

  afterAll(async () => {
    await cleanupOrFail({ marker: MARKER });
  }, 300_000);

  it("place_order recomputes the quantity from the comments: blank lines dropped, exact charge, comments stored normalised, mock provider gets the count", async () => {
    const u = await newUser("a");
    const start = await balanceOf(u.id);
    const order = await place(u.id, CC, "  Keren banget  \r\n\r\n   \nMantap\n\tTop\t\n");
    expect(order).toMatchObject({ quantity: 3, charge: 8, status: "menunggu", commentCount: 3 }); // ceil(2500 x 3 / 1000) = ceil(7.5) = 8
    expect(order.providerOrderId).toMatch(/^MK-/);
    expect(m.client.mockWorld().providerOrders[order.providerOrderId]).toMatchObject({ remains: 3 });
    expect(await commentsOf(Number(order.id))).toEqual({ comments: "Keren banget\nMantap\nTop", line_count: 3 });
    expect(await balanceOf(u.id)).toBe(start - 8);
    expect(await ledgerSum(u.id)).toBe(await balanceOf(u.id));
  }, 60_000);

  it("a client-supplied quantity that differs from the number of comments is refused (no order, no charge); a matching one is accepted", async () => {
    const u = await newUser("b");
    const start = await balanceOf(u.id);
    const bad = await rpcPlace(u.id, CC, 5, "a\nb\nc");
    expect(bad.error?.message).toBe("Jumlah tidak sama dengan jumlah komentar.");
    expect(bad.error?.hint).toBe("bad_quantity");
    await expect(place(u.id, CC, "a\nb\nc", 9)).rejects.toThrow(/tidak sama dengan jumlah komentar/);
    expect(await balanceOf(u.id)).toBe(start);
    expect((await m.db.from("orders").select("id").eq("user_id", u.id)).data).toHaveLength(0);
    const ok = await place(u.id, CC, "a\nb\nc", 3);
    expect(ok.quantity).toBe(3);
  }, 60_000);

  it("min / max are checked on the computed quantity; empty, too long, too big and comments on a normal service are refused", async () => {
    const u = await newUser("c");
    await expect(place(u.id, CC, "only one")).rejects.toThrow(/Jumlah harus antara 2 dan 10/);
    await expect(place(u.id, CC, Array.from({ length: 11 }, (_, i) => `c${i}`).join("\n"))).rejects.toThrow(/Jumlah harus antara 2 dan 10/);
    await expect(place(u.id, CC, " \n\n \t\n")).rejects.toThrow(/Isi minimal satu komentar/);
    await expect(place(u.id, CC, `ok\n${"x".repeat(301)}`)).rejects.toThrow(/maksimal 300 karakter/);
    const r = await rpcPlace(u.id, DEF, 100, "sneaky\ncomments");
    expect(r.error?.hint).toBe("bad_input");
    const missing = await rpcPlace(u.id, CC, 3, null);
    expect(missing.error?.hint).toBe("no_comments");
    // a normal service is unchanged
    const normal = await place(u.id, DEF, undefined, 100);
    expect(normal).toMatchObject({ quantity: 100, charge: 250 });
    expect(await commentsOf(Number(normal.id))).toBeNull();
    expect(normal.commentCount).toBeUndefined();
  }, 90_000);

  it("unsupported provider types are refused by place_order ('Belum tersedia') and flagged in the catalogue", async () => {
    const u = await newUser("d");
    const start = await balanceOf(u.id);
    for (const svc of [PKG, POLL]) {
      const r = await rpcPlace(u.id, svc, 10, null);
      expect(r.error?.hint, svc).toBe("not_orderable");
      expect(r.error?.message).toBe("Layanan ini belum tersedia untuk dipesan.");
    }
    expect(await balanceOf(u.id)).toBe(start);
    const page = await m.services.getServices({ category: `zt-cat-${run}`, limit: 50 });
    const kind = (id: string) => page.items.find((s) => s.id === id)?.kind ?? "default";
    expect(kind(CC)).toBe("comments"); // mock mode: enabled
    expect(kind(DEF)).toBe("default");
    expect(kind(PKG)).toBe("unsupported");
    expect(kind(POLL)).toBe("unsupported");
    const kinds = ((await m.db.rpc("catalogue_page", { p_category: `zt-cat-${run}`, p_limit: 50 })).data ?? []) as { id: string; kind: string }[];
    expect(Object.fromEntries(kinds.map((k) => [k.id, k.kind]))).toMatchObject({ [CC]: "comments", [DEF]: "default", [PKG]: "unsupported", [POLL]: "unsupported" });
  }, 60_000);

  it("comments are stored as plain text: HTML survives literally, control characters are gone", async () => {
    const u = await newUser("e");
    const xss = `<img src=x onerror=alert(1)>`;
    const order = await place(u.id, CC, `${xss}\nhe\u0007llo​ world\n<script>alert("x")</script>`);
    expect((await commentsOf(Number(order.id)))?.comments).toBe(`${xss}\nhello world\n<script>alert("x")</script>`);
  }, 60_000);

  it("RLS on stored comments: the owner and admins can read them, other users and anon cannot, nobody can write", async () => {
    const owner = await newUser("f");
    const other = await newUser("g");
    const order = await place(owner.id, CC, "x\ny");
    const oc = await signedIn(owner.email);
    const own = await oc.from("order_comments").select("comments").eq("order_id", Number(order.id));
    expect(own.error).toBeNull();
    expect(own.data).toEqual([{ comments: "x\ny" }]);
    const other_ = await (await signedIn(other.email)).from("order_comments").select("comments").eq("order_id", Number(order.id));
    expect(other_.data).toEqual([]);
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!, { auth: { persistSession: false } });
    expect((await anon.from("order_comments").select("comments").eq("order_id", Number(order.id))).data ?? []).toEqual([]);
    // no write path for users
    const upd = await oc.from("order_comments").update({ comments: "hacked" }).eq("order_id", Number(order.id)).select();
    expect(upd.data ?? []).toEqual([]);
    const ins = await oc.from("order_comments").insert({ order_id: Number(order.id), comments: "z", line_count: 1 });
    expect(ins.error).not.toBeNull();
    expect((await commentsOf(Number(order.id)))?.comments).toBe("x\ny");
    // an admin session reads them (private.is_admin)
    const adminRow = await m.db.from("profiles").select("email").eq("id", admin).single();
    const ac = await signedIn(adminRow.data!.email);
    expect((await ac.from("order_comments").select("comments").eq("order_id", Number(order.id))).data).toEqual([{ comments: "x\ny" }]);
  }, 90_000);

  it("refund math stays on charge and quantity (= number of comments): exact Rupiah for Partial and Canceled", async () => {
    const u = await newUser("h");
    const start = await balanceOf(u.id);
    const seven = Array.from({ length: 7 }, (_, i) => `komentar ${i + 1}`).join("\n");
    const o = await place(u.id, CC, seven.replace(/\n/, "\n\n")); // 7 comments, one blank line ignored
    expect(o).toMatchObject({ quantity: 7, charge: 18 }); // ceil(17.5)
    m.client.mockWorld().providerOrders[o.providerOrderId] = { status: "Partial", startCount: 0, remains: 3 };
    await m.sync.syncOrderNow(m.client.createProviderClient(), Number(o.id));
    const row = (await m.db.from("orders").select("status,refunded_amount,remains,quantity,charge").eq("id", Number(o.id)).single()).data!;
    expect(row).toMatchObject({ status: "sebagian", refunded_amount: 7, remains: 3, quantity: 7, charge: 18 }); // floor(18 x 3 / 7) = floor(7.71) = 7
    expect(await balanceOf(u.id)).toBe(start - 18 + 7);

    const o2 = await place(u.id, CC, "a\nb\nc");
    expect(o2.charge).toBe(8);
    m.client.mockWorld().providerOrders[o2.providerOrderId] = { status: "Canceled", startCount: 0, remains: 3 };
    await m.sync.syncOrderNow(m.client.createProviderClient(), Number(o2.id));
    expect((await m.db.from("orders").select("status,refunded_amount").eq("id", Number(o2.id)).single()).data).toMatchObject({ status: "dibatalkan", refunded_amount: 8 });
    expect(await balanceOf(u.id)).toBe(start - 18 + 7);
    expect(await ledgerSum(u.id)).toBe(await balanceOf(u.id));
  }, 90_000);
});
