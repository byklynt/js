import { describe, expect, it, vi } from "vitest";
import { createEmptyDb } from "@/lib/admin-data";
import { ProviderError } from "../../provider-client";
import { cancelStateFromStatus, createLikeoAdapter, mapRefillStatus } from "../likeo";
import { createMockAdapter } from "../mock";

vi.mock("server-only", () => ({}));

const KEY = "lk_live_SECRETKEY_9f3c71d2b84e";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
function fakeFetch(...answers: unknown[]) {
  const calls: URLSearchParams[] = [];
  let i = 0;
  const impl = (async (_u: string | URL | Request, init?: RequestInit) => {
    calls.push(new URLSearchParams(String(init?.body ?? "")));
    const a = answers[Math.min(i++, answers.length - 1)];
    return a instanceof Response ? a : json(a);
  }) as typeof fetch;
  return { impl, calls };
}
const adapter = (f: typeof fetch) => createLikeoAdapter({ apiUrl: "https://likeo.example/api/v2", apiKey: KEY, fetchImpl: f, sleep: async () => {}, log: () => {} });

describe("refill status mapping", () => {
  it.each([
    ["Pending", "menunggu"], ["In progress", "berjalan"], ["Processing", "berjalan"], ["Completed", "selesai"],
    ["Rejected", "ditolak"], ["Error", "ditolak"], ["Failed", "ditolak"], ["Canceled", "ditolak"],
  ])("%s -> %s", (raw, state) => expect(mapRefillStatus(raw)).toBe(state));
  it("unknown text keeps the old state (null)", () => expect(mapRefillStatus("Weird status")).toBeNull());
});

describe("cancel outcome from the order status", () => {
  it.each([["Canceled", "confirmed"], ["Completed", "rejected"], ["Partial", "rejected"], ["Fail", "rejected"], ["Pending", "pending"], ["In progress", "pending"], ["???", "pending"]])("%s -> %s", (raw, state) =>
    expect(cancelStateFromStatus(raw)).toBe(state));
});

describe("Likeo adapter: refill_status (PerfectPanel multi form)", () => {
  it("sends action=refill_status with the ids and maps every row, including errors and missing ids", async () => {
    const f = fakeFetch([{ refill: "11", status: "Completed" }, { refill: "12", status: "In progress" }, { refill: "13", status: { error: "Incorrect refill ID" } }]);
    const res = await adapter(f.impl).getRefillStatuses(["11", "12", "13", "14"]);
    expect(f.calls[0].get("action")).toBe("refill_status");
    expect(f.calls[0].get("refills")).toBe("11,12,13,14");
    expect(res["11"]).toMatchObject({ ok: true, state: "selesai" });
    expect(res["12"]).toMatchObject({ ok: true, state: "berjalan" });
    expect(res["13"]).toMatchObject({ ok: false });
    expect(res["14"]).toMatchObject({ ok: false });
  });
  it("accepts the single-id form {status}", async () => {
    const f = fakeFetch({ status: "Rejected" });
    expect((await adapter(f.impl).getRefillStatuses(["7"]))["7"]).toMatchObject({ ok: true, state: "ditolak" });
  });
  it("a provider error body is a ProviderError, never a made-up status, and the key never appears in it", async () => {
    const f = fakeFetch({ error: "Incorrect request" });
    const err = await adapter(f.impl).getRefillStatuses(["1"]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(String((err as Error).message)).not.toContain(KEY);
  });
  it("batches in groups of 100 ids", async () => {
    const ids = Array.from({ length: 150 }, (_, i) => String(i + 1));
    const f = fakeFetch([], []);
    await adapter(f.impl).getRefillStatuses(ids);
    expect(f.calls).toHaveLength(2);
    expect(f.calls[0].get("refills")!.split(",")).toHaveLength(100);
  });
});

describe("Likeo adapter: cancel outcome", () => {
  it("derives confirmed / rejected / pending from the batch order status", async () => {
    const f = fakeFetch({ "1": { status: "Canceled", remains: "10", start_count: "0" }, "2": { status: "Completed", remains: "0", start_count: "5" }, "3": { status: "In progress", remains: "5", start_count: "5" }, "4": { error: "Incorrect order ID" } });
    const res = await adapter(f.impl).getCancelStatuses(["1", "2", "3", "4"]);
    expect(f.calls[0].get("action")).toBe("status");
    expect(res["1"]).toMatchObject({ ok: true, state: "confirmed" });
    expect(res["2"]).toMatchObject({ ok: true, state: "rejected" });
    expect(res["3"]).toMatchObject({ ok: true, state: "pending" });
    expect(res["4"]).toMatchObject({ ok: false });
  });
});

describe("mock provider (PROVIDER_MODE=mock)", () => {
  it("refill lifecycle: In progress on the first read, Completed on the second; unknown ids are errors; REJECT ids end rejected", async () => {
    const a = createMockAdapter(createEmptyDb());
    expect((await a.getRefillStatuses(["MKR-A1"]))["MKR-A1"]).toMatchObject({ state: "berjalan" });
    expect((await a.getRefillStatuses(["MKR-A1"]))["MKR-A1"]).toMatchObject({ state: "selesai" });
    expect((await a.getRefillStatuses(["MKR-REJECT-1"]))["MKR-REJECT-1"]).toMatchObject({ state: "ditolak" });
    expect((await a.getRefillStatuses(["nonsense"])).nonsense).toMatchObject({ ok: false });
  });
  it("cancel: an active order is cancelled and confirmed on the next read; a completed one is refused", async () => {
    const db = createEmptyDb();
    db.providerOrders["MK-1"] = { status: "Pending", startCount: 0, remains: 100 };
    db.providerOrders["MK-2"] = { status: "Completed", startCount: 0, remains: 0 };
    const a = createMockAdapter(db);
    expect((await a.requestCancel(["MK-1", "MK-2", "MK-3"]))).toMatchObject({ "MK-1": { ok: true }, "MK-2": { ok: false }, "MK-3": { ok: false } });
    const s = await a.getCancelStatuses(["MK-1", "MK-2"]);
    expect(s["MK-1"]).toMatchObject({ ok: true, state: "confirmed" });
    expect(s["MK-2"]).toMatchObject({ ok: true, state: "rejected" });
  });
});
