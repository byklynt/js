import { describe, expect, it } from "vitest";
import { depositFee, depositFeeLine, feeSummary, gatewayMethodHint, manualMethodHint } from "./funds-copy";

const merchant = { feeMode: "merchant", feeFlat: 0, feePercent: 0.7 } as const;
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
  it("fee 0 (merchant bears it): no extra fee, balance credited", () => {
    expect(bare(feeSummary(merchant, 50_000))).toBe("Tanpa biaya tambahan. Saldo masuk Rp 50.000.");
  });
  it("fee > 0: fee, total and credited amount", () => {
    const t = bare(feeSummary(customer, 50_000));
    expect(t).toContain("Biaya layanan");
    expect(t).toContain("Rp 550");
    expect(t).toContain("Total bayar ± Rp 50.550");
    expect(t).toContain("saldo masuk Rp 50.000");
    expect(t).not.toMatch(/tanpa biaya/i);
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
});

describe("stored deposits", () => {
  it("claims no fee only when the stored amounts say so", () => {
    expect(depositFeeLine({ amount: 50_000, payAmount: 50_000, feeAmount: 0 })).toBe("Tanpa biaya tambahan");
    expect(depositFeeLine({ amount: 50_000, payAmount: 50_000 })).toBe("Tanpa biaya tambahan");
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
