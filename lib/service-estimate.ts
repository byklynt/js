/**
 * Delivery-time estimates per service. Pure and client-safe (used by the server, the catalogue cards, the order form and the tests).
 *
 * The numbers come from service_completion_stats (maintained in SQL, see migration 27): median / p25 / p75 of the most recent N
 * completed orders, service-wide and per quantity bucket. This module only decides WHAT to show and HOW to word it.
 */

export type QuantityBucket = "small" | "medium" | "large";
export type BucketStats = { n: number; med: number; p25: number; p75: number };
export type EstimateStats = {
  /** Number of orders behind the service-wide numbers. */
  n: number;
  med: number;
  p25: number;
  p75: number;
  /** Minimum sample count before the measured estimate is shown (site setting, default 3). */
  ms: number;
  buckets?: Partial<Record<QuantityBucket, BucketStats>>;
  /** Manual text from an admin ("5 - 15 menit"). */
  override?: string;
};

export const DEFAULT_MIN_SAMPLES = 3;
export const DEFAULT_WINDOW = 20;
/** With this many samples the p25-p75 range is shown instead of the median. */
export const RANGE_MIN_SAMPLES = 5;
/** The quantity bucket is used only when the service has at least this many samples overall ... */
export const BUCKET_MIN_TOTAL = 5;
/** ... and the bucket itself has at least this many. */
export const BUCKET_MIN_SAMPLES = 3;
export const NO_ESTIMATE = "Belum ada estimasi";

export function quantityBucket(quantity: number): QuantityBucket {
  return quantity <= 1000 ? "small" : quantity <= 10_000 ? "medium" : "large";
}

