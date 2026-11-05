import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { finalPrice, setPriceRounding, type AdminDb } from "@/lib/admin-data";
import { seedDemoDb as seedAdminDb } from "@/lib/dev/demo-seed";
import { toPublicProvider } from "@/lib/admin-db";
import { ProviderError, type ProviderClient } from "../../provider-client";
import { placeOrder, resolveManualCheck } from "../../orders";
import { syncOrders } from "../../sync";
import { applyCatalog, buildSyncPreview, buildUserCatalog, cleanServiceName, isSupportedType, platformFromCategory, rateToRupiah } from "../catalog";
import { createProviderClient } from "../client";
import { LIKEO_ID, maskApiKey, redact } from "../config";
import { createLikeoAdapter, mapLikeoStatus, translateProviderError } from "../likeo";
import { createMockAdapter, MOCK_CATALOG } from "../mock";
import type { ProviderServiceInfo } from "../types";

vi.mock("server-only", () => ({}));

const KEY = "lk_live_SECRETKEY_9f3c71d2b84e";
const URL_ = "https://likeo.example/api/v2";
const noSleep = async () => {};

type Call = { url: string; init: RequestInit; params: URLSearchParams };
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
/** A fetch double that answers from a queue and records every call. */
function fakeFetch(...answers: (unknown | Error | ((c: Call) => Response))[]) {
  const calls: Call[] = [];
  let i = 0;
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    const c: Call = { url: String(url), init: init ?? {}, params: new URLSearchParams(String(init?.body ?? "")) };
    calls.push(c);
    const a = answers[Math.min(i++, answers.length - 1)];
    if (a instanceof Error) throw a;
    if (typeof a === "function") return a(c);
    return a instanceof Response ? a : jsonResponse(a);
  }) as typeof fetch;
  return { impl, calls };
}
const adapter = (f: typeof fetch, extra: Partial<Parameters<typeof createLikeoAdapter>[0]> = {}) =>
  createLikeoAdapter({ apiUrl: URL_, apiKey: KEY, fetchImpl: f, sleep: noSleep, log: () => {}, ...extra });

// ---------------------------------------------------------------------------
describe("parsing", () => {
  it("parses services with numbers as strings and 0/1 flags, skips broken rows", async () => {
    const f = fakeFetch([
      { service: 1, name: "A", type: "Default", category: "Instagram", rate: "0.85", min: "100", max: "5000", refill: true, cancel: 0 },
      { service: "2", name: "B", rate: 1.5, min: 10, max: 20, refill: "1", cancel: "true" },
      { nonsense: true },
    ]);
    const out = await adapter(f.impl).getServices();
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ id: "1", rate: 0.85, min: 100, max: 5000, refill: true, cancel: false, type: "Default" });
    expect(out[1]).toMatchObject({ id: "2", type: "Default", category: "Lainnya", refill: true, cancel: true });
  });
  it("rejects a response that is not a list", async () => {
    await expect(adapter(fakeFetch({ hello: "x" }).impl).getServices()).rejects.toMatchObject({ kind: "invalid" });
  });
  it("{error} becomes an Indonesian message and is not ambiguous", async () => {
    const err = await adapter(fakeFetch({ error: "Not enough funds on balance" }).impl).createOrder({ serviceId: "1", link: "https://a.b/c", quantity: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.message).toBe("Saldo di Likeo tidak cukup.");
    expect(err.ambiguous).toBe(false);
    expect(translateProviderError("Invalid API key")).toBe("API key Likeo tidak valid atau tidak punya akses.");
    expect(translateProviderError("Something odd")).toContain("Likeo menolak permintaan");
  });
  it("a batch answer can carry a per-order error", async () => {
    const f = fakeFetch({ "1": { status: "Completed", start_count: "5", remains: "0" }, "2": { error: "Incorrect order ID" } });
    const out = await adapter(f.impl).getOrdersStatus(["1", "2"]);
    expect(out["1"]).toMatchObject({ ok: true });
    expect(out["2"]).toEqual({ ok: false, error: "ID pesanan tidak ditemukan di Likeo." });
  });
});

