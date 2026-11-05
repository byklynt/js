import { describe, expect, it } from "vitest";
import { createEmptyDb, type AdminDb, type AdminService } from "@/lib/admin-data";
import { cleanServiceName, formatMaxQty, formatQtyRange, isNoLimit } from "@/lib/service-format";
import { getOrderBootstrap, getServiceDetail, getServices, getServicesByIds, invalidateServicesCache, listCategories } from "../services";

function svc(i: number, over: Partial<AdminService> = {}): AdminService {
  const c = i % 4;
  return {
    id: String(100 + i), categoryId: `cat-${c}`, categoryLabel: `Kategori ${c}`, platform: c < 2 ? "instagram" : "tiktok",
    name: `Layanan   ${i}  ${i % 2 ? "Followers" : "Likes"}`, badges: [], providerId: "prv_likeo", providerServiceId: String(i),
    providerPrice: 1000 + i * 10, markupType: "persen", markup: 0, min: 10, max: 1000 + i, refill: i % 3 === 0, refillDays: null, cancel: false,
    active: true, sort: i, providerName: `Original   ${i}`, providerType: "Default", imported: true, ...over,
  };
}

function dbWith(n: number, over?: (i: number) => Partial<AdminService>): AdminDb {
  const db = createEmptyDb();
  db.services = Array.from({ length: n }, (_, i) => svc(i + 1, over?.(i + 1)));
  invalidateServicesCache();
  return db;
}

describe("getServices: pagination", () => {
  const db = dbWith(100);
  it("returns one page and a cursor, never the whole list", () => {
    const first = getServices(db, { limit: 20 });
    expect(first.items).toHaveLength(20);
    expect(first.total).toBe(100);
    expect(first.nextCursor).not.toBeNull();
    const second = getServices(db, { limit: 20, cursor: first.nextCursor });
    expect(second.items[0].id).not.toBe(first.items[0].id);
    expect(second.items).toHaveLength(20);
  });
  it("walks every service exactly once and ends with a null cursor", () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page = getServices(db, { limit: 30, cursor });
      seen.push(...page.items.map((s) => s.id));
      cursor = page.nextCursor;
      pages++;
    } while (cursor && pages < 20);
    expect(pages).toBe(4);
    expect(new Set(seen).size).toBe(100);
  });
  it("caps the page size and survives a bad cursor", () => {
    expect(getServices(db, { limit: 10_000 }).items.length).toBeLessThanOrEqual(100);
    expect(getServices(db, { limit: 5, cursor: "abc" }).items[0].id).toBe("101");
  });
  it("only sends the fields a card needs", () => {
    const row = getServices(db, { limit: 1 }).items[0];
    expect(Object.keys(row).sort()).toEqual(["categoryId", "id", "max", "min", "name", "price", "refillDays"]);
  });
});

describe("getServices: filtering and sorting", () => {
  const db = dbWith(40);
  it("filters by category on the server", () => {
    const page = getServices(db, { category: "cat-1", limit: 100 });
    expect(page.total).toBe(10);
    expect(page.items.every((s) => s.categoryId === "cat-1")).toBe(true);
  });
  it("filters by platform", () => {
    expect(getServices(db, { platform: "tiktok", limit: 100 }).total).toBe(20);
  });
  it("searches names and ids, needs 2+ characters, matches every word", () => {
    expect(getServices(db, { search: "followers", limit: 100 }).total).toBe(20);
    expect(getServices(db, { search: "107", limit: 100 }).items.map((s) => s.id)).toEqual(["107"]);
    expect(getServices(db, { search: "f", limit: 100 }).total).toBe(40);
    expect(getServices(db, { search: "zzzz", limit: 100 }).total).toBe(0);
  });
  it("sorts by price", () => {
    const asc = getServices(db, { sort: "termurah", limit: 100 }).items.map((s) => s.price);
    expect(asc).toEqual([...asc].sort((a, b) => a - b));
    const desc = getServices(db, { sort: "termahal", limit: 100 }).items.map((s) => s.price);
    expect(desc).toEqual([...desc].sort((a, b) => b - a));
  });
  it("filters by price range and guarantee", () => {
    const priced = getServices(db, { priceMin: 1200, priceMax: 1300, limit: 100 }).items;
    expect(priced.length).toBeGreaterThan(0);
    expect(priced.every((s) => s.price >= 1200 && s.price <= 1300)).toBe(true);
    expect(getServices(db, { guarantee: "ada-garansi", limit: 100 }).items.every((s) => s.refillDays !== null)).toBe(true);
    expect(getServices(db, { guarantee: "tanpa-garansi", limit: 100 }).items.every((s) => s.refillDays === null)).toBe(true);
  });
  it("favoritesOnly keeps just the given ids and flags favorites", () => {
    const page = getServices(db, { favoritesOnly: true, favoriteIds: ["105", "110", "nope"], limit: 100 });
    expect(page.items.map((s) => s.id).sort()).toEqual(["105", "110"]);
    expect(page.items.every((s) => s.favorite === true)).toBe(true);
    expect(getServices(db, { favoritesOnly: true, favoriteIds: [] }).total).toBe(0);
  });
  it("hides inactive, dropped and non-imported services", () => {
    const hidden = dbWith(8, (i) => (i === 1 ? { active: false } : i === 2 ? { providerRemoved: true } : i === 4 ? { imported: false } : {}));
    expect(getServices(hidden, { limit: 100 }).items.map((s) => s.id)).toEqual(["103", "105", "106", "107", "108"]);
  });
  it("cleans repeated whitespace in names", () => {
    expect(getServices(db, { limit: 1 }).items[0].name).toBe("Layanan 1 Followers");
  });
});

