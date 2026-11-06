import { describe, expect, it, vi } from "vitest";
import { LIKEO_ID } from "../config";
import { createLikeoAdapter } from "../likeo";
import { isSupportedType } from "../catalog";
import { createMockAdapter } from "../mock";
import { createEmptyDb } from "@/lib/admin-data";

vi.mock("server-only", () => ({}));

const KEY = "lk_live_SECRETKEY_9f3c71d2b84e";
function fake(answer: unknown) {
  const calls: URLSearchParams[] = [];
  const impl = (async (_u: string, init?: RequestInit) => {
    calls.push(new URLSearchParams(String(init?.body ?? "")));
    return new Response(JSON.stringify(answer), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  return { impl, calls };
}
const make = (f: typeof fetch, customComments?: boolean) =>
  createLikeoAdapter({ apiUrl: "https://likeo.example/api/v2", apiKey: KEY, fetchImpl: f, sleep: async () => {}, log: () => {}, customComments });

describe("Likeo adapter: Custom Comments (format verified live on 2026-11-06; flag-gated)", () => {
  it("is refused (definite, nothing sent) unless the flag is on", async () => {
    const f = fake({ order: 1 });
    await expect(make(f.impl).createOrder({ serviceId: "26500", link: "https://x.com/a", quantity: 2, comments: ["a", "b"] })).rejects.toMatchObject({ kind: "config", ambiguous: false });
    expect(f.calls).toHaveLength(0);
  });
  it("sends service, link and the comments joined by newlines (no quantity) when the flag is on", async () => {
    const f = fake({ order: 77 });
    const out = await make(f.impl, true).createOrder({ serviceId: "26500", link: "https://x.com/a", quantity: 3, comments: ["Keren", "Mantap", "Top"] });
    expect(out.orderId).toBe("77");
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].get("action")).toBe("add");
    expect(f.calls[0].get("comments")).toBe("Keren\nMantap\nTop");
    expect(f.calls[0].has("quantity")).toBe(false);
  });
  it("a normal order is unchanged: quantity, no comments", async () => {
    const f = fake({ order: 5 });
    await make(f.impl).createOrder({ serviceId: "1", link: "https://x.com/a", quantity: 100 });
    expect(f.calls[0].get("quantity")).toBe("100");
    expect(f.calls[0].has("comments")).toBe(false);
  });
  it("an unreadable answer is ambiguous (never retried)", async () => {
    const f = fake({ nonsense: true });
    await expect(make(f.impl, true).createOrder({ serviceId: "26500", link: "https://x.com/a", quantity: 1, comments: ["a"] })).rejects.toMatchObject({ ambiguous: true });
    expect(f.calls).toHaveLength(1);
  });
});

describe("mock provider and sync filter", () => {
  it("the mock checks that the comment count equals the quantity", async () => {
    const mock = createMockAdapter(createEmptyDb(), LIKEO_ID);
    await expect(mock.createOrder({ serviceId: "1001", link: "https://x.com/a", quantity: 3, comments: ["a", "b"] })).rejects.toThrow(/jumlah komentar/i);
    await expect(mock.createOrder({ serviceId: "1005", link: "https://x.com/a", quantity: 2, comments: ["a", "b"] })).resolves.toMatchObject({ orderId: expect.stringMatching(/^MK-/) });
  });
  it("Default and Custom Comments are imported; the packages and every other type are not", () => {
    for (const t of ["Default", "", "Custom Comments", " custom comments "]) expect(isSupportedType(t), t).toBe(true);
    for (const t of ["Custom Comments Package", "Package", "Subscriptions", "Poll", "Mentions Custom List", "Mentions Hashtag", "Comment Likes", "Web Traffic", "SEO", "Invites from Groups"]) {
      expect(isSupportedType(t), t).toBe(false);
    }
  });
});
