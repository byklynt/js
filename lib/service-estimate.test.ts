import { describe, expect, it } from "vitest";
import { completionCountsForEstimate, MAX_SYNC_GAP_INTERVALS, SYNC_INTERVAL_MS } from "@/lib/server/rules";
import {
  chooseEstimate, formatApprox, formatDuration, formatRange, NO_ESTIMATE, percentileCont, quantityBucket, roundHalfEven, statsFromColumns, summarizeDurations, type EstimateStats,
} from "@/lib/service-estimate";

const MIN = 60;
const HOUR = 3600;
const DAY = 86_400;

describe("median and percentiles (same definition as Postgres percentile_cont)", () => {
  it("interpolates linearly", () => {
    expect(percentileCont([10], 0.5)).toBe(10);
    expect(percentileCont([10, 20], 0.5)).toBe(15);
    expect(percentileCont([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(percentileCont([1, 2, 3, 4, 5], 0.25)).toBe(2);
    expect(percentileCont([1, 2, 3, 4, 5], 0.75)).toBe(4);
    expect(percentileCont([0, 100], 0.25)).toBe(25);
  });
  it("one slow order does not move the median the way it moves the mean", () => {
    const base = [300, 320, 340, 360, 380];
    const withOutlier = [...base, 86_400];
    const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    expect(summarizeDurations(base)!.median).toBe(340);
    expect(summarizeDurations(withOutlier)!.median).toBe(350); // barely moves
    expect(mean(withOutlier)).toBeGreaterThan(14_000); // the mean would have exploded
  });
  it("rounds halves like Postgres (to even), so the reference equals the SQL numbers", () => {
    expect(roundHalfEven(322.5)).toBe(322);
    expect(roundHalfEven(323.5)).toBe(324);
    expect(roundHalfEven(10.4)).toBe(10);
    expect(roundHalfEven(10.6)).toBe(11);
  });
  it("ignores impossible durations and is null without samples", () => {
    expect(summarizeDurations([])).toBeNull();
    expect(summarizeDurations([0, -5, NaN])).toBeNull();
    expect(summarizeDurations([0, 600, -1, 1200])).toMatchObject({ n: 2, median: 900 });
  });
});

describe("Indonesian formatting", () => {
  it("seconds and minutes", () => {
    expect(formatDuration(20)).toBe("1 menit");
    expect(formatDuration(60)).toBe("1 menit");
    expect(formatDuration(7 * MIN)).toBe("7 menit");
    expect(formatDuration(7 * MIN + 29)).toBe("7 menit");
    expect(formatDuration(59 * MIN)).toBe("59 menit");
    expect(formatApprox(7 * MIN)).toBe("± 7 menit");
  });
  it("hours (minutes rounded to 5)", () => {
    expect(formatDuration(HOUR)).toBe("1 jam");
    expect(formatDuration(59.9 * MIN)).toBe("1 jam");
    expect(formatDuration(2 * HOUR + 10 * MIN)).toBe("2 jam 10 menit");
    expect(formatDuration(2 * HOUR + 12 * MIN)).toBe("2 jam 10 menit");
    expect(formatDuration(2 * HOUR + 58 * MIN)).toBe("3 jam");
    expect(formatApprox(2 * HOUR + 10 * MIN)).toBe("± 2 jam 10 menit");
  });
  it("days", () => {
    expect(formatDuration(DAY)).toBe("1 hari");
    expect(formatDuration(DAY + 6 * HOUR)).toBe("1 hari 6 jam");
    expect(formatDuration(2 * DAY - 10 * MIN)).toBe("2 hari");
    expect(formatApprox(DAY)).toBe("± 1 hari");
  });
  it("ranges", () => {
    expect(formatRange(5 * MIN, 12 * MIN)).toBe("5 - 12 menit");
    expect(formatRange(1 * HOUR, 2 * HOUR)).toBe("1 - 2 jam");
    expect(formatRange(30 * MIN, 2 * HOUR + 10 * MIN)).toBe("30 menit - 2 jam 10 menit");
    expect(formatRange(12 * MIN, 5 * MIN)).toBe("5 - 12 menit");
    expect(formatRange(7 * MIN, 7 * MIN + 10)).toBe("± 7 menit"); // both ends read the same
  });
});

const stats = (over: Partial<EstimateStats> = {}): EstimateStats => ({ n: 3, med: 7 * MIN, p25: 5 * MIN, p75: 12 * MIN, ms: 3, ...over });

describe("display rule and thresholds", () => {
  it("below the minimum nothing misleading is shown", () => {
    expect(chooseEstimate(undefined).text).toBe(NO_ESTIMATE);
    expect(chooseEstimate(stats({ n: 2 }))).toMatchObject({ kind: "none", text: NO_ESTIMATE, note: null });
    expect(chooseEstimate(stats({ n: 0 }))).toMatchObject({ kind: "none" });
  });
  it("3 samples: a single number with the sample note", () => {
    expect(chooseEstimate(stats({ n: 3 }))).toMatchObject({ kind: "measured", text: "± 7 menit", note: "Berdasarkan 3 pesanan terakhir", samples: 3 });
    expect(chooseEstimate(stats({ n: 4 })).text).toBe("± 7 menit");
  });
  it("5 samples: the p25-p75 range", () => {
    expect(chooseEstimate(stats({ n: 5 }))).toMatchObject({ text: "5 - 12 menit", note: "Berdasarkan 5 pesanan terakhir" });
    expect(chooseEstimate(stats({ n: 20 })).note).toBe("Berdasarkan 20 pesanan terakhir");
  });
  it("the minimum is configurable", () => {
    expect(chooseEstimate(stats({ n: 2, ms: 2 })).kind).toBe("measured");
    expect(chooseEstimate(stats({ n: 4, ms: 6 })).kind).toBe("none");
  });
  it("a manual text wins only while the measured data is below the minimum", () => {
    expect(chooseEstimate(stats({ n: 1, override: "5 - 15 menit" }))).toMatchObject({ kind: "override", text: "5 - 15 menit" });
    expect(chooseEstimate(stats({ n: 0, override: "5 - 15 menit" })).text).toBe("5 - 15 menit");
    expect(chooseEstimate(stats({ n: 3, override: "5 - 15 menit" })).kind).toBe("measured"); // measured reached the minimum
  });
});

describe("quantity buckets", () => {
  it("boundaries", () => {
    expect(quantityBucket(1)).toBe("small");
    expect(quantityBucket(1000)).toBe("small");
    expect(quantityBucket(1001)).toBe("medium");
    expect(quantityBucket(10_000)).toBe("medium");
    expect(quantityBucket(10_001)).toBe("large");
  });
  const buckets = { small: { n: 3, med: 5 * MIN, p25: 4 * MIN, p75: 6 * MIN }, large: { n: 2, med: HOUR, p25: HOUR, p75: 2 * HOUR } };
  it("prefers the bucket when the service has 5+ samples and the bucket 3+", () => {
    const e = stats({ n: 8, buckets });
    expect(chooseEstimate(e, 500)).toMatchObject({ scope: "bucket", text: "± 5 menit", note: "Berdasarkan 3 pesanan terakhir dengan jumlah serupa" });
  });
  it("falls back to the service-wide estimate: bucket too small, bucket missing, fewer than 5 samples overall, or no quantity", () => {
    const e = stats({ n: 8, buckets });
    expect(chooseEstimate(e, 20_000)).toMatchObject({ scope: "service", text: "5 - 12 menit" }); // large has only 2
    expect(chooseEstimate(e, 5000)).toMatchObject({ scope: "service" }); // no medium bucket
    expect(chooseEstimate(stats({ n: 4, buckets }), 500)).toMatchObject({ scope: "service" }); // under 5 overall
    expect(chooseEstimate(e, null)).toMatchObject({ scope: "service" });
    expect(chooseEstimate(e)).toMatchObject({ scope: "service" });
  });
});

describe("catalogue columns -> compact stats", () => {
  it("is undefined when there is nothing to show (keeps the list payload small)", () => {
    expect(statsFromColumns({ est_n: null })).toBeUndefined();
    expect(statsFromColumns({ est_n: 0, est_override: "  " })).toBeUndefined();
  });
  it("maps the bucket json and the manual text", () => {
    const s = statsFromColumns({ est_n: 6, est_median: 420, est_p25: 300, est_p75: 720, est_min: 3, est_override: "5 - 15 menit", est_buckets: { small: { n: 4, median: 300, p25: 240, p75: 420 }, medium: { n: 0, median: 0, p25: 0, p75: 0 } } });
    expect(s).toEqual({ n: 6, med: 420, p25: 300, p75: 720, ms: 3, override: "5 - 15 menit", buckets: { small: { n: 4, med: 300, p25: 240, p75: 420 } } });
  });
});

describe("which completions count (decided by the sync at the first transition to selesai)", () => {
  const now = new Date("2026-11-06T12:00:00.000Z");
  const ago = (s: number) => new Date(now.getTime() - s * 1000).toISOString();
  const clean = { syncError: null, statusManual: false, lastSyncedAt: ago(100), providerAcceptedAt: ago(900), createdAt: ago(905) };
  it("a clean completion with a recent sync counts", () => {
    expect(completionCountsForEstimate(clean, now)).toBe(true);
  });
  it("excludes orders with an earlier sync problem and manual status changes", () => {
    expect(completionCountsForEstimate({ ...clean, syncError: 'Status provider tidak dikenal: "x"' }, now)).toBe(false);
    expect(completionCountsForEstimate({ ...clean, statusManual: true }, now)).toBe(false);
  });
  it("excludes stalled syncs: the gap since the last successful sync is over 3 intervals", () => {
    const limit = (MAX_SYNC_GAP_INTERVALS * SYNC_INTERVAL_MS) / 1000;
    expect(limit).toBe(360);
    expect(completionCountsForEstimate({ ...clean, lastSyncedAt: ago(limit) }, now)).toBe(true);
    expect(completionCountsForEstimate({ ...clean, lastSyncedAt: ago(limit + 1) }, now)).toBe(false);
  });
  it("never synced before: measures the gap from the provider acceptance (or creation)", () => {
    expect(completionCountsForEstimate({ ...clean, lastSyncedAt: null, providerAcceptedAt: ago(120) }, now)).toBe(true);
    expect(completionCountsForEstimate({ ...clean, lastSyncedAt: null, providerAcceptedAt: ago(1200) }, now)).toBe(false);
    expect(completionCountsForEstimate({ ...clean, lastSyncedAt: null, providerAcceptedAt: null, createdAt: ago(60) }, now)).toBe(true);
  });
});
