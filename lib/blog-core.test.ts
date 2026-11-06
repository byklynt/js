import { describe, expect, it } from "vitest";
import { isPublic, isValidSlug, parseTags, plainText, postStatus, readingMinutes, seoOf, slugify, uniqueSlug } from "./blog-core";

describe("slugs", () => {
  it("generates a clean slug from a title", () => {
    expect(slugify("Panduan Order Followers Instagram!")).toBe("panduan-order-followers-instagram");
    expect(slugify("  Café & Kopi — 2026  ")).toBe("cafe-dan-kopi-2026");
    expect(slugify("Ünïcode ñ test")).toBe("unicode-n-test");
    expect(slugify("---")).toBe("");
    expect(slugify("a".repeat(150)).length).toBeLessThanOrEqual(100);
    expect(slugify("x".repeat(99) + " yz").endsWith("-")).toBe(false);
  });
  it("validates slugs", () => {
    for (const ok of ["a", "tips-order", "a1-b2-c3"]) expect(isValidSlug(ok), ok).toBe(true);
    for (const bad of ["", "Tips", "tips_order", "-tips", "tips-", "tips--order", "tips order", "../etc", "a".repeat(101), "tips/order"]) expect(isValidSlug(bad), bad).toBe(false);
  });
  it("makes a slug unique by numbering it", () => {
    expect(uniqueSlug("Tips Order", new Set())).toBe("tips-order");
    expect(uniqueSlug("Tips Order", new Set(["tips-order"]))).toBe("tips-order-2");
    expect(uniqueSlug("Tips Order", new Set(["tips-order", "tips-order-2", "tips-order-3"]))).toBe("tips-order-4");
    expect(uniqueSlug("!!!", new Set())).toBe("artikel");
    const long = "a".repeat(100);
    const next = uniqueSlug(long, new Set([long]));
    expect(next.length).toBeLessThanOrEqual(100);
    expect(isValidSlug(next)).toBe(true);
  });
});

describe("status and scheduling", () => {
  const now = new Date("2026-11-06T10:00:00Z");
  it("draft, published and scheduled", () => {
    expect(postStatus({ status: "draf", publishedAt: null }, now)).toBe("draf");
    expect(postStatus({ status: "draf", publishedAt: "2026-01-01T00:00:00Z" }, now)).toBe("draf");
    expect(postStatus({ status: "terbit", publishedAt: "2026-11-06T09:59:59Z" }, now)).toBe("terbit");
    expect(postStatus({ status: "terbit", publishedAt: "2026-11-06T10:00:00Z" }, now)).toBe("terbit");
    expect(postStatus({ status: "terbit", publishedAt: "2026-11-06T10:00:01Z" }, now)).toBe("terjadwal");
    expect(postStatus({ status: "terbit", publishedAt: null }, now)).toBe("draf");
  });
  it("a scheduled post becomes public by itself when its time comes", () => {
    const p = { status: "terbit", publishedAt: "2026-11-07T08:00:00Z" };
    expect(isPublic(p, new Date("2026-11-07T07:59:59Z"))).toBe(false);
    expect(isPublic(p, new Date("2026-11-07T08:00:00Z"))).toBe(true);
    expect(isPublic({ status: "draf", publishedAt: "2020-01-01T00:00:00Z" }, now)).toBe(false);
  });
});

describe("text helpers", () => {
  it("plain text and reading time", () => {
    expect(plainText("# Judul\n\nIni **tebal** dan [tautan](https://x.com) ![gambar](https://x.com/a.png)\n\n```js\ncode()\n```")).toBe("Judul Ini tebal dan tautan");
    expect(readingMinutes("")).toBe(1);
    expect(readingMinutes("kata ".repeat(200))).toBe(1);
    expect(readingMinutes("kata ".repeat(201))).toBe(2);
    expect(readingMinutes("kata ".repeat(1000))).toBe(5);
  });
  it("SEO fields fall back to title, excerpt and the start of the article", () => {
    const base = { title: "Judul Artikel", excerpt: "", contentMd: "Isi artikel yang cukup panjang. ".repeat(20), seoTitle: "", seoDescription: "" };
    expect(seoOf(base).title).toBe("Judul Artikel");
    expect(seoOf(base).description.length).toBeLessThanOrEqual(160);
    expect(seoOf({ ...base, excerpt: "Ringkasan." }).description).toBe("Ringkasan.");
    expect(seoOf({ ...base, excerpt: "Ringkasan.", seoDescription: "Meta khusus" }).description).toBe("Meta khusus");
    expect(seoOf({ ...base, seoTitle: "Judul SEO" }).title).toBe("Judul SEO");
  });
  it("tags: unique, trimmed, at most 10", () => {
    expect(parseTags("Instagram, tips ,  Instagram, TIPS, ,Order Cepat")).toEqual([
      { name: "Instagram", slug: "instagram" },
      { name: "tips", slug: "tips" },
      { name: "Order Cepat", slug: "order-cepat" },
    ]);
    expect(parseTags(Array.from({ length: 20 }, (_, i) => `t${i}`).join(",")).length).toBe(10);
  });
});
