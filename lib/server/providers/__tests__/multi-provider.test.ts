/**
 * Second provider (smmsoc) on the generic smm-v2 adapter: adapter behaviour with mocked responses, per-provider pricing and namespacing,
 * routing by provider id, the live safety guards, and that no secret reaches a client. Nothing here ever touches the network:
 * `fetch` is always a double, and the repository that reads provider credentials is replaced.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyDb, finalPrice, setPriceRounding, type AdminDb, type ProviderRecord } from "@/lib/admin-data";
import { toPublicProvider } from "@/lib/admin-db";
import { applyCatalog, buildSyncPreview, buildUserCatalog, isUserVisible, pricingProblem } from "../catalog";
import { LIKEO_ID, validateProviderUrl } from "../config";
import { MOCK_CATALOG, MOCK_CATALOG_SECOND, createMockAdapter } from "../mock";
import { nativeToRupiah, providerRate } from "../rates";
import { createSmmV2Adapter } from "../smm-v2";
import { createProviderClient, getAdapter } from "../client";

vi.mock("server-only", () => ({}));

const creds = vi.hoisted(() => ({ map: new Map<string, { apiUrl: string; apiKey: string | null; name: string; slug: string }>() }));
vi.mock("@/lib/server/repo/providers", () => ({
  providerCredentials: async (id: string) => creds.map.get(id) ?? null,
  loadProvider: async () => null,
}));
vi.mock("@/lib/server/repo/settings", () => ({ loadSettings: async () => ({ pricing: { currency: "USD", rateIdr: 16_000 } }) }));

const SMMSOC_ID = "5c1e0a00-0000-4000-8000-00000000e002";
const KEY_A = "likeo_SECRET_KEY_aaaa1111";
const KEY_B = "smmsoc_SECRET_KEY_bbbb2222";
const URL_A = "https://likeo.example/api/v2";
const URL_B = "https://smmsoc.example/api/v2";
const noSleep = async () => {};

type Call = { url: string; params: URLSearchParams };
const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
function fakeFetch(...answers: (unknown | Error | Response | ((c: Call) => Response | Promise<Response>))[]) {
  const calls: Call[] = [];
  let i = 0;
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    const c: Call = { url: String(url), params: new URLSearchParams(String(init?.body ?? "")) };
    calls.push(c);
    const a = answers[Math.min(i++, answers.length - 1)];
    if (a instanceof Error) throw a;
    if (typeof a === "function") return a(c);
    return a instanceof Response ? a : jsonResponse(a);
  }) as typeof fetch;
  return { impl, calls };
}
const smmsoc = (f: typeof fetch, extra: Partial<Parameters<typeof createSmmV2Adapter>[0]> = {}) =>
  createSmmV2Adapter({ apiUrl: URL_B, apiKey: KEY_B, fetchImpl: f, sleep: noSleep, log: () => {}, providerName: "smmsoc", ...extra });

// ---------------------------------------------------------------------------
describe("smm-v2 adapter (smmsoc)", () => {
  it("speaks the standard dialect: key + action, one form field per call", async () => {
    const f = fakeFetch(
      [{ service: 1, name: "A", type: "Default", category: "Instagram", rate: "0.5", min: "10", max: "1000", refill: 1, cancel: 0 }],
      { balance: "12.50", currency: "USD" },
      { order: 777 },
      { status: "In progress", start_count: "5", remains: "95", charge: "0.1", currency: "USD" },
      { "7": { status: "Completed", start_count: 0, remains: 0 }, "8": { error: "Incorrect order ID" } },
      { refill: 55 },
      [{ refill: 55, status: "Completed" }],
      [{ order: 7, cancel: 1 }],
    );
    const a = smmsoc(f.impl);
    expect(await a.getServices()).toHaveLength(1);
    expect(await a.getBalance()).toEqual({ balance: 12.5, currency: "USD" });
    expect(await a.createOrder({ serviceId: "1", link: "https://x.test/p", quantity: 100 })).toEqual({ orderId: "777" });
    expect((await a.getOrderStatus("777")).remains).toBe(95);
    const multi = await a.getOrdersStatus(["7", "8"]);
    expect(multi["7"]).toMatchObject({ ok: true });
    expect(multi["8"]).toMatchObject({ ok: false, error: "ID pesanan tidak ditemukan di smmsoc." });
    expect(await a.requestRefill("7")).toEqual({ refillId: "55" });
    expect((await a.getRefillStatuses(["55"]))["55"]).toMatchObject({ ok: true, state: "selesai" });
    expect((await a.requestCancel(["7"]))["7"]).toEqual({ ok: true });
    expect(f.calls.map((c) => c.params.get("action"))).toEqual(["services", "balance", "add", "status", "status", "refill", "refill_status", "cancel"]);
    for (const c of f.calls) { expect(c.url).toBe(URL_B); expect(c.params.get("key")).toBe(KEY_B); }
    expect(f.calls[2].params.get("quantity")).toBe("100");
    expect(f.calls[4].params.get("orders")).toBe("7,8");
    expect(f.calls[6].params.get("refills")).toBe("55");
    expect(f.calls[7].params.get("orders")).toBe("7");
  });

  it("names the provider in error messages and maps an {error} body to a definite refusal", async () => {
    const f = fakeFetch({ error: "Not enough funds on balance" });
    await expect(smmsoc(f.impl).createOrder({ serviceId: "1", link: "l", quantity: 1 })).rejects.toMatchObject({ message: "Saldo di smmsoc tidak cukup.", kind: "provider", ambiguous: false });
  });

  it("an {error} body on a 4xx is a definite refusal, an unreadable 4xx too; a 5xx or unreadable 2xx is ambiguous", async () => {
    await expect(smmsoc(fakeFetch(jsonResponse({ error: "Invalid API key" }, 403)).impl).getBalance()).rejects.toMatchObject({ kind: "provider", ambiguous: false });
    await expect(smmsoc(fakeFetch(new Response("<html>Forbidden</html>", { status: 403 })).impl).createOrder({ serviceId: "1", link: "l", quantity: 1 })).rejects.toMatchObject({ kind: "http", ambiguous: false });
    await expect(smmsoc(fakeFetch(new Response("oops", { status: 503 })).impl).createOrder({ serviceId: "1", link: "l", quantity: 1 })).rejects.toMatchObject({ kind: "http", ambiguous: true });
    await expect(smmsoc(fakeFetch(new Response("<html>ok</html>", { status: 200 })).impl).createOrder({ serviceId: "1", link: "l", quantity: 1 })).rejects.toMatchObject({ kind: "invalid", ambiguous: true });
  });

  it("rejects malformed answers (wrong shape) instead of trusting them", async () => {
    await expect(smmsoc(fakeFetch({ hello: "x" }).impl).createOrder({ serviceId: "1", link: "l", quantity: 1 })).rejects.toMatchObject({ kind: "invalid", ambiguous: true });
    await expect(smmsoc(fakeFetch({ hello: "x" }).impl).getBalance()).rejects.toMatchObject({ kind: "invalid" });
    await expect(smmsoc(fakeFetch({ services: [] }).impl).getServices()).rejects.toMatchObject({ kind: "invalid" });
  });

  it("times out (ambiguous), and reads are retried but never an add", async () => {
    const hang = (async (_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_res, rej) => init?.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))))) as typeof fetch;
    await expect(smmsoc(hang, { timeoutMs: 5 }).createOrder({ serviceId: "1", link: "l", quantity: 1 })).rejects.toMatchObject({ kind: "timeout", ambiguous: true });

    const down = fakeFetch(new Error("ECONNRESET"));
    await expect(smmsoc(down.impl).getBalance()).rejects.toMatchObject({ kind: "network" });
    expect(down.calls).toHaveLength(3); // 1 + 2 retries: a read is safe to repeat

    for (const answer of [new Error("ECONNRESET"), new Response("down", { status: 502 }), new Response("not json", { status: 200 })]) {
      const f = fakeFetch(answer);
      await expect(smmsoc(f.impl).createOrder({ serviceId: "1", link: "l", quantity: 1 })).rejects.toBeTruthy();
      expect(f.calls).toHaveLength(1); // NEVER retried: the order may exist at the provider
    }
    for (const run of [(a: ReturnType<typeof smmsoc>) => a.requestRefill("1"), (a: ReturnType<typeof smmsoc>) => a.requestCancel(["1"])]) {
      const f = fakeFetch(new Error("ECONNRESET"));
      await expect(run(smmsoc(f.impl))).rejects.toBeTruthy();
      expect(f.calls).toHaveLength(1);
    }
  });

  it("never lets the key into a message or a log, even when the panel echoes it back", async () => {
    const logged: string[] = [];
    const log = (e: string, m: Record<string, unknown>) => logged.push(`${e} ${JSON.stringify(m)}`);
    const echo = fakeFetch({ error: `Invalid key ${KEY_B}` });
    const err = await smmsoc(echo.impl, { log }).getBalance().catch((e: Error) => e);
    expect((err as Error).message).not.toContain(KEY_B);
    const net = await smmsoc(fakeFetch(new Error(`connect failed for key=${KEY_B}`)).impl, { log }).getBalance().catch((e: Error) => e);
    expect((net as Error).message).not.toContain(KEY_B);
    expect(logged.join("\n")).not.toContain(KEY_B);
  });

  it("only orders Custom Comments when explicitly allowed", async () => {
    const f = fakeFetch({ order: 1 });
    await expect(smmsoc(f.impl).createOrder({ serviceId: "1", link: "l", quantity: 2, comments: ["a", "b"] })).rejects.toMatchObject({ kind: "config" });
    expect(f.calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe("rates and provider URL", () => {
  it("the first provider keeps the global rate; others use their own and are unknown without one", () => {
    const pricing = { currency: "USD", rateIdr: 16_000 };
    expect(providerRate({ id: LIKEO_ID, currency: "USD", exchangeRate: 99 }, pricing)).toMatchObject({ rateIdr: 16_000, legacy: true });
    expect(providerRate({ id: SMMSOC_ID, currency: "usd", exchangeRate: 15_500 }, pricing)).toEqual({ currency: "USD", rateIdr: 15_500, legacy: false });
    expect(providerRate({ id: SMMSOC_ID, currency: "USD", exchangeRate: null }, pricing).rateIdr).toBeNull();
  });
  it("converts a balance only when it can be done honestly", () => {
    const own = providerRate({ id: SMMSOC_ID, currency: "USD", exchangeRate: 15_500 }, { currency: "USD", rateIdr: 16_000 });
    expect(nativeToRupiah(2, "USD", own)).toBe(31_000);
    expect(nativeToRupiah(50_000, "IDR", own)).toBe(50_000);
    expect(nativeToRupiah(2, "EUR", own)).toBeNull(); // a currency we have no rate for is unknown, not "2 rupiah"
    expect(nativeToRupiah(2, "USD", providerRate({ id: SMMSOC_ID, currency: "USD" }, { currency: "USD", rateIdr: 16_000 }))).toBeNull();
  });
  it("accepts only public https API URLs", () => {
    expect(validateProviderUrl("https://smmsoc.com/api/v2")).toEqual({ ok: true, url: "https://smmsoc.com/api/v2" });
    for (const bad of ["", "http://smmsoc.com/api/v2", "ftp://x.com", "https://user:pw@x.com/api", "https://localhost/api", "https://127.0.0.1/api", "https://10.0.0.5/api", "https://192.168.1.1/api", "https://169.254.169.254/latest", "https://[::1]/api", "https://panel/api", "https://x.internal/api", "https://x.com:8443/api", "not a url"]) {
      expect(validateProviderUrl(bad).ok, bad).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
describe("catalogue: two providers side by side", () => {
  let db: AdminDb;
  const smmsocRow = (over: Partial<ProviderRecord> = {}): ProviderRecord => ({
    id: SMMSOC_ID, name: "smmsoc", slug: "smmsoc", apiUrl: URL_B, apiKey: "", balance: 0, status: "aktif", lastSync: "", currency: "USD", exchangeRate: 15_000, keySaved: true, ...over,
  });
  const likeoService = (id: string) => ({
    id, categoryId: "lk-instagram-followers", categoryLabel: "Instagram Followers", platform: "instagram", name: `Likeo ${id}`, badges: [], providerId: LIKEO_ID, providerServiceId: `L${id}`,
    providerPrice: 13_600, markupType: "persen" as const, markup: 40, min: 10, max: 1000, refill: false, refillDays: null, cancel: false, active: true, sort: Number(id), imported: true,
  });
  beforeEach(() => {
    setPriceRounding(1);
    db = createEmptyDb();
    db.providers.push(smmsocRow());
    db.settings.pricing.providerMarkups = { [LIKEO_ID]: { markupType: "persen", markup: 40 }, [SMMSOC_ID]: { markupType: "persen", markup: 25 } };
    db.services = [likeoService("1"), likeoService("2"), likeoService("3")];
  });
  afterEach(() => setPriceRounding(1));

  /** What the admin sync loads for one provider: only that provider's services (the rest of the table is not in memory). */
  const unitOf = (providerId: string) => { const u = createEmptyDb(); u.settings = db.settings; u.providers = db.providers; u.services = db.services.filter((s) => s.providerId === providerId); return u; };

  it("prices smmsoc with ITS rate and markup, not Likeo's", () => {
    const preview = buildSyncPreview(unitOf(SMMSOC_ID), SMMSOC_ID, MOCK_CATALOG_SECOND);
    expect(preview.rate).toEqual({ currency: "USD", rateIdr: 15_000 });
    const first = preview.changes.find((c) => c.providerServiceId === "5001")!;
    expect(first.newCost).toBe(Math.ceil(0.62 * 15_000)); // 9300, not 0.62 * 16000
    expect(first.newPrice).toBe(Math.ceil(9_300 * 1.25));
    expect(buildSyncPreview(unitOf(LIKEO_ID), LIKEO_ID, MOCK_CATALOG).rate.rateIdr).toBe(16_000);
  });

  it("is blocked until the provider has its own rate (Likeo's rate is never borrowed)", () => {
    db.providers = [db.providers[0], smmsocRow({ exchangeRate: null })];
    expect(pricingProblem(db, SMMSOC_ID)).toMatch(/kurs/i);
    expect(buildSyncPreview(unitOf(SMMSOC_ID), SMMSOC_ID, MOCK_CATALOG_SECOND).blocked).toMatch(/kurs/i);
    expect(() => applyCatalog(unitOf(SMMSOC_ID), SMMSOC_ID, MOCK_CATALOG_SECOND)).toThrow();
    expect(pricingProblem(db, LIKEO_ID)).toBeNull();
  });

  it("imports namespaced by provider, starts INACTIVE when asked, never reuses a Likeo id and never touches Likeo services", () => {
    db.settings.pricing.newServicesInactive = true;
    const likeoBefore = JSON.stringify(db.services.filter((s) => s.providerId === LIKEO_ID));
    const unit = unitOf(SMMSOC_ID);
    const result = applyCatalog(unit, SMMSOC_ID, MOCK_CATALOG_SECOND, new Date(), { maxId: 3, maxSort: 3 });
    expect(result.created).toBe(MOCK_CATALOG_SECOND.filter((s) => s.type === "Default" || s.type === "Custom Comments").length);
    expect(unit.services.every((s) => s.providerId === SMMSOC_ID && s.imported)).toBe(true);
    expect(unit.services.every((s) => !s.active)).toBe(true); // "Layanan baru mulai nonaktif"
    expect(Math.min(...unit.services.map((s) => Number(s.id)))).toBeGreaterThan(3);
    expect(new Set(unit.services.map((s) => s.id)).size).toBe(unit.services.length);
    expect(unit.services.every((s) => s.providerPrice > 0 && finalPrice(s) > s.providerPrice)).toBe(true);
    expect(JSON.stringify(db.services.filter((s) => s.providerId === LIKEO_ID))).toBe(likeoBefore);
    // The same provider service id may exist at both providers: the pair (provider, service id) is what is unique.
    const dup = [...MOCK_CATALOG_SECOND, { ...MOCK_CATALOG_SECOND[0], id: "L1" }];
    const again = unitOf(SMMSOC_ID);
    applyCatalog(again, SMMSOC_ID, dup, new Date(), { maxId: 3 });
    expect(again.services.some((s) => s.providerServiceId === "L1" && s.providerId === SMMSOC_ID)).toBe(true);
  });

  it("a sync of one provider never deactivates the other provider's services", () => {
    const unit = unitOf(SMMSOC_ID);
    applyCatalog(unit, SMMSOC_ID, MOCK_CATALOG_SECOND, new Date(), { maxId: 3 });
    const preview = buildSyncPreview(unit, SMMSOC_ID, []);
    expect(preview.changes.every((c) => c.kind === "dihapus")).toBe(true);
    expect(preview.changes.some((c) => c.providerServiceId.startsWith("L"))).toBe(false);
  });

  it("switching a provider off hides its services (not Likeo's) and keeps them in the database", () => {
    const unit = unitOf(SMMSOC_ID);
    applyCatalog(unit, SMMSOC_ID, MOCK_CATALOG_SECOND, new Date(), { maxId: 3 });
    db.services.push(...unit.services);
    expect(buildUserCatalog(db).services.length).toBe(3 + unit.services.length);
    db.providers = db.providers.map((p) => (p.id === SMMSOC_ID ? { ...p, status: "nonaktif" as const } : p));
    const visible = buildUserCatalog(db).services;
    expect(visible).toHaveLength(3);
    expect(db.services.filter((s) => s.providerId === SMMSOC_ID)).toHaveLength(unit.services.length); // history and rows stay
    expect(db.services.filter((s) => s.providerId === SMMSOC_ID).some((s) => isUserVisible(db, s))).toBe(false);
    expect(isUserVisible(db, db.services[0])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe("routing and the live safety guards", () => {
  const REF = "abcdefghijklmnopqrst";
  const goLive = () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", `https://${REF}.supabase.co`);
    vi.stubEnv("PROVIDER_LIVE_APPROVED_REF", REF);
    vi.stubEnv("PROVIDER_MODE", "live");
  };
  beforeEach(() => {
    creds.map.clear();
    creds.map.set(LIKEO_ID, { apiUrl: URL_A, apiKey: KEY_A, name: "Likeo", slug: "likeo" });
    creds.map.set(SMMSOC_ID, { apiUrl: URL_B, apiKey: KEY_B, name: "smmsoc", slug: "smmsoc" });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends each call to ITS provider's URL with ITS key", async () => {
    goLive();
    const f = fakeFetch((c: Call) => jsonResponse(c.params.get("action") === "add" ? { order: c.url === URL_B ? "O-S" : "O-L" } : { "1": { status: "Pending", start_count: 0, remains: 5 } }));
    vi.stubGlobal("fetch", f.impl);
    const client = createProviderClient();
    expect(await client.addOrder(SMMSOC_ID, { service: "5001", link: "https://x.test/a", quantity: 5 })).toEqual({ providerOrderId: "O-S" });
    expect(await client.addOrder(LIKEO_ID, { service: "1001", link: "https://x.test/a", quantity: 5 })).toEqual({ providerOrderId: "O-L" });
    await client.getOrdersStatus!(SMMSOC_ID, ["1"]);
    expect(f.calls.map((c) => [c.url, c.params.get("key")])).toEqual([[URL_B, KEY_B], [URL_A, KEY_A], [URL_B, KEY_B]]);
  });

  it("one provider failing does not break the other", async () => {
    goLive();
    const f = fakeFetch((c: Call) => (c.url === URL_B ? new Response("down", { status: 502 }) : jsonResponse({ "1": { status: "Completed", start_count: 0, remains: 0 } })));
    vi.stubGlobal("fetch", f.impl);
    const client = createProviderClient();
    await expect(client.getOrdersStatus!(SMMSOC_ID, ["1"])).rejects.toBeTruthy();
    const ok = await client.getOrdersStatus!(LIKEO_ID, ["1"]);
    expect(ok["1"]).not.toBeInstanceOf(Error);
  });

  it("live calls need PROVIDER_MODE=live AND the approved project; otherwise the simulator answers and nothing is fetched", async () => {
    const f = fakeFetch({ order: 1 });
    vi.stubGlobal("fetch", f.impl);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", `https://${REF}.supabase.co`);
    vi.stubEnv("PROVIDER_LIVE_APPROVED_REF", "zzzzzzzzzzzzzzzzzzzz"); // another project is approved
    vi.stubEnv("PROVIDER_MODE", "live");
    vi.stubEnv("SUPABASE_DEV_PROJECT_REF", REF);
    const a = await getAdapter(SMMSOC_ID);
    expect(a.mode).toBe("mock");
    expect((await a.getServices()).map((s) => s.id)).toEqual(MOCK_CATALOG_SECOND.map((s) => s.id));
    expect(f.calls).toHaveLength(0);
    // approved project but PROVIDER_MODE not live: off, still no fetch
    vi.stubEnv("PROVIDER_LIVE_APPROVED_REF", REF);
    vi.stubEnv("PROVIDER_MODE", "mock");
    await expect(getAdapter(SMMSOC_ID)).rejects.toMatchObject({ kind: "config" });
    expect(f.calls).toHaveLength(0);
  });

  it("refuses an unknown provider or one without a key, before any request", async () => {
    goLive();
    const f = fakeFetch({ balance: 1 });
    vi.stubGlobal("fetch", f.impl);
    creds.map.set(SMMSOC_ID, { apiUrl: URL_B, apiKey: null, name: "smmsoc", slug: "smmsoc" });
    await expect(getAdapter(SMMSOC_ID)).rejects.toMatchObject({ kind: "config", message: expect.stringContaining("smmsoc") });
    await expect(getAdapter("00000000-0000-4000-8000-000000000000")).rejects.toMatchObject({ kind: "config" });
    expect(f.calls).toHaveLength(0);
  });

  it("Custom Comments stay off for a provider whose format was never verified, even with the flag on", async () => {
    goLive();
    vi.stubEnv("PROVIDER_CUSTOM_COMMENTS", "1");
    const f = fakeFetch({ order: 9 });
    vi.stubGlobal("fetch", f.impl);
    await expect((await getAdapter(SMMSOC_ID)).createOrder({ serviceId: "5005", link: "l", quantity: 2, comments: ["a", "b"] })).rejects.toMatchObject({ kind: "config" });
    expect(f.calls).toHaveLength(0);
    await expect((await getAdapter(LIKEO_ID)).createOrder({ serviceId: "1005", link: "l", quantity: 2, comments: ["a", "b"] })).resolves.toEqual({ orderId: "9" });
  });

  it("the simulator gives each provider its own catalogue and balance", async () => {
    const world = createEmptyDb();
    const first = createMockAdapter(world, LIKEO_ID);
    const second = createMockAdapter(world, SMMSOC_ID);
    expect((await first.getServices()).map((s) => s.id)).toEqual(MOCK_CATALOG.map((s) => s.id));
    expect((await second.getServices()).map((s) => s.id)).toEqual(MOCK_CATALOG_SECOND.map((s) => s.id));
    expect((await first.getBalance()).balance).not.toBe((await second.getBalance()).balance);
    await expect(second.createOrder({ serviceId: "9999", link: "l", quantity: 100 })).rejects.toMatchObject({ kind: "provider" }); // unknown to the simulator
    const order = await second.createOrder({ serviceId: "5001", link: "l", quantity: 100 });
    expect(order.orderId).toMatch(/^MK-/);
  });
});

// ---------------------------------------------------------------------------
describe("secrets never reach a client", () => {
  it("the public provider holds no key, not even its last characters, only whether one is saved", async () => {
    const { toProviderRecord } = await vi.importActual<typeof import("@/lib/server/repo/providers")>("@/lib/server/repo/providers");
    const ENCRYPTED = "v1:ZW5jcnlwdGVkLWtleS1ibG9i";
    const row = {
      id: SMMSOC_ID, name: "smmsoc", slug: "smmsoc", api_url: URL_B, api_key_encrypted: ENCRYPTED, adapter_type: "smm-v2", mode: "live", active: true, currency: "USD", exchange_rate: 15_000,
      balance_native: 12.5, balance_idr: 187_500, balance_at: null, low_balance_threshold: 500_000, last_test: null, last_sync_at: null, created_at: "", updated_at: "",
    };
    const json = JSON.stringify(toPublicProvider(toProviderRecord(row as never, true)));
    expect(json).not.toContain(ENCRYPTED);
    expect(json).not.toContain("api_key");
    expect(json).toContain("tersimpan");
    expect(JSON.stringify(toPublicProvider(toProviderRecord(row as never, false)))).toContain("belum diisi");
  });
});
