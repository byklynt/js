import { describe, expect, it } from "vitest";
import { id } from "./id";
import { en } from "./en";
import { findMissingKeys, findOrphanKeys, makeT, normalizeLang, translate, translateOr } from "./index";

describe("i18n", () => {
  it("defaults to Indonesian for anything but en", () => {
    expect(normalizeLang(undefined)).toBe("id");
    expect(normalizeLang("fr")).toBe("id");
    expect(normalizeLang("en")).toBe("en");
  });
  it("translates and fills params", () => {
    expect(makeT("en")("notif.aria", { n: 3 })).toBe("Notifications, 3 unread");
    expect(makeT("id")("notif.aria", { n: 3 })).toBe("Notifikasi, 3 belum dibaca");
  });
  it("falls back to Indonesian when the English key is missing", () => {
    const key = "common.home" as const;
    const saved = en[key];
    delete en[key];
    try {
      expect(translate("en", key)).toBe(id[key]);
    } finally {
      en[key] = saved;
    }
  });
  it("translateOr uses the fallback for an unknown key", () => {
    expect(translateOr("en", "nav.nope", "Fallback")).toBe("Fallback");
  });
  it("detects missing and orphan keys, and the real dictionaries are complete", () => {
    expect(findMissingKeys({ a: "1", b: "2" }, { a: "x" })).toEqual(["b"]);
    expect(findOrphanKeys({ a: "1" }, { a: "x", c: "y" })).toEqual(["c"]);
    expect(findMissingKeys(id, en)).toEqual([]);
    expect(findOrphanKeys(id, en)).toEqual([]);
  });
});
