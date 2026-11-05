import { describe, expect, it } from "vitest";
import { DEFAULT_CANCEL_POLICY } from "@/lib/order-rules";
import { computeExpectedRefund, computeUserCancelRefund } from "@/lib/server/rules";
import { COMPLAINT_WINDOW_DAYS, formatLegalDate, LEGAL_DOCS, LEGAL_PATHS, LEGAL_VERSION, PRIVACY, REFUND, TERMS, type LegalDoc } from "@/lib/legal-content";

const textOf = (doc: LegalDoc) =>
  doc.sections.flatMap((s) => s.blocks.flatMap((b) => (b.type === "p" || b.type === "placeholder" ? [b.text] : b.type === "ul" ? b.items : [b.title, ...b.lines]))).join("\n");

describe("legal content", () => {
  it("every doc has unique, URL-safe section ids and non-empty blocks", () => {
    for (const doc of LEGAL_DOCS) {
      const ids = doc.sections.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const s of doc.sections) {
        expect(s.id).toMatch(/^[a-z0-9-]+$/);
        expect(s.heading.trim()).not.toBe("");
        expect(s.blocks.length).toBeGreaterThan(0);
      }
      expect(doc.description.length).toBeGreaterThan(40);
    }
    expect(LEGAL_PATHS).toEqual({ terms: "/syarat-ketentuan", refund: "/kebijakan-refund", privacy: "/kebijakan-privasi" });
  });

  it("the version is a date and the label is formatted from it", () => {
    expect(LEGAL_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(formatLegalDate("2026-11-06")).toBe("6 November 2026");
  });

  it("the refund page quotes the numbers the system uses", () => {
    const t = textOf(REFUND);
    expect(DEFAULT_CANCEL_POLICY).toEqual({ minAgeHours: 72, refundPercent: 50 });
    expect(t).toContain(`${DEFAULT_CANCEL_POLICY.minAgeHours} jam`);
    expect(t).toContain(`${DEFAULT_CANCEL_POLICY.refundPercent}%`);
    expect(t).toContain(`${COMPLAINT_WINDOW_DAYS} hari`);
  });

  it("the worked examples equal what the refund rules compute (same functions as the sync and the cancel flow)", () => {
    // partial: charge 1500, quantity 1000, remains 250 -> 375; charge 1000, quantity 3, remains 1 -> 333 (floor of 333.33)
    expect(computeExpectedRefund({ status: "sebagian", charge: 1500, quantity: 1000, remains: 250 } as never)).toBe(375);
    expect(computeExpectedRefund({ status: "sebagian", charge: 1000, quantity: 3, remains: 1 } as never)).toBe(333);
    // user cancel: charge 1500, remains 600 of 1000 at 50% -> 450
    expect(computeUserCancelRefund({ charge: 1500, quantity: 1000, remains: 600 }, DEFAULT_CANCEL_POLICY.refundPercent)).toBe(450);
    const t = textOf(REFUND);
    expect(t).toContain("= Rp375");
    expect(t).toContain("= Rp333");
    expect(t).toContain("= Rp450");
  });

  it("internal links point to real legal pages and the deposit/region/retention gaps are visible placeholders", () => {
    const all = LEGAL_DOCS.map(textOf).join("\n");
    for (const m of all.matchAll(/\]\((\/[^)]+)\)/g)) expect(Object.values(LEGAL_PATHS)).toContain(m[1]);
    const placeholders = (doc: LegalDoc) => doc.sections.flatMap((s) => s.blocks).filter((b) => b.type === "placeholder").length;
    expect(placeholders(REFUND)).toBe(1); // deposit refunds
    expect(placeholders(PRIVACY)).toBe(2); // server region, retention period
    expect(placeholders(TERMS)).toBe(0);
  });
});
