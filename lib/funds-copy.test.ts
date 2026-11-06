import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { depositFee, depositFeeLine, feeSummary, gatewayMethodHint, manualMethodHint, totalProblem } from "./funds-copy";

const merchant = { feeMode: "merchant", feeFlat: 200, feePercent: 0.7 } as const;
const customer = { feeMode: "customer", feeFlat: 0, feePercent: 1.1 } as const;
const split = { feeMode: "split", feeFlat: 500, feePercent: 1 } as const;
const bare = (s: string | null) => (s ?? "").replace(/\u00a0/g, " ");

describe("method hints", () => {
  it("never mention fees", () => {
    for (const h of [gatewayMethodHint, manualMethodHint]) expect(h).not.toMatch(/biaya|gratis/i);
    expect(gatewayMethodHint).toBe("otomatis");
  });
});

describe("feeSummary", () => {
  it("no fee for the customer: no line at all (nothing is claimed)", () => {
    expect(feeSummary(merchant, 50_000)).toBeNull(); // merchant bears it, switch off
    expect(feeSummary({ feeMode: "merchant", feeFlat: 0, feePercent: 0 }, 50_000, undefined, true)).toBeNull(); // switch on but the channel has no fee
  });
  it("switch ON on a merchant channel: exact numbers, no approximation sign", () => {
    expect(bare(feeSummary(merchant, 10_000, undefined, true))).toBe("Biaya layanan Rp 272. Total bayar Rp 10.272, saldo masuk Rp 10.000.");
    expect(bare(feeSummary(merchant, 50_000, undefined, true))).toBe("Biaya layanan Rp 554. Total bayar Rp 50.554, saldo masuk Rp 50.000.");
    expect(feeSummary(merchant, 10_000, undefined, true)).not.toMatch(/±|maksimal/);
  });
  it("customer-borne channel: Paymenku's own quote is the source, so the numbers are marked as an estimate", () => {
    const t = bare(feeSummary(customer, 50_000));
    expect(t).toContain("Biaya layanan ± Rp 550");
    expect(t).toContain("Total bayar ± Rp 50.550");
    expect(t).toContain("saldo masuk Rp 50.000");
  });
  it("split is an upper bound", () => {
    expect(bare(feeSummary(split, 100_000))).toContain("maksimal Rp 1.500");
  });
  it("unknown: nothing instead of a guess", () => {
    expect(feeSummary(null, 50_000)).toBeNull(); // manual transfer / no channel
    expect(feeSummary(customer, 0)).toBeNull();
    expect(feeSummary(customer, Number.NaN)).toBeNull();
    expect(feeSummary(customer, 5_000, { min: 10_000, max: 1_000_000 })).toBeNull(); // below the minimum: the limit message shows instead
    expect(feeSummary(customer, 2_000_000, { min: 10_000, max: 1_000_000 })).toBeNull();
  });
  it("never claims 'free of fees'", () => {
    for (const ch of [merchant, customer, split]) for (const on of [true, false]) expect(feeSummary(ch, 25_000, undefined, on) ?? "").not.toMatch(/tanpa biaya|gratis|bebas biaya/i);
  });
});

describe("totalProblem (pass-through only)", () => {
  const ch = { name: "QRIS", ...merchant, minAmount: 1_000, maxAmount: 10_000 };
  it("the grossed-up total must fit the channel", () => {
    expect(totalProblem(ch, 10_000, true)).toMatch(/melebihi batas QRIS/);
    expect(totalProblem(ch, 9_000, true)).toBeNull(); // 9.000 + fee is still under 10.000
    expect(totalProblem(ch, 10_000, false)).toBeNull(); // switch off: the base fits
    expect(totalProblem(null, 10_000, true)).toBeNull();
    expect(totalProblem({ ...ch, feeMode: "customer" }, 10_000, true)).toBeNull(); // not a pass-through channel
  });
});

describe("stored deposits", () => {
  it("states a fee only when the stored amounts show one", () => {
    expect(depositFeeLine({ amount: 50_000, payAmount: 50_000, feeAmount: 0 })).toBeNull();
    expect(depositFeeLine({ amount: 50_000, payAmount: 50_000 })).toBeNull();
    expect(bare(depositFeeLine({ amount: 50_000, payAmount: 50_550, feeAmount: 550 }))).toBe("Biaya layanan Rp 550");
    expect(depositFeeLine({ amount: 50_000, payAmount: 50_000, feeAmount: 550 })).toBeNull(); // inconsistent: say nothing
    expect(depositFeeLine({ amount: 50_000, payAmount: 49_000, feeAmount: 0 })).toBeNull();
    expect(depositFeeLine({ amount: 50_000, payAmount: Number.NaN })).toBeNull();
  });
  it("depositFee reports kind and amount", () => {
    expect(depositFee({ amount: 100, payAmount: 130 })).toEqual({ kind: "fee", fee: 30 });
    expect(depositFee({ amount: 100, payAmount: 100, feeAmount: 0 })).toEqual({ kind: "none", fee: 0 });
  });
});

// The phrase must not exist in anything a customer can read: pages, components, server text, SQL notifications, docs. Tests may mention it (to assert its absence).
describe('no "tanpa biaya" claim anywhere in the product text', () => {
  const ROOTS = ["app", "components", "lib", "docs", "supabase/migrations"];
  const SKIP = new Set(["node_modules", ".next", "__tests__"]);
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      if (SKIP.has(name)) return [];
      const p = join(dir, name);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
  it("finds none", () => {
    const hits: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        if (!/\.(tsx?|md|sql|json|mjs)$/.test(file) || /\.test\.tsx?$/.test(file) || file.endsWith("mobile-audit.md")) continue;
        const text = readFileSync(file, "utf8");
        if (/tanpa biaya|biaya tambahan/i.test(text)) hits.push(file);
      }
    }
    expect(hits).toEqual([]);
  });
});
