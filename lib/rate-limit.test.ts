import { afterEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/supabase-admin", () => ({ supabaseAdmin: () => ({ rpc }) }));

const { hitRateLimit } = await import("./rate-limit");

afterEach(() => { rpc.mockReset(); vi.restoreAllMocks(); });

describe("hitRateLimit", () => {
  it("a limiter failure (bad key / RPC error) refuses fail-closed, says so, and logs the underlying error", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST301", message: "Invalid API key" }, status: 401 });
    const r = await hitRateLimit("login:1.2.3.4:tstercoba", 5, 900);
    expect(r.allowed).toBe(false);
    expect(r.failure).toEqual({ code: "PGRST301", message: "Invalid API key", status: 401 });
    const line = String(err.mock.calls[0]?.[0]);
    expect(line).toContain("LIMITER FAILED");
    expect(line).toContain("Invalid API key");
    expect(line).not.toContain("1.2.3.4"); // only the key kind is logged for failures
  });
  it("an empty answer counts as a failure too", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    rpc.mockResolvedValue({ data: [], error: null, status: 200 });
    expect((await hitRateLimit("login:x:y", 5, 900)).failure?.code).toBe("EMPTY");
  });
  it("a real block has no failure field and carries the retry time", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    rpc.mockResolvedValue({ data: [{ allowed: false, retry_after: 240 }], error: null, status: 200 });
    expect(await hitRateLimit("login:x:y", 5, 900)).toEqual({ allowed: false, retryAfterSeconds: 240 });
  });
  it("allowed attempts pass", async () => {
    rpc.mockResolvedValue({ data: [{ allowed: true, retry_after: 0 }], error: null, status: 200 });
    expect((await hitRateLimit("k", 5, 900)).allowed).toBe(true);
  });
});