/** Same definition as Postgres percentile_cont (linear interpolation). `sorted` ascending. */
export function percentileCont(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Postgres round(double precision) rounds halves to the even neighbour (rint): 322.5 -> 322, 323.5 -> 324. */
export function roundHalfEven(x: number): number {
  const f = Math.floor(x);
  const diff = x - f;
  if (diff < 0.5) return f;
  if (diff > 0.5) return f + 1;
  return f % 2 === 0 ? f : f + 1;
}

/** Reference implementation of what the SQL function stores: median / p25 / p75 (whole seconds) of the given durations. */
export function summarizeDurations(seconds: number[]): { n: number; median: number; p25: number; p75: number } | null {
  const valid = seconds.filter((s) => Number.isFinite(s) && s > 0).sort((a, b) => a - b);
  if (valid.length === 0) return null;
  return { n: valid.length, median: roundHalfEven(percentileCont(valid, 0.5)), p25: roundHalfEven(percentileCont(valid, 0.25)), p75: roundHalfEven(percentileCont(valid, 0.75)) };
}

type Parts = { days: number; hours: number; minutes: number };

/** Whole minutes -> days / hours / minutes, minutes rounded to 5 from one hour up, hours rounded once days are involved. */
function split(totalSeconds: number): Parts {
  let minutes = Math.max(1, Math.round(totalSeconds / 60));
  if (minutes < 60) return { days: 0, hours: 0, minutes };
  if (minutes < 24 * 60) {
    minutes = Math.round(minutes / 5) * 5;
    return { days: 0, hours: Math.floor(minutes / 60), minutes: minutes % 60 };
  }
  const hoursTotal = Math.round(minutes / 60);
  return { days: Math.floor(hoursTotal / 24), hours: hoursTotal % 24, minutes: 0 };
}

/** "7 menit", "2 jam 10 menit", "1 hari", "1 hari 6 jam". Never zero ("1 menit" at least). */
export function formatDuration(seconds: number): string {
  const { days, hours, minutes } = split(seconds);
  const out: string[] = [];
  if (days) out.push(`${days} hari`);
  if (hours) out.push(`${hours} jam`);
  if (minutes) out.push(`${minutes} menit`);
  return out.join(" ");
}

/** "± 7 menit". */
export const formatApprox = (seconds: number) => `± ${formatDuration(seconds)}`;

const single = (p: Parts): { value: number; unit: string } | null => {
  if (p.days && !p.hours && !p.minutes) return { value: p.days, unit: "hari" };
  if (p.hours && !p.days && !p.minutes) return { value: p.hours, unit: "jam" };
  if (p.minutes && !p.days && !p.hours) return { value: p.minutes, unit: "menit" };
  return null;
};

/** "5 - 12 menit", "1 - 2 jam", "30 menit - 2 jam 10 menit"; collapses to "± 7 menit" when both ends are the same. */
export function formatRange(p25: number, p75: number): string {
  const lo = split(Math.min(p25, p75));
  const hi = split(Math.max(p25, p75));
  if (formatDuration(Math.min(p25, p75)) === formatDuration(Math.max(p25, p75))) return formatApprox(p25);
  const a = single(lo);
  const b = single(hi);
  if (a && b && a.unit === b.unit) return `${a.value} - ${b.value} ${a.unit}`;
  return `${formatDuration(Math.min(p25, p75))} - ${formatDuration(Math.max(p25, p75))}`;
}

export type EstimateResult = {
  kind: "measured" | "override" | "none";
  /** What goes after "Estimasi: " ("± 7 menit", "5 - 12 menit", the admin's text) or "Belum ada estimasi". */
  text: string;
  /** Small text / tooltip, e.g. "Berdasarkan 12 pesanan terakhir". */
  note: string | null;
  samples: number;
  scope: "service" | "bucket" | null;
};

const NONE: EstimateResult = { kind: "none", text: NO_ESTIMATE, note: null, samples: 0, scope: null };

/**
 * The display rule.
 * - Fewer samples than `ms`: an admin's manual text if there is one, otherwise "Belum ada estimasi".
 * - `ms` or more: measured. With a quantity: from 5 samples overall, prefer the quantity bucket when it has at least 3; else service-wide.
 * - 5 or more samples behind the chosen numbers: the p25-p75 range; fewer: "± median".
 */
export function chooseEstimate(est: EstimateStats | null | undefined, quantity?: number | null): EstimateResult {
  if (!est) return NONE;
  const ms = Math.max(1, est.ms || DEFAULT_MIN_SAMPLES);
  const measured = est.n >= ms;
  if (!measured) {
    return est.override ? { kind: "override", text: est.override, note: null, samples: est.n, scope: null } : NONE;
  }
  let basis: BucketStats = { n: est.n, med: est.med, p25: est.p25, p75: est.p75 };
  let scope: "service" | "bucket" = "service";
  if (typeof quantity === "number" && quantity > 0 && est.n >= BUCKET_MIN_TOTAL) {
    const b = est.buckets?.[quantityBucket(quantity)];
    if (b && b.n >= BUCKET_MIN_SAMPLES) {
      basis = b;
      scope = "bucket";
    }
  }
  const text = basis.n >= RANGE_MIN_SAMPLES ? formatRange(basis.p25, basis.p75) : formatApprox(basis.med);
  const note = `Berdasarkan ${basis.n} pesanan terakhir${scope === "bucket" ? " dengan jumlah serupa" : ""}`;
  return { kind: "measured", text, note, samples: basis.n, scope };
}

/** Raw catalogue columns -> compact stats (undefined when there is nothing to say: keeps the list payload small). */
export function statsFromColumns(c: {
  est_n?: number | null; est_median?: number | null; est_p25?: number | null; est_p75?: number | null;
  est_buckets?: unknown; est_override?: string | null; est_min?: number | null;
}): EstimateStats | undefined {
  const n = Number(c.est_n ?? 0);
  const override = c.est_override?.trim() || undefined;
  if (n <= 0 && !override) return undefined;
  const buckets: EstimateStats["buckets"] = {};
  const raw = (c.est_buckets ?? {}) as Record<string, { n: number; median: number; p25: number; p75: number }>;
  for (const k of ["small", "medium", "large"] as const) {
    const b = raw[k];
    if (b && Number(b.n) > 0) buckets[k] = { n: Number(b.n), med: Number(b.median), p25: Number(b.p25), p75: Number(b.p75) };
  }
  return {
    n, med: Number(c.est_median ?? 0), p25: Number(c.est_p25 ?? 0), p75: Number(c.est_p75 ?? 0), ms: Number(c.est_min ?? DEFAULT_MIN_SAMPLES) || DEFAULT_MIN_SAMPLES,
    ...(Object.keys(buckets).length ? { buckets } : {}), ...(override ? { override } : {}),
  };
}
