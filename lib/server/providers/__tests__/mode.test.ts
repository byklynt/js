import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { seedAdminDb, type AdminDb } from "@/lib/admin-data";
import { createRateLimiter } from "../../limits";
import { placeOrder } from "../../orders";
import { ProviderError } from "../../provider-client";
import { checkLikeo, reconcileProviderMode } from "../balance";
import { buildUserCatalog } from "../catalog";
import { createProviderClient, getAdapter } from "../client";
import { describeConfig, LIKEO_ID, providerMode, resolveModeInfo } from "../config";
import { cleanPreview, formatProbe, probeBalance } from "../probe";

vi.mock("server-only", () => ({}));

const KEY = "lk_live_TOPSECRET_0123456789abcdef";
const URL_ = "https://likeo.example/api/v2";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const text = (body: string, status = 200) => new Response(body, { status, headers: { "Content-Type": "text/html" } });

function stubFetch(answer: Response | Error) {
  const fn = vi.fn(async () => {
    if (answer instanceof Error) throw answer;
    return answer.clone();
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("PROVIDER_MODE is the single source of truth", () => {
  it.each(["live", " LIVE ", '"live"', "Live"])("%j means live", (v) => {
    vi.stubEnv("PROVIDER_MODE", v);
    expect(providerMode()).toBe("live");
  });
  it.each(["", "mock", "production", "liv", "true"])("%j means mock", (v) => {
    vi.stubEnv("PROVIDER_MODE", v);
    expect(providerMode()).toBe("mock");
  });
  it("is read on every call, not cached", () => {
    vi.stubEnv("PROVIDER_MODE", "mock");
    expect(providerMode()).toBe("mock");
    vi.stubEnv("PROVIDER_MODE", "live");
    expect(providerMode()).toBe("live");
    vi.stubEnv("PROVIDER_MODE", "mock");
    expect(providerMode()).toBe("mock");
  });
  it("explains where the value comes from, and flags a value that is neither live nor mock", () => {
    vi.stubEnv("PROVIDER_MODE", "");
    expect(resolveModeInfo()).toMatchObject({ mode: "mock", source: expect.stringContaining("default mock") });
    vi.stubEnv("PROVIDER_MODE", "Live!");
    const info = resolveModeInfo();
    expect(info.mode).toBe("mock");
    expect(info.warning).toContain("tidak dikenal");
    vi.stubEnv("PROVIDER_MODE", "live");
    expect(resolveModeInfo()).toMatchObject({ mode: "live", warning: null });
  });
  it("the dev console line says whether a key exists but never contains it", () => {
    vi.stubEnv("PROVIDER_MODE", "live");
    vi.stubEnv("LIKEO_API_KEY", KEY);
    const line = describeConfig();
    expect(line).toContain("mode=live");
    expect(line).toContain("LIKEO_API_KEY terisi=true");
    expect(line).not.toContain(KEY);
    expect(line).not.toContain("TOPSECRET");
  });
});

describe("live mode uses the live adapter and never the mock", () => {
  let db: AdminDb;
  beforeEach(() => {
    db = seedAdminDb();
    vi.stubEnv("PROVIDER_MODE", "live");
    vi.stubEnv("LIKEO_API_KEY", KEY);
    vi.stubEnv("LIKEO_API_URL", URL_);
  });

  it("getAdapter returns the live adapter that really calls LIKEO_API_URL", async () => {
    const fetchSpy = stubFetch(json({ balance: "3.21", currency: "USD" }));
    const adapter = getAdapter(db);
    expect(adapter.mode).toBe("live");
    // 3.21 comes from the (stubbed) network; the mock would have answered 75.5
    expect(await adapter.getBalance()).toEqual({ balance: 3.21, currency: "USD" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(URL_);
    expect(new URLSearchParams(String(init.body)).get("action")).toBe("balance");
  });

  it("mock mode answers from the mock and does not touch the network", async () => {
    vi.stubEnv("PROVIDER_MODE", "mock");
    const fetchSpy = stubFetch(json({ balance: "3.21", currency: "USD" }));
    const adapter = getAdapter(db);
    expect(adapter.mode).toBe("mock");
    expect((await adapter.getBalance()).balance).toBe(75.5);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([["", "kosong"], ["isi_api_key_likeo_di_sini", "placeholder"]])("a missing key (%s) throws a clear error instead of falling back to mock", (value) => {
    vi.stubEnv("LIKEO_API_KEY", value);
    stubFetch(json({}));
    let error: unknown;
    try {
      getAdapter(db);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).kind).toBe("config");
    expect((error as ProviderError).message).toContain("LIKEO_API_KEY belum diisi");
  });

  it("the order/sync client does not silently use the mock when the key is missing", async () => {
    vi.stubEnv("LIKEO_API_KEY", "");
    const client = createProviderClient(db);
    await expect(client.addOrder(LIKEO_ID, { service: "1", link: "https://a.b/c", quantity: 10 })).rejects.toThrow("LIKEO_API_KEY");
    await expect(client.getBalance(LIKEO_ID)).rejects.toThrow("LIKEO_API_KEY");
    expect(Object.keys(db.providerOrders).filter((k) => k.startsWith("MK-"))).toEqual([]);
  });

  it("'Tes koneksi' / 'Segarkan' make one real request and report status, latency and the balance", async () => {
    reconcileProviderMode(db);
    const fetchSpy = stubFetch(json({ balance: "8.5", currency: "USD" }));
    const res = await checkLikeo(db, { force: true });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/HTTP 200 · \d+ ms · saldo 8,50 USD/);
    const p = db.providers.find((x) => x.id === LIKEO_ID)!;
    expect(p).toMatchObject({ balanceNative: 8.5, currency: "USD", dataMode: "live" });
    expect(p.balance).toBe(Math.round(8.5 * db.settings.pricing.rateIdr));
    expect(p.lastTest?.ok).toBe(true);
  });

  it("wrong key: shows the reason in Indonesian, the first 200 characters of the body, and never the key", async () => {
    reconcileProviderMode(db);
    stubFetch(json({ error: `Invalid API key ${KEY}` }));
    const res = await checkLikeo(db, { force: true });
    expect(res.ok).toBe(false);
    expect(res.probe?.reason).toBe("key_salah");
    expect(res.message).toContain("HTTP 200");
    expect(res.message).toContain("Respons:");
    expect(res.message).not.toContain(KEY);
    expect(res.message).not.toContain("TOPSECRET");
    // no fake balance appears after a failure
    expect(db.providers.find((x) => x.id === LIKEO_ID)!.balance).toBe(0);
  });

  it("wrong URL (HTML page / 404 / redirect), server error, timeout, network error and odd JSON each get their own reason", async () => {
    const reason = async (answer: Response | Error) => {
      stubFetch(answer);
      return probeBalance({ apiUrl: URL_, apiKey: KEY });
    };
    expect(await reason(text("<!DOCTYPE html><html><body>Not here</body></html>"))).toMatchObject({ reason: "format", httpStatus: 200 });
    expect(await reason(text("nope", 404))).toMatchObject({ reason: "url_salah", httpStatus: 404 });
    const moved = await reason(new Response("", { status: 301, headers: { Location: "https://likeo.example/api/v2/" } }));
    expect(moved).toMatchObject({ reason: "url_salah", httpStatus: 301 });
    expect(moved.message).toContain("dialihkan ke https://likeo.example/api/v2/");
    expect(await reason(text("denied", 403))).toMatchObject({ reason: "key_salah", httpStatus: 403 });
    expect(await reason(text("boom", 502))).toMatchObject({ reason: "server", httpStatus: 502 });
    expect(await reason(json({ hello: "world" }))).toMatchObject({ reason: "format" });
    expect(await reason(Object.assign(new Error("aborted"), { name: "AbortError" }))).toMatchObject({ reason: "timeout", httpStatus: null });
    const net = await reason(Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND likeo.example" } }));
    expect(net).toMatchObject({ reason: "jaringan", httpStatus: null });
    expect(net.message).toContain("ENOTFOUND");
    expect(await reason(json({ balance: "1.5", currency: "USD" }))).toMatchObject({ ok: true, balance: 1.5, currency: "USD" });
  });

  it("the response preview is cut at 200 characters and has the key removed", async () => {
    const long = `${KEY} ${"x".repeat(500)}`;
    const preview = cleanPreview(long, KEY);
    expect(preview.length).toBeLessThanOrEqual(200);
    expect(preview).not.toContain("TOPSECRET");
    stubFetch(text(`<html>${long}</html>`));
    const r = await probeBalance({ apiUrl: URL_, apiKey: KEY });
    expect(r.preview.length).toBeLessThanOrEqual(200);
    expect(formatProbe(r)).not.toContain("TOPSECRET");
  });
});

describe("demo providers and mock data in live mode", () => {
  it("live removes Provider Alfa/Beta/Gamma and clears the mock balance; mock keeps them", () => {
    const db = seedAdminDb();
    expect(db.providers.map((p) => p.id)).toContain("prv_1");
    reconcileProviderMode(db, "mock");
    expect(db.providers.length).toBe(4);
    expect(db.providers.find((p) => p.id === LIKEO_ID)!.balanceNative).toBe(75.5);

    reconcileProviderMode(db, "live");
    expect(db.providers.map((p) => p.id)).toEqual([LIKEO_ID]);
    const likeo = db.providers[0];
    expect(likeo).toMatchObject({ balance: 0, balanceAt: null, lastTest: null, dataMode: "live" });
    expect(likeo.balanceNative).toBeUndefined();
  });

  it("switching back to mock does not show live numbers as mock either (data is tagged with its mode)", () => {
    const db = seedAdminDb();
    reconcileProviderMode(db, "live");
    const p = db.providers[0];
    p.balanceNative = 8.5;
    p.balance = 136_000;
    p.dataMode = "live";
    reconcileProviderMode(db, "mock");
    expect(db.providers[0]).toMatchObject({ balance: 0, dataMode: "mock" });
  });

  it("demo services are hidden from users and cannot be ordered in live mode", async () => {
    const db = seedAdminDb();
    reconcileProviderMode(db, "live");
    const catalog = buildUserCatalog(db);
    expect(catalog.hiddenServiceIds.length).toBeGreaterThan(0);
    const demo = db.services.find((s) => !s.imported && s.active)!;
    expect(catalog.hiddenServiceIds).toContain(demo.id);
    await expect(
      placeOrder(db, { userId: "usr_1000", serviceId: demo.id, link: "https://instagram.com/x", quantity: demo.min }, { client: createProviderClient(db), sleep: async () => {}, limiter: createRateLimiter() })
    ).rejects.toThrow("Layanan tidak tersedia");
  });
});
