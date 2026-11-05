import { describe, expect, it } from "vitest";
import { createEmptyDb, type AdminDb, type AdminService } from "@/lib/admin-data";
import { adminServicesMeta, adminServicesPage } from "../admin-services";

function db(n: number): AdminDb {
  const d = createEmptyDb();
  d.services = Array.from({ length: n }, (_, i): AdminService => ({
    id: String(100 + i), categoryId: `cat-${i % 5}`, categoryLabel: `Kategori ${i % 5}`, platform: "instagram", name: `Layanan ${i} ${i % 2 ? "Likes" : "Followers"}`,
    badges: [], providerId: "prv_likeo", providerServiceId: String(i), providerPrice: 1000, markupType: "persen", markup: i % 10 === 0 ? 1 : 40,
    min: 10, max: 1000, refill: false, refillDays: null, cancel: false, active: true, sort: n - i, imported: true,
  }));
  return d;
}

describe("admin service list is paginated on the server", () => {
  const d = db(60);
  it("returns one page of 15 by default and a cursor", () => {
    const p = adminServicesPage(d);
    expect(p.items).toHaveLength(15);
    expect(p.total).toBe(60);
    expect(p.nextCursor).toBe("15");
  });
  it("orders by the admin sort column across pages", () => {
    const a = adminServicesPage(d, { limit: 30 }).items.map((s) => s.sort);
    expect(a).toEqual([...a].sort((x, y) => x - y));
    expect(adminServicesPage(d, { cursor: "15" }).items[0].sort).toBe(16);
  });
  it("filters by category and search", () => {
    expect(adminServicesPage(d, { category: "cat-2", limit: 100 }).total).toBe(12);
    expect(adminServicesPage(d, { search: "likes", limit: 100 }).total).toBe(30);
    expect(adminServicesPage(d, { search: "l", limit: 100 }).total).toBe(60);
  });
  it("the margin filter keeps only thin-margin active services", () => {
    const thin = adminServicesPage(d, { thinMargin: true, limit: 100 });
    expect(thin.total).toBe(6);
    expect(thin.items.every((s) => s.markup === 1)).toBe(true);
  });
  it("meta has counts but no services", () => {
    const m = adminServicesMeta(d);
    expect(m.total).toBe(60);
    expect(m.thinCount).toBe(6);
    expect(m.categories).toHaveLength(5);
    expect(m.categories[0]).toEqual({ id: "cat-0", label: "Kategori 0", count: 12 });
  });
  it("ignores services of providers that no longer exist", () => {
    const orphan = db(3);
    orphan.services[0].providerId = "prv_gone";
    expect(adminServicesPage(orphan).total).toBe(2);
  });
});
