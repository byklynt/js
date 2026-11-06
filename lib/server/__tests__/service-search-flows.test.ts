/**
 * Service search against the linked DEV Supabase project: the admin list (our ID, provider service ID, "#ID", name, across categories) and the user
 * catalogue (our ID and name only, active services only, no provider data). Run with: npm run test:db  (node scripts/run-db-tests.mjs service-search)
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
    if (i > 0 && !line.trim().startsWith("#")) fileEnv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
}
for (const [k, v] of Object.entries(fileEnv)) if (process.env[k] === undefined) process.env[k] = v;
const enabled = process.env.RUN_DB_TESTS === "1" && Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY));

describe.skipIf(!enabled)("service search (admin and user)", () => {
  const MARKER = "sv";
  const run = MARKER + Math.random().toString(36).slice(2, 7);
  const A = `ZT-${run}A`.toUpperCase(); // active, category 1
  const B = `ZT-${run}B`.toUpperCase(); // active, category 2
  const C = `ZT-${run}C`.toUpperCase(); // inactive
  const PID = { A: `${run}9001`, B: `${run}9002`, C: `${run}9003` };
  let m: {
    db: ReturnType<typeof import("@/lib/server/supabase-admin").supabaseAdmin>;
    admin: typeof import("@/lib/server/admin-services");
    user: typeof import("@/lib/server/services");
  };
  const ids = async (search: string, category?: string) => (await m.admin.adminServicesPage({ search, category, limit: 100 })).items.map((s) => s.id);

  beforeAll(async () => {
    const ref = process.env.SUPABASE_DEV_PROJECT_REF;
    if (!ref || new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname !== `${ref}.supabase.co`) throw new Error("Refusing to run: SUPABASE_DEV_PROJECT_REF does not match NEXT_PUBLIC_SUPABASE_URL.");
    process.env.PROVIDER_MODE = "mock";
    m = {
      db: (await import("@/lib/server/supabase-admin")).supabaseAdmin(),
      admin: await import("@/lib/server/admin-services"),
      user: await import("@/lib/server/services"),
    };
    await cleanupOrFail({ marker: MARKER });
    const prov = await m.db.from("providers").insert({ name: `ZT ${run}`, slug: `zt-${run}`, mode: "mock", active: true }).select("id").single();
    expect(prov.error).toBeNull();
    for (const c of [1, 2]) await m.db.from("service_categories").insert({ id: `zt-cat-${run}-${c}`, label: `ZT Kategori ${run} ${c}`, platform: "instagram" });
    const rows: [string, string, string, string, boolean][] = [
      [A, PID.A, `ZT Alpha Beta Followers ${run}`, `zt-cat-${run}-1`, true],
      [B, PID.B, `ZT Gamma Likes ${run}`, `zt-cat-${run}-2`, true],
      [C, PID.C, `ZT Delta Hidden ${run}`, `zt-cat-${run}-1`, false],
    ];
    for (const [id, pid, name, cat, active] of rows) {
      const r = await m.db.from("services").insert({ id, provider_id: prov.data!.id, provider_service_id: pid, category_id: cat, name, platform: "instagram", provider_price: 1000, price_per_1000: 2000, min: 1, max: 1000, active, imported: true });
      expect(r.error).toBeNull();
    }
  }, 240_000);

  afterAll(async () => {
    await cleanupOrFail({ marker: MARKER });
  }, 300_000);

  it("admin: finds a service by our ID, with surrounding spaces and any letter case", async () => {
    expect(await ids(A)).toEqual([A]);
    expect(await ids(`  ${A.toLowerCase()}  `)).toEqual([A]);
  });
  it("admin: finds it by the provider service ID, with or without a leading #", async () => {
    expect(await ids(PID.A)).toEqual([A]);
    expect(await ids(`#${PID.A}`)).toEqual([A]);
    expect(await ids(`# ${PID.B}`)).toEqual([B]);
    expect((await m.db.rpc("admin_services_page", { p_search: `#${PID.A}`, p_min_margin: 5, p_limit: 10 })).data?.map((r) => (r.service as { id: string }).id)).toEqual([A]); // SQL strips # too
  });
  it("admin: finds it by part of the name, case-insensitive; inactive services are listed too (admin)", async () => {
    expect(await ids(`alpha beta`)).toEqual([A]);
    expect(await ids(`GAMMA LIKES`)).toEqual([B]);
    expect(await ids(`delta hidden ${run}`)).toEqual([C]);
    expect((await ids(`zt `)).length).toBeGreaterThanOrEqual(0);
  });
  it("admin: text typed searches ACROSS categories (the category filter does not hide it); without text the category filter applies", async () => {
    expect(await ids(B, `zt-cat-${run}-1`)).toEqual([B]); // B lives in category 2
    const only1 = await ids("", `zt-cat-${run}-1`);
    expect(only1).toEqual(expect.arrayContaining([A, C]));
    expect(only1).not.toContain(B);
  });
  it("admin: exact ID matches come first; nothing found = an empty page", async () => {
    const r = await m.admin.adminServicesPage({ search: PID.A.slice(0, -1), limit: 100 }); // a prefix matches several rows
    expect(r.items.map((s) => s.id)).toEqual(expect.arrayContaining([A]));
    expect((await m.admin.adminServicesPage({ search: `nope-${run}-zzz`, limit: 100 })).items).toEqual([]);
    expect((await m.admin.adminServicesPage({ search: `nope-${run}-zzz`, limit: 100 })).total).toBe(0);
  });
  it("user: finds active services by our ID and by name, across categories; never an inactive one", async () => {
    const find = async (q: string) => (await m.user.getServices({ search: q, limit: 50 })).items.map((s) => s.id);
    expect(await find(A)).toEqual([A]);
    expect(await find(`#${A}`)).toEqual([A]);
    expect(await find(`gamma likes`)).toEqual([B]);
    expect(await find(C)).toEqual([]);
    expect(await find(`delta hidden`)).toEqual([]);
  });
  it("user: provider service IDs are not searchable and no provider data is returned", async () => {
    expect((await m.user.getServices({ search: PID.A, limit: 50 })).items).toEqual([]);
    expect((await m.user.getServices({ search: `#${PID.A}`, limit: 50 })).items).toEqual([]);
    const row = (await m.user.getServices({ search: A, limit: 5 })).items[0];
    const keys = Object.keys(row);
    for (const forbidden of ["providerId", "providerServiceId", "providerPrice", "providerName", "cost", "provider_price", "provider_service_id", "markup"]) expect(keys).not.toContain(forbidden);
    expect(JSON.stringify(row)).not.toContain(PID.A);
  });
});
