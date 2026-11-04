import { beforeEach, describe, expect, it, vi } from "vitest";
import { type AdminDb } from "@/lib/admin-data";
import { seedDemoDb as seedAdminDb } from "@/lib/dev/demo-seed";
import { ServiceError } from "../../tx";
import { reconcileProviderMode } from "../balance";
import { applyCatalog, buildSyncPreview, buildUserCatalog, isUserVisible, pricingProblem, serviceStages } from "../catalog";
import { LIKEO_ID } from "../config";
import { MOCK_CATALOG } from "../mock";
import type { ProviderServiceInfo } from "../types";

vi.mock("server-only", () => ({}));

let db: AdminDb;
beforeEach(() => {
  db = seedAdminDb();
});

const supported = MOCK_CATALOG.filter((s) => s.type === "Default");
const imported = () => db.services.filter((s) => s.imported);

describe("sync + apply makes services visible to the user query", () => {
  it("every imported Default service shows up in the user catalogue with a price and a category", () => {
    expect(buildUserCatalog(db).services).toEqual([]);
    applyCatalog(db, LIKEO_ID, MOCK_CATALOG);
    const catalog = buildUserCatalog(db);
    expect(catalog.services).toHaveLength(supported.length);
    expect(catalog.services.every((s) => s.pricePer1000 > 0 && s.min > 0 && s.max >= s.min)).toBe(true);
    // each service belongs to a category that is in the list, and each category maps to a platform
    const ids = new Set(catalog.categories.map((c) => c.id));
    expect(catalog.services.every((s) => ids.has(s.categoryId))).toBe(true);
    expect(catalog.categories.every((c) => c.platformId && c.label)).toBe(true);
  });

  it("stage counts line up: fetched -> normalized -> stored -> active -> visible", () => {
    applyCatalog(db, LIKEO_ID, MOCK_CATALOG);
    const s = serviceStages(db, MOCK_CATALOG);
    expect(s).toMatchObject({ fetched: MOCK_CATALOG.length, normalized: supported.length, unsupported: MOCK_CATALOG.length - supported.length, applied: supported.length, active: supported.length, visible: supported.length });
    expect(s.dropped).toEqual({ inactive: 0, removedByProvider: 0, zeroPrice: 0, providerMissingOrOff: 0 });
  });

  it("live mode: demo services are hidden and the synced ones are the only ones users get", () => {
    reconcileProviderMode(db, "live");
    const before = buildUserCatalog(db);
    expect(before.services).toEqual([]);
    expect(before.hiddenServiceIds.length).toBeGreaterThan(0);
    applyCatalog(db, LIKEO_ID, MOCK_CATALOG);
    const after = buildUserCatalog(db);
    expect(after.services).toHaveLength(supported.length);
    expect(after.hiddenServiceIds.length).toBe(before.hiddenServiceIds.length);
  });
});

describe("zero-price import is blocked", () => {
  it.each([
    ["no exchange rate", () => { db.settings.pricing.rateIdr = 0; }],
    ["NaN exchange rate", () => { db.settings.pricing.rateIdr = Number.NaN; }],
    ["no markup", () => { db.settings.pricing.providerMarkups[LIKEO_ID] = { markupType: "persen", markup: 0 }; }],
  ])("%s: the preview says 'Atur kurs dan markup dulu' and apply throws, importing nothing", (_name, breakIt) => {
    breakIt();
    expect(pricingProblem(db)).toContain("Atur kurs dan markup dulu");
    expect(buildSyncPreview(db, LIKEO_ID, MOCK_CATALOG).blocked).toContain("Atur kurs dan markup dulu");
    const count = db.services.length;
    expect(() => applyCatalog(db, LIKEO_ID, MOCK_CATALOG)).toThrow(ServiceError);
    expect(db.services.length).toBe(count);
  });

  it("with valid pricing nothing is blocked and every imported service has a price above zero", () => {
    expect(pricingProblem(db)).toBeNull();
    expect(buildSyncPreview(db, LIKEO_ID, MOCK_CATALOG).blocked).toBeNull();
    applyCatalog(db, LIKEO_ID, MOCK_CATALOG);
    expect(imported().every((s) => s.providerPrice > 0 && s.active)).toBe(true);
  });

  it("a provider rate of 0 still gets a cost of at least Rp 1, so it never imports as a free service", () => {
    const free: ProviderServiceInfo = { id: "9", name: "Free thing", category: "Instagram Likes", rate: 0, min: 1, max: 10, refill: false, cancel: false, type: "Default" };
    applyCatalog(db, LIKEO_ID, [free]);
    const s = imported()[0];
    expect(s.providerPrice).toBeGreaterThan(0);
    expect(isUserVisible(db, s)).toBe(true);
  });
});

describe("categories always map to a platform", () => {
  it("an unknown or empty category falls back to 'Lainnya' and still shows under Semua", () => {
    const odd: ProviderServiceInfo[] = [
      { id: "1", name: "Mystery boost", category: "Snapchat Spotlight", rate: 1, min: 10, max: 100, refill: false, cancel: false, type: "Default" },
      { id: "2", name: "No category", category: "", rate: 1, min: 10, max: 100, refill: false, cancel: false, type: "Default" },
    ];
    applyCatalog(db, LIKEO_ID, odd);
    const mine = imported();
    expect(mine.map((s) => s.platform)).toEqual(["lainnya", "lainnya"]);
    expect(mine.find((s) => s.providerServiceId === "2")!.categoryLabel).toBe("Lainnya");
    const catalog = buildUserCatalog(db);
    expect(catalog.services).toHaveLength(2);
    expect(catalog.categories.every((c) => c.platformId === "lainnya" && c.label)).toBe(true);
  });
});

describe("deactivated services are hidden", () => {
  beforeEach(() => {
    applyCatalog(db, LIKEO_ID, MOCK_CATALOG);
  });

  it("an admin-switched-off service disappears from the user query and is counted as inactive", () => {
    const s = imported()[0];
    s.active = false;
    const ids = buildUserCatalog(db).services.map((x) => x.id);
    expect(ids).not.toContain(s.id);
    expect(ids).toHaveLength(supported.length - 1);
    expect(serviceStages(db).dropped.inactive).toBe(1);
  });

  it("a service the provider dropped is hidden too", () => {
    applyCatalog(db, LIKEO_ID, MOCK_CATALOG.filter((s) => s.id !== "1006"));
    const dropped = imported().find((s) => s.providerServiceId === "1006")!;
    expect(buildUserCatalog(db).services.map((x) => x.id)).not.toContain(dropped.id);
    expect(serviceStages(db).dropped.removedByProvider).toBe(1);
  });

  it("switching the provider off hides all of its services", () => {
    db.providers.find((p) => p.id === LIKEO_ID)!.status = "nonaktif";
    expect(buildUserCatalog(db).services).toEqual([]);
    expect(serviceStages(db).dropped.providerMissingOrOff).toBe(supported.length);
  });
});
