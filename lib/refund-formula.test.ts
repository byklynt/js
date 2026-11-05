import { describe, expect, it } from "vitest";
import { refundFormula } from "./refund-formula";

const base = { charge: 1500, quantity: 1000, remains: 250 };
describe("refundFormula", () => {
  it("partial floors, never rounds up", () => {
    expect(refundFormula({ ...base, reason: "sebagian", amount: 375 })).toMatchObject({ result: 375, matches: true });
    expect(refundFormula({ charge: 1000, quantity: 3, remains: 1, reason: "sebagian", amount: 333 })).toMatchObject({ result: 333, matches: true });
  });
  it("cancel / failed = full charge", () => {
    expect(refundFormula({ ...base, reason: "dibatalkan", amount: 1500 }).result).toBe(1500);
    expect(refundFormula({ ...base, reason: "gagal_kirim", amount: 1500 }).matches).toBe(true);
  });
  it("user cancel applies the policy percent", () => {
    expect(refundFormula({ charge: 1500, quantity: 1000, remains: 1000, reason: "user_cancel", amount: 750, percent: 50 })).toMatchObject({ result: 750, matches: true });
  });
  it("manual is not a formula and flags a mismatch for others", () => {
    expect(refundFormula({ ...base, reason: "manual", amount: 99 })).toMatchObject({ result: null, matches: null });
    expect(refundFormula({ ...base, reason: "sebagian", amount: 400 }).matches).toBe(false);
  });
  it("clamps remains and handles quantity 0 without dividing by zero", () => {
    expect(refundFormula({ charge: 1500, quantity: 1000, remains: 5000, reason: "sebagian", amount: 1500 }).result).toBe(1500);
    expect(refundFormula({ charge: 1500, quantity: 0, remains: 0, reason: "sebagian", amount: 0 }).result).toBe(0);
  });
});
