/** Human-readable audit trail of how a refund amount follows from the order numbers. Pure (safe in client components). */
export type RefundFormulaInput = {
  reason: "dibatalkan" | "sebagian" | "gagal_kirim" | "manual" | "user_cancel";
  amount: number;
  charge: number;
  quantity: number;
  remains: number;
  /** Cancel-policy percent (user_cancel only). */
  percent?: number | null;
};
export type RefundFormula = { text: string; result: number | null; matches: boolean | null };

const n = (v: number) => v.toLocaleString("id-ID");
const rp = (v: number) => `Rp${n(v)}`;

/** `result` is what the formula gives for the current order numbers; `matches` compares it with the refund that was actually created (null for manual refunds). */
export function refundFormula(r: RefundFormulaInput): RefundFormula {
  const remains = Math.min(Math.max(r.remains, 0), Math.max(r.quantity, 0));
  const base = `charge ${rp(r.charge)}, jumlah ${n(r.quantity)}, sisa ${n(r.remains)}`;
  if (r.reason === "manual") return { text: `${base}. Nominal manual dari admin: ${rp(r.amount)} (bukan hasil rumus).`, result: null, matches: null };
  let result: number;
  let how: string;
  if (r.reason === "dibatalkan" || r.reason === "gagal_kirim") {
    result = r.charge;
    how = `refund penuh = charge = ${rp(result)}`;
  } else if (r.reason === "sebagian") {
    result = r.quantity > 0 ? Math.min(r.charge, Math.floor((r.charge * remains) / r.quantity)) : 0;
    how = `floor(${n(r.charge)} x ${n(remains)} / ${n(r.quantity)}) = ${rp(result)}`;
  } else {
    const p = r.percent ?? 0;
    result = r.quantity > 0 && p > 0 ? Math.max(0, Math.min(Math.floor((r.charge * remains * p) / (r.quantity * 100)), r.charge)) : 0;
    how = `floor(${n(r.charge)} x ${n(remains)} x ${p}% / ${n(r.quantity)}) = ${rp(result)}`;
  }
  return { text: `${base}. Rumus: ${how}.`, result, matches: result === r.amount };
}
