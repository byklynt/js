import { describe, expect, it } from "vitest";
import { normalizeServiceSearch } from "./search-text";
import { DEFAULT_REVIEW_PRICE, reviewReasons, reviewText } from "./service-review";

describe("normalizeServiceSearch", () => {
  it("trims, ignores a leading # and collapses spaces", () => {
    expect(normalizeServiceSearch("  5162  ")).toBe("5162");
    expect(normalizeServiceSearch("#26826")).toBe("26826");
    expect(normalizeServiceSearch(" ## 26826 ")).toBe("26826");
    expect(normalizeServiceSearch("# 26826")).toBe("26826");
    expect(normalizeServiceSearch("Facebook   Custom  Comments")).toBe("Facebook Custom Comments");
    expect(normalizeServiceSearch("a#b")).toBe("a#b");
    expect(normalizeServiceSearch(null)).toBe("");
    expect(normalizeServiceSearch("   ")).toBe("");
  });
});

describe("reviewReasons (Perlu dicek)", () => {
  const ok = { name: "Instagram Followers", category: "Instagram Followers", price: 25_000 };
  it("is empty for a normal service", () => {
    expect(reviewReasons(ok)).toEqual([]);
  });
  it("flags a price above the threshold (default Rp 5.000.000), not at it", () => {
    expect(reviewReasons({ ...ok, price: DEFAULT_REVIEW_PRICE })).toEqual([]);
    expect(reviewReasons({ ...ok, price: DEFAULT_REVIEW_PRICE + 1 })).toEqual(["harga"]);
    expect(reviewReasons({ ...ok, price: 25_900_000 })).toEqual(["harga"]);
    expect(reviewReasons({ ...ok, price: 150_000, threshold: 100_000 })).toEqual(["harga"]);
    expect(reviewReasons({ ...ok, price: 150_000, threshold: 200_000 })).toEqual([]);
  });
  it("flags a name or category shorter than 3 characters (the provider's \"mm\" in \"0m\")", () => {
    expect(reviewReasons({ name: "mm", category: "0m", price: 25_900_000 })).toEqual(["harga", "nama", "kategori"]);
    expect(reviewReasons({ ...ok, name: "ab" })).toEqual(["nama"]);
    expect(reviewReasons({ ...ok, name: "abc" })).toEqual([]);
    expect(reviewReasons({ ...ok, category: "  x " })).toEqual(["kategori"]);
    expect(reviewReasons({ ...ok, name: "  " })).toEqual(["nama"]);
  });
  it("explains it in Indonesian", () => {
    expect(reviewText(["harga", "nama"])).toBe("Perlu dicek: harga jual di atas Rp 5.000.000 per 1000, nama kurang dari 3 karakter.");
    expect(reviewText([])).toBe("");
  });
});
