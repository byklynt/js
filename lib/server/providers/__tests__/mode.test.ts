import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type AdminDb } from "@/lib/admin-data";
import { seedDemoDb as seedAdminDb } from "@/lib/dev/demo-seed";
import { placeOrder } from "../../orders";
import { ProviderError } from "../../provider-client";
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
  it("mock exists only when it is selected explicitly", () => {
    vi.stubEnv("PROVIDER_MODE", "mock");
    expect(providerMode()).toBe("mock");
  });
  it.each(["", "production", "liv", "true", "demo"])("%j means off: nothing is faked", (v) => {
    vi.stubEnv("PROVIDER_MODE", v);
    expect(providerMode()).toBe("off");
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
    expect(resolveModeInfo()).toMatchObject({ mode: "off", source: expect.stringContaining("belum aktif") });
    vi.stubEnv("PROVIDER_MODE", "Live!");
    const info = resolveModeInfo();
    expect(info.mode).toBe("off");
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