describe("status mapping", () => {
  it.each([
    ["Pending", "menunggu"], ["pending", "menunggu"], ["Processing", "berjalan"], ["In progress", "berjalan"], ["IN PROGRESS", "berjalan"],
    ["Completed", "selesai"], ["Partial", "sebagian"], ["Canceled", "dibatalkan"], ["Cancelled", "dibatalkan"],
    ["Fail", "gagal"], ["Failed", "gagal"], ["Error", "gagal"],
  ])("%s -> %s", (raw, expected) => expect(mapLikeoStatus(raw)).toBe(expected));
  it("unknown text maps to null", () => expect(mapLikeoStatus("Refunding soon")).toBeNull());
  it("remains and start_count come through", async () => {
    const s = await adapter(fakeFetch({ status: "Partial", start_count: "120", remains: "250", charge: "0.4", currency: "USD" }).impl).getOrderStatus("1");
    expect(s).toMatchObject({ status: "sebagian", startCount: 120, remains: 250, charge: 0.4, currency: "USD" });
  });
});

describe("robustness", () => {
  it("never retries `add` after a timeout (one call, ambiguous error)", async () => {
    const f = fakeFetch(Object.assign(new Error("aborted"), { name: "AbortError" }));
    const err = await adapter(f.impl).createOrder({ serviceId: "1", link: "https://a.b/c", quantity: 1 }).catch((e) => e);
    expect(f.calls).toHaveLength(1);
    expect(err).toMatchObject({ kind: "timeout", ambiguous: true });
  });
  it("really times out a hanging request", async () => {
    const hang = (async (_u: unknown, init?: RequestInit) => new Promise((_res, rej) => { init?.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))); })) as typeof fetch;
    const err = await adapter(hang, { timeoutMs: 20 }).createOrder({ serviceId: "1", link: "https://a.b/c", quantity: 1 }).catch((e) => e);
    expect(err).toMatchObject({ kind: "timeout", ambiguous: true });
  });
  it("does not retry `add` on a 5xx either", async () => {
    const f = fakeFetch(new Response("oops", { status: 502 }));
    await expect(adapter(f.impl).createOrder({ serviceId: "1", link: "https://a.b/c", quantity: 1 })).rejects.toMatchObject({ ambiguous: true });
    expect(f.calls).toHaveLength(1);
  });
  it("retries read calls up to 2 times on network errors and then succeeds", async () => {
    const f = fakeFetch(new TypeError("fetch failed"), new Response("x", { status: 503 }), { balance: "12.5", currency: "USD" });
    expect(await adapter(f.impl).getBalance()).toEqual({ balance: 12.5, currency: "USD" });
    expect(f.calls).toHaveLength(3);
  });
  it("gives up after 2 retries (3 calls) and does not retry a provider {error}", async () => {
    const f = fakeFetch(new TypeError("fetch failed"));
    await expect(adapter(f.impl).getBalance()).rejects.toMatchObject({ kind: "network" });
    expect(f.calls).toHaveLength(3);
    const g = fakeFetch({ error: "Invalid API key" });
    await expect(adapter(g.impl).getBalance()).rejects.toThrow("API key Likeo tidak valid");
    expect(g.calls).toHaveLength(1);
  });
});

