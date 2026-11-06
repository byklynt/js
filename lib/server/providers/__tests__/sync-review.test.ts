import { describe, expect, it, vi } from "vitest";
import { applyCatalog, buildSyncPreview } from "../catalog";
import { LIKEO_ID } from "../config";
import { createEmptyDb, defaultSettings } from "@/lib/admin-data";
import type { ProviderServiceInfo } from "../types";

vi.mock("server-only", () => ({}));

const row = (id: string, name: string, category: string, rate: number, extra: Partial<ProviderServiceInfo> = {}): ProviderServiceInfo =>
  ({ id, name, category, rate, min: 10, max: 1000, refill: false, cancel: false, type: "Default", ...extra });
const world = (patch: Partial<ReturnType<typeof defaultSettings>["pricing"]> = {}) => {
  const db = createEmptyDb();
  db.settings.pricing = { ...db.settings.pricing, rateIdr: 18_500, defaultMarkup: { markupType: "persen", markup: 40 }, ...patch };
  return db;
};
const CATALOG = [
  row("1", "Instagram Followers | Real", "Instagram Followers", 0.5),
  row("26826", "mm", "0m", 1000), // the provider's own placeholder: 1000 USD per 1000 = Rp 18.500.000, sells at Rp 25.900.000
  row("26893", "mm", "0m", 1000),
  row("5", "Very expensive but properly named", "Telegram Gifts", 400), // Rp 7.400.000 cost, sells above the threshold
  row("6", "ab", "Instagram Likes", 0.1), // name under 3 characters
  row("7", "Normal likes", "ab", 0.1), // category under 3 characters
];

describe("sync: suspicious services are imported inactive and flagged, never deleted", () => {
  it("the preview flags them (reasons) and says they start inactive; a normal service is untouched", () => {
    const p = buildSyncPreview(world(), LIKEO_ID, CATALOG);
    const by = Object.fromEntries(p.changes.map((c) => [c.providerServiceId, c]));
    expect(by["1"].review).toBeUndefined();
    expect(by["1"].startsInactive).toBe(false);
    expect(by["26826"]).toMatchObject({ review: ["harga", "nama", "kategori"], startsInactive: true });
    expect(by["26826"].newPrice).toBe(25_900_000);
    expect(by["5"]).toMatchObject({ review: ["harga"], startsInactive: true });
    expect(by["6"]).toMatchObject({ review: ["nama"], startsInactive: true });
    expect(by["7"]).toMatchObject({ review: ["kategori"], startsInactive: true });
    expect(p.reviewThreshold).toBe(5_000_000);
  });
  it("the apply step imports them inactive (rows kept), the normal one active", () => {
    const db = world();
    const r = applyCatalog(db, LIKEO_ID, CATALOG);
    const svc = (pid: string) => db.services.find((s) => s.providerServiceId === pid)!;
    expect(svc("1").active).toBe(true);
    for (const pid of ["26826", "26893", "5", "6", "7"]) expect(svc(pid).active, pid).toBe(false);
    expect(db.services).toHaveLength(CATALOG.length);
    expect(r).toMatchObject({ created: 6, flagged: 5 });
  });
  it("the threshold is configurable", () => {
    const p = buildSyncPreview(world({ reviewPriceThreshold: 50_000_000 }), LIKEO_ID, CATALOG);
    const by = Object.fromEntries(p.changes.map((c) => [c.providerServiceId, c]));
    expect(by["5"].review).toBeUndefined();
    expect(by["26826"].review).toEqual(["nama", "kategori"]);
    const db = world({ reviewPriceThreshold: 50_000_000 });
    applyCatalog(db, LIKEO_ID, CATALOG);
    expect(db.services.find((s) => s.providerServiceId === "5")!.active).toBe(true);
  });
  it("\"layanan baru mulai nonaktif\" keeps every new service off; the default (off) keeps the current behaviour", () => {
    const off = world({ newServicesInactive: true });
    expect(buildSyncPreview(off, LIKEO_ID, CATALOG).changes.every((c) => c.startsInactive)).toBe(true);
    applyCatalog(off, LIKEO_ID, CATALOG);
    expect(off.services.every((s) => !s.active)).toBe(true);
    expect(defaultSettings().pricing.newServicesInactive).toBe(false);
  });
  it("an already-imported service is not switched off or on by a later sync (only new ones start inactive)", () => {
    const db = world();
    applyCatalog(db, LIKEO_ID, CATALOG);
    db.services.find((s) => s.providerServiceId === "26826")!.active = true; // an admin looked and enabled it
    applyCatalog(db, LIKEO_ID, CATALOG);
    expect(db.services.find((s) => s.providerServiceId === "26826")!.active).toBe(true);
  });
  it("the fingerprint changes with the threshold (an old preview cannot be applied under new rules)", () => {
    const a = buildSyncPreview(world(), LIKEO_ID, CATALOG).fingerprint;
    const b = buildSyncPreview(world({ reviewPriceThreshold: 9_000_000 }), LIKEO_ID, CATALOG).fingerprint;
    expect(a).not.toBe(b);
  });
});