describe("categories with counts", () => {
  const db = dbWith(40);
  it("lists categories with counts, without any service data", () => {
    const cats = listCategories(db);
    expect(cats).toHaveLength(4);
    expect(cats.map((c) => c.count)).toEqual([10, 10, 10, 10]);
    expect(Object.keys(cats[0]).sort()).toEqual(["count", "id", "label", "platformId"]);
  });
  it("counts only matching services when filtered", () => {
    const cats = listCategories(db, { search: "followers" });
    expect(cats.reduce((n, c) => n + c.count, 0)).toBe(20);
  });
});

describe("cache", () => {
  it("picks up a price change without a manual invalidation", () => {
    const db = dbWith(5);
    const before = getServices(db, { limit: 1 }).items[0].price;
    db.services[0].providerPrice += 500;
    expect(getServices(db, { limit: 1 }).items[0].price).toBeGreaterThan(before);
  });
  it("picks up a switched-off provider", () => {
    const db = dbWith(5);
    expect(getServices(db).total).toBe(5);
    db.providers[0].status = "nonaktif";
    expect(getServices(db).total).toBe(0);
  });
});

describe("on-demand lookups", () => {
  const db = dbWith(10);
  it("detail carries the description, the list does not", () => {
    const d = getServiceDetail(db, "103");
    expect(d?.description[0]).toContain("Nama asli di provider: Original   3");
    expect(getServiceDetail(db, "999")).toBeNull();
  });
  it("by ids ignores unknown ids", () => {
    expect(getServicesByIds(db, ["101", "x", "102"]).map((s) => s.id)).toEqual(["101", "102"]);
  });
  it("bootstrap tells whether anything exists and preselects ?service", () => {
    expect(getOrderBootstrap(createEmptyDb()).hasServices).toBe(false);
    const b = getOrderBootstrap(db, "102");
    expect(b.hasServices).toBe(true);
    expect(b.preselect?.service.id).toBe("102");
    expect(b.preselect?.category?.id).toBe(db.services[1].categoryId);
  });
});

describe("Tanpa batas", () => {
  it("2147483647 and anything from 1,000,000,000 means no limit", () => {
    expect(formatMaxQty(2147483647)).toBe("Tanpa batas");
    expect(formatMaxQty(1_000_000_000)).toBe("Tanpa batas");
    expect(isNoLimit(999_999_999)).toBe(false);
  });
  it("normal numbers keep the Indonesian format", () => {
    expect(formatMaxQty(100000)).toBe("100.000");
    expect(formatQtyRange(10, 5000)).toBe("10 - 5.000");
    expect(formatQtyRange(100, 2147483647)).toBe("100 - Tanpa batas");
  });
  it("trims repeated whitespace but nothing else", () => {
    expect(cleanServiceName("  A   B \t C  ")).toBe("A B C");
  });
});
