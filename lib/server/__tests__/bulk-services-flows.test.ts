/**
 * Bulk activate / deactivate of services against the linked DEV Supabase project (public.bulk_set_services_active). Run with: npm run test:db
 * (node scripts/run-db-tests.mjs bulk-services). The "whole catalogue" scope is only ever DRY-RUN here: it would touch the real DEV catalogue.
 */
import { existsSync, readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanupOrFail } from "../../../scripts/lib/test-cleanup.mjs";

vi.mock("server-only", () => ({}));

const fileEnv: Record<string, string> = {};
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0 && !line.trim().startsWith("#")) fileEnv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
}
for (const [k, v] of Object.entries(fileEnv)) if (process.env[k] === undefined) process.env[k] = v;
const enabled = process.env.RUN_DB_TESTS === "1" && Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY));

type Counts = { matched: number; changed: number; skippedReview: number; unchanged: number; dryRun: boolean };

describe.skipIf(!enabled)("bulk activate / deactivate services", () => {
  const MARKER = "bk";
  const run = MARKER + Math.random().toString(36).slice(2, 7);
  const CAT1 = `zt-cat-${run}-1`;
  const CAT2 = `zt-cat-${run}-2`;
  const PLAT = `zt-plat-${run}`;
  let m: { db: ReturnType<typeof import("@/lib/server/supabase-admin").supabaseAdmin> };
  let admin = "";
  let user = "";
  let provider = "";
  const sid = (n: number) => `ZT-${run}-${String(n).padStart(4, "0")}`.toUpperCase();
  const row = (id: string, cat: string, extra: Record<string, unknown> = {}) => ({
    id, provider_id: provider, provider_service_id: `p${id}`, category_id: cat, name: `ZT Layanan ${id}`, platform: PLAT, provider_price: 1000, price_per_1000: 2000, min: 1, max: 1000,
    active: true, imported: true, ...extra,
  });
  const call = async (args: Record<string, unknown>) => {
    const r = await m.db.rpc("bulk_set_services_active", { p_admin: admin, p_active: true, p_review_threshold: 5_000_000, ...args } as never);
    return { error: r.error, data: r.data as unknown as Counts };
  };
  const activeOf = async (ids: string[]) => Object.fromEntries(((await m.db.from("services").select("id,active").in("id", ids)).data ?? []).map((r) => [r.id, r.active]));
  const bulkLogs = async () => (await m.db.from("audit_logs").select("id,after").eq("action", "service.bulk_active").eq("admin_id", admin)).data ?? [];

  beforeAll(async () => {
    const ref = process.env.SUPABASE_DEV_PROJECT_REF;
    if (!ref || new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname !== `${ref}.supabase.co`) throw new Error("Refusing to run: SUPABASE_DEV_PROJECT_REF does not match NEXT_PUBLIC_SUPABASE_URL.");
    m = { db: (await import("@/lib/server/supabase-admin")).supabaseAdmin() };
    await cleanupOrFail({ marker: MARKER });
    const mk = async (n: string, role?: "admin") => {
      const username = `zt_${n}_${run}`.slice(0, 24);
      const { data, error } = await m.db.auth.admin.createUser({ email: `${username}@jagoansosmed-test.invalid`, password: `Blk-${run}-pass1`, email_confirm: true, user_metadata: { username } });
      if (error || !data.user) throw new Error(error?.message);
      if (role) await m.db.from("profiles").update({ role }).eq("id", data.user.id);
      return data.user.id;
    };
    admin = await mk("adm", "admin");
    user = await mk("usr");
    const prov = await m.db.from("providers").insert({ name: `ZT ${run}`, slug: `zt-${run}`, mode: "mock", active: true }).select("id").single();
    expect(prov.error).toBeNull();
    provider = prov.data!.id;
    await m.db.from("service_categories").insert([{ id: CAT1, label: `ZT Kategori ${run} 1`, platform: "instagram" }, { id: CAT2, label: `ZT Kategori ${run} 2`, platform: "instagram" }]);
    // 30 services in category 1, 5 in category 2; two flagged "Perlu dicek" (price over the threshold; name under 3 characters)
    const rows = [
      ...Array.from({ length: 30 }, (_, i) => row(sid(i + 1), CAT1)),
      ...Array.from({ length: 5 }, (_, i) => row(sid(101 + i), CAT2)),
      row(sid(201), CAT1, { price_per_1000: 25_900_000, provider_price: 18_500_000 }),
      row(sid(202), CAT1, { name: "mm" }),
    ];
    expect((await m.db.from("services").insert(rows)).error).toBeNull();
  }, 240_000);

  afterAll(async () => {
    await cleanupOrFail({ marker: MARKER });
  }, 300_000);

  it("only admins may run it", async () => {
    const r = await m.db.rpc("bulk_set_services_active", { p_admin: user, p_active: false, p_scope: "ids", p_ids: [sid(1)] } as never);
    expect(r.error?.hint).toBe("forbidden");
    expect((await activeOf([sid(1)]))[sid(1)]).toBe(true);
  });

  it("selected ids: one UPDATE, exact counts, ONE audit row with the filter summary; a second run changes nothing and logs nothing", async () => {
    const ids = [sid(1), sid(2), sid(3)];
    const before = (await bulkLogs()).length;
    const a = await call({ p_active: false, p_scope: "ids", p_ids: ids });
    expect(a.error).toBeNull();
    expect(a.data).toMatchObject({ matched: 3, changed: 3, skippedReview: 0, unchanged: 0 });
    expect(await activeOf(ids)).toEqual({ [sid(1)]: false, [sid(2)]: false, [sid(3)]: false });
    const logs = await bulkLogs();
    expect(logs.length).toBe(before + 1); // one row, not three
    expect(logs.at(-1)?.after).toMatchObject({ active: false, changed: 3, filter: { scope: "ids", ids: 3 } });
    const b = await call({ p_active: false, p_scope: "ids", p_ids: ids });
    expect(b.data).toMatchObject({ matched: 3, changed: 0, unchanged: 3 });
    expect((await bulkLogs()).length).toBe(before + 1); // idempotent: nothing changed, nothing logged
    // partly in the target state: only the others change
    const c = await call({ p_active: true, p_scope: "ids", p_ids: [...ids, sid(4)] });
    expect(c.data).toMatchObject({ matched: 4, changed: 3, unchanged: 1 });
  }, 60_000);

  it("dry run counts and writes nothing", async () => {
    const before = (await bulkLogs()).length;
    const d = await call({ p_active: false, p_scope: "category", p_category: CAT2, p_dry_run: true });
    expect(d.data).toMatchObject({ matched: 5, changed: 5, dryRun: true });
    expect((await activeOf([sid(101)]))[sid(101)]).toBe(true);
    expect((await bulkLogs()).length).toBe(before);
    // the whole catalogue: dry run only (a real run would switch off the DEV catalogue)
    const all = await call({ p_active: false, p_scope: "all", p_dry_run: true });
    const total = (await m.db.from("services").select("id", { count: "exact", head: true })).count ?? 0;
    expect(all.data.matched).toBe(total);
  }, 60_000);

  it("scoped by category and by platform touch exactly those rows; the filter scope follows the admin list's category and search", async () => {
    const cat = await call({ p_active: false, p_scope: "category", p_category: CAT2 });
    expect(cat.data).toMatchObject({ matched: 5, changed: 5 });
    expect(Object.values(await activeOf([sid(101), sid(102), sid(103), sid(104), sid(105)])).every((v) => v === false)).toBe(true);
    expect((await activeOf([sid(10)]))[sid(10)]).toBe(true); // category 1 untouched
    const search = await call({ p_active: true, p_scope: "filter", p_category: CAT2, p_search: `${sid(103).toLowerCase()}` });
    expect(search.data).toMatchObject({ matched: 1, changed: 1 }); // search ignores the category filter but still finds exactly that service
    expect((await activeOf([sid(103), sid(104)]))).toEqual({ [sid(103)]: true, [sid(104)]: false });
    const plat = await call({ p_active: true, p_scope: "platform", p_platform: PLAT });
    expect(plat.data.matched).toBe(37);
    expect(plat.data.changed).toBe(plat.data.matched - plat.data.unchanged - plat.data.skippedReview);
  }, 90_000);

  it("activating skips services flagged Perlu dicek unless the admin explicitly includes them", async () => {
    const review = [sid(201), sid(202)];
    await call({ p_active: false, p_scope: "ids", p_ids: review });
    const skipped = await call({ p_active: true, p_scope: "ids", p_ids: review });
    expect(skipped.data).toMatchObject({ matched: 2, changed: 0, skippedReview: 2 });
    expect(Object.values(await activeOf(review)).every((v) => v === false)).toBe(true);
    const forced = await call({ p_active: true, p_scope: "ids", p_ids: review, p_include_review: true });
    expect(forced.data).toMatchObject({ changed: 2, skippedReview: 0 });
    // deactivating never skips anything
    const off = await call({ p_active: false, p_scope: "ids", p_ids: review });
    expect(off.data).toMatchObject({ changed: 2 });
  }, 60_000);

  it("deactivating does not break existing orders; the service just stops being orderable", async () => {
    const svc = sid(20);
    await call({ p_active: true, p_scope: "ids", p_ids: [svc] });
    const ord = await m.db.from("orders").insert({ user_id: user, service_id: svc, provider_id: provider, provider_order_id: `MK-ZB${run}`, link: `https://zt.test/${run}/o1`, quantity: 100, charge: 200, remains: 100, status: "berjalan" }).select("id").single();
    expect(ord.error).toBeNull();
    await call({ p_active: false, p_scope: "ids", p_ids: [svc] });
    const o = (await m.db.from("orders").select("service_id,status,quantity,charge").eq("id", ord.data!.id).single()).data!;
    expect(o).toMatchObject({ service_id: svc, status: "berjalan", quantity: 100, charge: 200 });
    const placed = await m.db.rpc("place_order", { p_user: user, p_service: svc, p_link: `https://zt.test/${run}/o2`, p_quantity: 100 });
    expect(placed.error?.hint).toBe("no_service");
  }, 60_000);

  it("is a single statement: ~2000 rows switch in a couple of seconds", async () => {
    const CAT3 = `zt-cat-${run}-3`;
    await m.db.from("service_categories").insert({ id: CAT3, label: `ZT Kategori ${run} 3`, platform: "instagram" });
    const many = Array.from({ length: 2000 }, (_, i) => row(`ZT-${run}-B${String(i).padStart(4, "0")}`.toUpperCase(), CAT3));
    for (let i = 0; i < many.length; i += 500) expect((await m.db.from("services").insert(many.slice(i, i + 500))).error).toBeNull();
    const t0 = Date.now();
    const off = await call({ p_active: false, p_scope: "category", p_category: CAT3 });
    const ms = Date.now() - t0;
    expect(off.data).toMatchObject({ matched: 2000, changed: 2000 });
    expect(ms).toBeLessThan(5000);
    const again = await call({ p_active: false, p_scope: "category", p_category: CAT3 });
    expect(again.data).toMatchObject({ changed: 0, unchanged: 2000 });
  }, 180_000);
});
