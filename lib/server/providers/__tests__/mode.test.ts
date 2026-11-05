import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type AdminDb } from "@/lib/admin-data";
import { seedDemoDb as seedAdminDb } from "@/lib/dev/demo-seed";
import { placeOrder } from "../../orders";
import { ProviderError } from "../../provider-client";
import { buildUserCatalog } from "../catalog";
import { createProviderClient, getAdapter } from "../client";
import { describeConfig, LIKEO_ID, providerMode, resolveModeInfo, supabaseTargetRef } from "../config";
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

const DEV = "eoaagocvdclaxxzxsbjr";
const PROD = "prodprodprodprodprod";
const OTHER = "otherotherotherother";
const at = (ref: string) => `https://${ref}.supabase.co`;
/** One environment: the target project, which project is approved for the real provider, the requested mode, the build type. */
function env(o: { url?: string; approved?: string; mode?: string; nodeEnv?: string; dev?: string }) {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", o.url ?? "");
  vi.stubEnv("PROVIDER_LIVE_APPROVED_REF", o.approved ?? "");
  vi.stubEnv("SUPABASE_DEV_PROJECT_REF", o.dev ?? DEV);
  vi.stubEnv("NODE_ENV", o.nodeEnv ?? "test");
  if (o.mode === undefined) vi.stubEnv("PROVIDER_MODE", "");
  else vi.stubEnv("PROVIDER_MODE", o.mode);
}

describe("the provider mode: real calls only from a project that is explicitly approved, mock by default everywhere else", () => {
  it.each(["live", " LIVE ", '"live"', "Live"])("approved project + PROVIDER_MODE %j means live", (v) => {
    env({ url: at(PROD), approved: PROD, mode: v });
    expect(providerMode()).toBe("live");
  });
  it("an approved project never fakes data: anything but live is off", () => {
    for (const mode of ["mock", "", "demo", "liv"]) {
      env({ url: at(PROD), approved: PROD, mode });
      expect(providerMode(), mode).toBe("off");
    }
  });
  it("PROVIDER_MODE=live is NOT enough: another project, no approval, or a different approved ref all fall back to mock", () => {
    env({ url: at(DEV), mode: "live" }); // nothing approved
    expect(providerMode()).toBe("mock");
    env({ url: at(DEV), approved: PROD, mode: "live" }); // the approval is for another project
    expect(providerMode()).toBe("mock");
    env({ url: at(OTHER), approved: PROD, mode: "live", nodeEnv: "development" });
    expect(providerMode()).toBe("mock");
    env({ url: "http://127.0.0.1:54321", approved: PROD, mode: "live" }); // local stack
    expect(providerMode()).toBe("mock");
    env({ url: "", approved: PROD, mode: "live" }); // no URL at all
    expect(providerMode()).toBe("mock");
  });
  it("the dev project can be approved on purpose (real Likeo calls from dev), and only then", () => {
    env({ url: at(DEV), approved: DEV, mode: "live" });
    expect(providerMode()).toBe("live");
  });
  it.each(["", "production", "liv", "true", "demo", "mock"])("mock is the default for dev, tests and local: PROVIDER_MODE %j -> mock", (v) => {
    env({ url: at(DEV), mode: v });
    expect(providerMode()).toBe("mock");
    env({ url: "", mode: v });
    expect(providerMode()).toBe("mock");
  });
  it("a production build against a project that is not the dev one and not approved fakes nothing and spends nothing: off", () => {
    env({ url: at(PROD), nodeEnv: "production", mode: "mock" });
    expect(providerMode()).toBe("off");
    env({ url: at(PROD), nodeEnv: "production", mode: "live" });
    expect(providerMode()).toBe("off");
    env({ url: at(PROD), nodeEnv: "production" });
    expect(providerMode()).toBe("off");
    // ... while the e2e run (production build, dev project) keeps working with mock
    env({ url: at(DEV), nodeEnv: "production", mode: "mock" });
    expect(providerMode()).toBe("mock");
  });
  it("is read on every call, not cached", () => {
    env({ url: at(PROD), approved: PROD, mode: "live" });
    expect(providerMode()).toBe("live");
    env({ url: at(PROD), approved: PROD, mode: "mock" });
    expect(providerMode()).toBe("off");
    env({ url: at(DEV), mode: "mock" });
    expect(providerMode()).toBe("mock");
  });
  it("the project ref comes from an exact supabase.co host only", () => {
    expect(supabaseTargetRef(at(DEV))).toBe(DEV);
    expect(supabaseTargetRef("https://" + DEV + ".supabase.co.evil.com")).toBeNull();
    expect(supabaseTargetRef("http://" + DEV + ".supabase.co")).toBeNull();
    expect(supabaseTargetRef("https://evil.com/" + DEV + ".supabase.co")).toBeNull();
    expect(supabaseTargetRef("not a url")).toBeNull();
  });
  it("explains why the real provider was refused, and flags a value that is neither live nor mock", () => {
    env({ url: at(DEV), mode: "live" });
    const refused = resolveModeInfo();
    expect(refused.mode).toBe("mock");
    expect(refused.warning).toContain("belum disetujui");
    expect(refused.warning).toContain("PROVIDER_LIVE_APPROVED_REF");
    expect(refused.warning).toContain("TIDAK dipanggil");
    env({ url: at(DEV), mode: "Live!" });
    expect(resolveModeInfo().warning).toContain("tidak dikenal");
    env({ url: at(PROD), approved: PROD, mode: "live" });
    expect(resolveModeInfo()).toMatchObject({ mode: "live", warning: null });
    env({ url: at(PROD), approved: PROD, mode: "" });
    expect(resolveModeInfo()).toMatchObject({ mode: "off" });
    expect(resolveModeInfo().warning).toContain("provider mati");
    env({ url: at(DEV), mode: "" });
    expect(resolveModeInfo()).toMatchObject({ mode: "mock", warning: null });
  });
  it("the dev console line says whether a key exists but never contains it", () => {
    env({ url: at(PROD), approved: PROD, mode: "live" });
    vi.stubEnv("LIKEO_API_KEY", KEY);
    const line = describeConfig();
    expect(line).toContain("mode=live");
    expect(line).toContain("LIKEO_API_KEY terisi=true");
    expect(line).not.toContain(KEY);
    expect(line).not.toContain("TOPSECRET");
  });
});
