import { describe, expect, it } from "vitest";
import { detectPlatform, groupPlatformId, promotedPlatformIds } from "./platform-detect";
import { GenericPlatformIcon, iconForCategory, iconForPlatform } from "./platform-icons";

describe("detectPlatform", () => {
  it.each([
    ["WhatsApp Channel Members", "whatsapp"],
    ["whatsapp group", "whatsapp"],
    ["WA Channel Followers", "whatsapp"],
    ["CoinMarketCap Watchlist", "coinmarketcap"],
    ["CMC Votes", "coinmarketcap"],
    ["Shopee Followers", "shopee"],
    ["Kick Livestream Viewers", "kick"],
    ["KICK followers", "kick"],
    ["Kwai Likes", "kwai"],
    ["LinkedIn Connections", "linkedin"],
    ["Linked In Followers", "linkedin"],
    ["Snapchat Story Views", "snapchat"],
    ["Google Maps Reviews", "google-maps"],
    ["google maps rating", "google-maps"],
    ["TikTok Views", "tiktok"],
    ["Instagram Likes", "instagram"],
    ["IG Followers", "instagram"],
    ["YouTube Subscribers", "youtube"],
  ])("%s -> %s", (text, id) => expect(detectPlatform(text)).toBe(id));

  it("is case-insensitive", () => {
    expect(detectPlatform("WHATSAPP CHANNEL")).toBe("whatsapp");
    expect(detectPlatform("shopee")).toBe("shopee");
  });
  it("does not match inside other words", () => {
    expect(detectPlatform("Kickboxing Club")).toBeNull();
    expect(detectPlatform("Snapshot Backup")).toBeNull();
    expect(detectPlatform("Awards Show")).toBeNull();
  });
  it("returns null for unknown or empty text", () => {
    expect(detectPlatform("Clubhouse Members")).toBeNull();
    expect(detectPlatform("")).toBeNull();
    expect(detectPlatform(null)).toBeNull();
  });
  it("a specific brand wins over a generic word in the same name", () => {
    expect(detectPlatform("Google Maps Reviews | Traffic")).toBe("google-maps");
    expect(detectPlatform("WhatsApp Channel Members | Instagram style")).toBe("whatsapp");
  });
});

describe("groupPlatformId", () => {
  it("keeps a stored platform", () => expect(groupPlatformId("instagram", "WhatsApp")).toBe("instagram"));
  it("promotes lainnya categories that have their own chip", () => {
    for (const [label, id] of [["WhatsApp Channel Members", "whatsapp"], ["Shopee Likes", "shopee"], ["Snapchat Views", "snapchat"], ["LinkedIn Followers", "linkedin"], ["Kick Livestream", "kick"]]) {
      expect(groupPlatformId("lainnya", label)).toBe(id);
    }
    expect(promotedPlatformIds.sort()).toEqual(["kick", "linkedin", "shopee", "snapchat", "whatsapp"]);
  });
  it("keeps icon-only platforms under lainnya", () => {
    expect(groupPlatformId("lainnya", "Google Maps Reviews")).toBe("lainnya");
    expect(groupPlatformId("lainnya", "CoinMarketCap Votes")).toBe("lainnya");
    expect(groupPlatformId("lainnya", "Kwai Likes")).toBe("lainnya");
    expect(groupPlatformId(undefined, "Clubhouse")).toBe("lainnya");
  });
});

describe("icons", () => {
  it("every detectable platform has a real (non-generic) icon", () => {
    for (const label of ["WhatsApp", "CoinMarketCap", "Shopee", "Kick", "Kwai", "LinkedIn", "Snapchat", "Google Maps", "TikTok", "Instagram", "YouTube", "Discord", "Pinterest", "Website Traffic", "SEO Backlink"]) {
      expect(iconForCategory({ label })).not.toBe(GenericPlatformIcon);
    }
  });
  it("uses the name when the stored platform is the catch-all", () => {
    expect(iconForCategory({ platformId: "lainnya", label: "WhatsApp Channel Members" })).toBe(iconForPlatform("whatsapp"));
    expect(iconForCategory({ platformId: "lainnya", label: "Google Maps Reviews" })).toBe(iconForPlatform("google-maps"));
    expect(iconForCategory({ platformId: "lainnya", label: "Kick Livestream" })).toBe(iconForPlatform("kick"));
  });
  it("prefers the stored platform when it is specific", () => {
    expect(iconForCategory({ platformId: "tiktok", label: "Anything" })).toBe(iconForPlatform("tiktok"));
  });
  it("falls back to the neutral icon (never nothing)", () => {
    expect(iconForCategory({ platformId: "lainnya", label: "Clubhouse Members" })).toBe(GenericPlatformIcon);
    expect(iconForCategory({})).toBe(GenericPlatformIcon);
    expect(iconForPlatform("nope")).toBe(GenericPlatformIcon);
    expect(iconForPlatform(null)).toBe(GenericPlatformIcon);
  });
});