describe("the key stays secret", () => {
  afterEach(() => vi.restoreAllMocks());
  it("is never in logs or error messages, even when the provider echoes it", async () => {
    const logged: string[] = [];
    const log = (event: string, meta: Record<string, unknown>) => logged.push(JSON.stringify({ event, meta }));
    const spies = (["log", "warn", "error", "info"] as const).map((m) => vi.spyOn(console, m).mockImplementation((...a) => { logged.push(a.map(String).join(" ")); }));
    const echo = fakeFetch({ error: `Invalid key ${KEY}` }, new Error(`connect failed for key=${KEY}`), new Response("boom", { status: 500 }));
    const a = adapter(echo.impl, { log });
    const messages: string[] = [];
    for (let i = 0; i < 3; i++) messages.push(await a.getServices().then(() => "", (e: Error) => e.message));
    expect(logged.length).toBeGreaterThan(0);
    for (const text of [...logged, ...messages]) expect(text).not.toContain(KEY);
    spies.forEach((s) => s.mockRestore());
  });
  it("is masked to the last 4 characters", () => {
    expect(maskApiKey(KEY).endsWith(KEY.slice(-4))).toBe(true);
    expect(maskApiKey(KEY)).not.toContain("SECRET");
    expect(maskApiKey("")).toBe("belum diatur");
    expect(redact(`x ${KEY} y`, KEY)).not.toContain("SECRET");
  });
  it("is not part of what the admin client receives, and no client file touches the provider config", () => {
    vi.stubEnv("LIKEO_API_KEY", KEY);
    const db = seedAdminDb();
    const json = JSON.stringify(db.providers.map(toPublicProvider));
    expect(json).not.toContain(KEY);
    expect(json).toContain(KEY.slice(-4));
    vi.unstubAllEnvs();
    const root = join(__dirname, "..", "..", "..", "..");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) { walk(p); continue; }
        if (!/\.(tsx?|mjs)$/.test(name)) continue;
        const src = readFileSync(p, "utf8");
        if (!/^["']use client["']/.test(src.trimStart())) continue;
        if (/LIKEO_API_KEY/.test(src) || /from "@\/lib\/server\/providers\/(config|likeo|client|mock)"/.test(src)) offenders.push(p);
      }
    };
    walk(join(root, "components"));
    walk(join(root, "app"));
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe("pricing", () => {
  afterEach(() => setPriceRounding(1));
  it("converts the provider rate (per 1000) to Rupiah, rounding the cost up", () => {
    expect(rateToRupiah(0.85, 16_000)).toBe(13_600);
    expect(rateToRupiah(0.04, 16_250)).toBe(650);
    expect(rateToRupiah(0.0001, 16_000)).toBe(2); // 1.6 rounds up
  });
  it("final price = cost * (1 + markup), rounded UP to the configured step", () => {
    const s = { providerPrice: 13_600, markupType: "persen" as const, markup: 40 };
    expect(finalPrice(s)).toBe(19_040);
    setPriceRounding(100);
    expect(finalPrice(s)).toBe(19_100);
    setPriceRounding(10);
    expect(finalPrice({ providerPrice: 1_001, markupType: "tetap", markup: 0 })).toBe(1_010);
    setPriceRounding(1);
    // floating point noise must not bump the price: 100 * 1.1 = 110.00000000000001
    expect(finalPrice({ providerPrice: 100, markupType: "persen", markup: 10 })).toBe(110);
  });
  it("flags services whose margin is below the minimum", () => {
    const db = seedAdminDb();
    db.settings.pricing.defaultMarkup = { markupType: "persen", markup: 2 };
    db.settings.pricing.minMarginPercent = 10;
    const preview = buildSyncPreview(db, LIKEO_ID, MOCK_CATALOG);
    expect(preview.changes.every((c) => c.thinMargin)).toBe(true);
    db.settings.pricing.defaultMarkup = { markupType: "persen", markup: 40 };
    expect(buildSyncPreview(db, LIKEO_ID, MOCK_CATALOG).changes.some((c) => c.thinMargin)).toBe(false);
  });
});

describe("catalogue sync", () => {
  let db: AdminDb;
  beforeEach(() => {
    db = seedAdminDb();
  });
  const local = () => db.services.filter((s) => s.providerId === LIKEO_ID);

  it("imports only Default services and lists the rest as unsupported", () => {
    const preview = buildSyncPreview(db, LIKEO_ID, MOCK_CATALOG);
    const supported = MOCK_CATALOG.filter((s) => isSupportedType(s.type));
    expect(preview.changes).toHaveLength(supported.length);
    expect(preview.unsupported.map((u) => u.type).sort()).toEqual(["Custom Comments", "Package", "Subscription"]);
    applyCatalog(db, LIKEO_ID, MOCK_CATALOG);
    expect(local()).toHaveLength(supported.length);
    expect(local().every((s) => s.imported && s.providerName)).toBe(true);
  });
  it("cleans names but keeps the original, and guesses platform and category", () => {
    applyCatalog(db, LIKEO_ID, MOCK_CATALOG);
    const s = local().find((x) => x.providerServiceId === "1001")!;
    expect(s.providerName).toBe("🔥 Instagram Followers | Real Mix | Refill 30D ⚡");
    expect(s.name).toBe("Instagram Followers | Real Mix | Refill 30D");
    expect(s.platform).toBe("instagram");
    expect(s.categoryLabel).toBe("Instagram Followers");
    expect(s.providerPrice).toBe(13_600);
    expect(platformFromCategory("Reddit Upvotes")).toBe("reddit");
    expect(platformFromCategory("Snapchat Views")).toBe("lainnya");
    expect(cleanServiceName("  ⚡ TikTok   Views ✅ ")).toBe("TikTok Views");
  });
  it("is idempotent: a second run with the same catalogue changes nothing", () => {
    applyCatalog(db, LIKEO_ID, MOCK_CATALOG);
    const again = buildSyncPreview(db, LIKEO_ID, MOCK_CATALOG);
    expect(again.changes).toEqual([]);
    const result = applyCatalog(db, LIKEO_ID, MOCK_CATALOG);
    expect(result).toMatchObject({ created: 0, raised: 0, lowered: 0, deactivated: 0 });
  });
  it("detects price rises and drops from the rate and records them for the users", () => {
    applyCatalog(db, LIKEO_ID, MOCK_CATALOG);
    const changed: ProviderServiceInfo[] = MOCK_CATALOG.map((s) => (s.id === "1001" ? { ...s, rate: 1.0 } : s.id === "1003" ? { ...s, rate: 0.2 } : s));
    const preview = buildSyncPreview(db, LIKEO_ID, changed);
    expect(preview.changes.map((c) => [c.providerServiceId, c.kind])).toEqual([["1001", "naik"], ["1003", "turun"]]);
    const before = db.priceUpdates.length;
    const r = applyCatalog(db, LIKEO_ID, changed);
    expect(r).toMatchObject({ raised: 1, lowered: 1 });
    expect(db.priceUpdates.length).toBe(before + 2);
  });
  it("a changed exchange rate changes the fingerprint", () => {
    const a = buildSyncPreview(db, LIKEO_ID, MOCK_CATALOG).fingerprint;
    db.settings.pricing.rateIdr = 17_000;
    expect(buildSyncPreview(db, LIKEO_ID, MOCK_CATALOG).fingerprint).not.toBe(a);
  });
  it("services the provider drops become nonaktif (never deleted) and come back when listed again", () => {
    applyCatalog(db, LIKEO_ID, MOCK_CATALOG);
    const count = local().length;
    const without = MOCK_CATALOG.filter((s) => s.id !== "1006");
    const preview = buildSyncPreview(db, LIKEO_ID, without);
    expect(preview.changes).toMatchObject([{ kind: "dihapus", providerServiceId: "1006" }]);
    expect(applyCatalog(db, LIKEO_ID, without).deactivated).toBe(1);
    const gone = local().find((s) => s.providerServiceId === "1006")!;
    expect(local()).toHaveLength(count);
    expect(gone).toMatchObject({ active: false, providerRemoved: true });
    expect(buildUserCatalog(db).services.some((s) => s.id === gone.id)).toBe(false);
    expect(applyCatalog(db, LIKEO_ID, MOCK_CATALOG).restored).toBe(1);
    expect(local().find((s) => s.providerServiceId === "1006")).toMatchObject({ active: true, providerRemoved: false });
  });
  it("new services get the category markup before the provider and default markup", () => {
    db.settings.pricing.categoryMarkups["TikTok Views"] = { markupType: "tetap", markup: 5_000 };
    db.settings.pricing.providerMarkups[LIKEO_ID] = { markupType: "persen", markup: 25 };
    applyCatalog(db, LIKEO_ID, MOCK_CATALOG);
    expect(local().find((s) => s.providerServiceId === "1006")).toMatchObject({ markupType: "tetap", markup: 5_000 });
    expect(local().find((s) => s.providerServiceId === "1003")).toMatchObject({ markupType: "persen", markup: 25 });
  });
  it("the user catalogue shows imported active services only, switched off with the provider", () => {
    applyCatalog(db, LIKEO_ID, MOCK_CATALOG);
    expect(buildUserCatalog(db).services.length).toBe(local().length);
    db.providers.find((p) => p.id === LIKEO_ID)!.status = "nonaktif";
    expect(buildUserCatalog(db).services).toEqual([]);
  });
});

// ---------------------------------------------------------------------------