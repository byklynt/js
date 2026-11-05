import { describe, expect, it } from "vitest";
import { activeCommunityLinks, EMPTY_COMMUNITY, sanitizeCommunityLinks, validateCommunityUrl } from "@/lib/community-links";
import { communityLinksSchema } from "@/lib/admin-schemas";
import { adminNav, buildUserNav, userNav } from "@/lib/nav-config";

const ok = (url: string, kind: "whatsapp" | "telegram") => {
  const r = validateCommunityUrl(url, kind);
  return r.ok ? r.value : `ERR: ${r.message}`;
};
const bad = (url: string, kind: "whatsapp" | "telegram") => {
  const r = validateCommunityUrl(url, kind);
  expect(r.ok, url).toBe(false);
  return r.ok ? "" : r.message;
};

describe("community URL validator", () => {
  it("empty means disabled", () => {
    expect(validateCommunityUrl("", "whatsapp")).toEqual({ ok: true, value: "" });
    expect(validateCommunityUrl("   ", "telegram")).toEqual({ ok: true, value: "" });
  });

  it("accepts the allowed hosts over https", () => {
    expect(ok("https://wa.me/channel/abc", "whatsapp")).toBe("https://wa.me/channel/abc");
    expect(ok("https://whatsapp.com/channel/0029Va", "whatsapp")).toBe("https://whatsapp.com/channel/0029Va");
    expect(ok("https://chat.whatsapp.com/Invite123", "whatsapp")).toBe("https://chat.whatsapp.com/Invite123");
    expect(ok("https://t.me/jagoansosmed", "telegram")).toBe("https://t.me/jagoansosmed");
    expect(ok("https://telegram.me/jagoansosmed_bot", "telegram")).toBe("https://telegram.me/jagoansosmed_bot");
    expect(ok("https://t.me/jagoansosmed?start=ref", "telegram")).toBe("https://t.me/jagoansosmed?start=ref");
  });

  it("trims surrounding spaces and normalizes upper-case scheme and host", () => {
    expect(ok("  https://t.me/abc  ", "telegram")).toBe("https://t.me/abc");
    expect(ok("https://t.me/abc \n", "telegram")).toBe("https://t.me/abc");
    expect(ok("HTTPS://T.ME/Channel_Name", "telegram")).toBe("https://t.me/Channel_Name"); // host lower-cased, the path keeps its case
    expect(ok("https://CHAT.WhatsApp.com/X1", "whatsapp")).toBe("https://chat.whatsapp.com/X1");
  });

  it("keeps the two families apart: WhatsApp hosts only for WhatsApp, Telegram hosts only for Telegram", () => {
    expect(bad("https://t.me/abc", "whatsapp")).toMatch(/wa\.me, whatsapp\.com atau chat\.whatsapp\.com/);
    expect(bad("https://wa.me/abc", "telegram")).toMatch(/t\.me atau telegram\.me/);
    expect(bad("https://telegram.me/abc", "whatsapp")).toMatch(/Alamat harus berasal dari/);
  });

  it("rejects any other host", () => {
    expect(bad("https://example.com/channel", "whatsapp")).toMatch(/Alamat harus berasal dari/);
    expect(bad("https://evil.com/t.me/abc", "telegram")).toMatch(/Alamat harus berasal dari/);
    expect(bad("https://www.t.me/abc", "telegram")).toMatch(/Alamat harus berasal dari/); // subdomains are not on the list
    expect(bad("https://api.whatsapp.com/send", "whatsapp")).toMatch(/Alamat harus berasal dari/);
    expect(bad("https://wa.me./abc", "whatsapp")).toMatch(/Alamat harus berasal dari/); // trailing dot
  });

  it("rejects look-alike hosts", () => {
    expect(bad("https://wa.me.evil.com/abc", "whatsapp")).toMatch(/Alamat harus berasal dari/);
    expect(bad("https://t.me.evil.com/abc", "telegram")).toMatch(/Alamat harus berasal dari/);
    expect(bad("https://evilt.me/abc", "telegram")).toMatch(/Alamat harus berasal dari/);
    expect(bad("https://chat.whatsapp.com.evil.com/x", "whatsapp")).toMatch(/Alamat harus berasal dari/);
    expect(bad("https://t.me-evil.com/abc", "telegram")).toMatch(/Alamat harus berasal dari/);
    expect(bad("https://tʼme/abc", "telegram")).toBeTruthy(); // not even a valid host
    expect(bad("https://evil.com\\@t.me/x", "telegram")).toMatch(/Alamat harus berasal dari/); // a backslash cannot smuggle the host
  });

  it("rejects credentials (userinfo), including the t.me@evil.com trick", () => {
    expect(bad("https://t.me@evil.com/abc", "telegram")).toMatch(/nama pengguna atau password/);
    expect(bad("https://user:pass@t.me/abc", "telegram")).toMatch(/nama pengguna atau password/);
    expect(bad("https://wa.me:secret@evil.com/abc", "whatsapp")).toMatch(/nama pengguna atau password/);
    expect(bad("https://@t.me/abc", "telegram")).toBeTruthy();
  });

  it("rejects non-https schemes", () => {
    expect(bad("http://t.me/abc", "telegram")).toMatch(/https/);
    expect(bad("javascript:alert(1)", "telegram")).toMatch(/https/);
    expect(bad("JavaScript:alert(1)//t.me/x", "telegram")).toMatch(/https/);
    expect(bad("data:text/html,<script>alert(1)</script>", "whatsapp")).toMatch(/https/);
    expect(bad("ftp://t.me/abc", "telegram")).toMatch(/https/);
    expect(bad("//t.me/abc", "telegram")).toMatch(/tidak valid/); // no scheme
    expect(bad("t.me/abc", "telegram")).toMatch(/tidak valid/);
    expect(bad("tg://resolve?domain=abc", "telegram")).toMatch(/https/);
  });

  it("rejects ports, whitespace inside, the bare site and over-long values", () => {
    expect(bad("https://t.me:8443/abc", "telegram")).toMatch(/port/);
    expect(bad("https://t.me/ab c", "telegram")).toMatch(/spasi/);
    expect(bad("https://t.me/ab\u0000c", "telegram")).toMatch(/spasi atau karakter kontrol/);
    expect(bad("https://t.me/", "telegram")).toMatch(/saluran atau bot tertentu/);
    expect(bad("https://wa.me", "whatsapp")).toMatch(/saluran atau bot tertentu/);
    expect(bad(`https://t.me/${"a".repeat(300)}`, "telegram")).toMatch(/terlalu panjang/);
  });

  it("every message is Indonesian and never echoes the input", () => {
    const m = bad("https://t.me@evil.com/<script>", "telegram");
    expect(m).not.toContain("<script>");
    expect(m).not.toContain("evil.com");
  });
});

describe("what may be rendered", () => {
  it("sanitize keeps valid links and blanks everything else (a tampered database value never becomes an href)", () => {
    const s = sanitizeCommunityLinks({ whatsappChannel: "javascript:alert(1)", telegramChannel: " https://T.me/abc ", telegramBot: "https://t.me.evil.com/x", extra: "https://t.me/zzz" });
    expect(s).toEqual({ whatsappChannel: "", telegramChannel: "https://t.me/abc", telegramBot: "" });
    expect(sanitizeCommunityLinks(null)).toEqual(EMPTY_COMMUNITY);
    expect(sanitizeCommunityLinks({ telegramBot: 5 })).toEqual(EMPTY_COMMUNITY);
  });
  it("activeCommunityLinks lists only what is set, in display order", () => {
    expect(activeCommunityLinks(EMPTY_COMMUNITY)).toEqual([]);
    const l = activeCommunityLinks({ whatsappChannel: "https://wa.me/c", telegramChannel: "", telegramBot: "https://t.me/bot" });
    expect(l.map((x) => x.label)).toEqual(["Saluran WhatsApp", "Bot Telegram"]);
    expect(l.map((x) => x.href)).toEqual(["https://wa.me/c", "https://t.me/bot"]);
    // a value that fails validation is dropped even if it reaches this function
    expect(activeCommunityLinks({ whatsappChannel: "http://wa.me/c", telegramChannel: "", telegramBot: "" })).toEqual([]);
  });
});

describe("the admin schema (server-side validation)", () => {
  it("normalizes valid input and treats empty as disabled", () => {
    const r = communityLinksSchema.safeParse({ whatsappChannel: " https://WA.ME/c ", telegramChannel: "", telegramBot: "https://t.me/bot" });
    expect(r.success && r.data).toEqual({ whatsappChannel: "https://wa.me/c", telegramChannel: "", telegramBot: "https://t.me/bot" });
    expect(communityLinksSchema.safeParse({}).success).toBe(true);
  });
  it("rejects a malicious value with an Indonesian message naming the field", () => {
    const r = communityLinksSchema.safeParse({ whatsappChannel: "", telegramChannel: "javascript:alert(1)", telegramBot: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("URL Saluran Telegram: Tautan harus memakai https://.");
    const r2 = communityLinksSchema.safeParse({ whatsappChannel: "https://wa.me@evil.com/x", telegramChannel: "", telegramBot: "" });
    expect(r2.success).toBe(false);
    if (!r2.success) expect(r2.error.issues[0].message).toMatch(/^URL Saluran WhatsApp: /);
  });
});

describe("navigation never contains an empty or '#' link", () => {
  const all = { whatsappChannel: "https://wa.me/c", telegramChannel: "https://t.me/ch", telegramBot: "https://t.me/bot" };
  const navs = { userNav, adminNav, "user + all community links": buildUserNav(all), "user + one link": buildUserNav({ ...EMPTY_COMMUNITY, telegramBot: "https://t.me/bot" }) };
  for (const [name, nav] of Object.entries(navs)) {
    it(`${name}: every item has a real href (only the logout action has none)`, () => {
      for (const item of nav) {
        if (item.action === "logout") {
          expect(item.href, item.label).toBeUndefined();
          continue;
        }
        expect(item.href, `${item.label} has no href`).toBeTruthy();
        expect(item.href!.trim(), item.label).not.toBe("");
        expect(item.href, item.label).not.toBe("#");
        expect(item.href!.startsWith("#"), item.label).toBe(false);
        expect(item.href, item.label).toMatch(/^(\/|https:\/\/)/);
      }
    });
  }

  it("the community group appears only when a link is set, in the old position, without 'Aplikasi Mobile'", () => {
    expect(userNav.some((i) => i.group === "Tautan lainnya")).toBe(false);
    const nav = buildUserNav(all);
    const group = nav.filter((i) => i.group === "Tautan lainnya");
    expect(group.map((i) => i.label)).toEqual(["Saluran WhatsApp", "Saluran Telegram", "Bot Telegram"]);
    expect(group.every((i) => i.external === true && i.href!.startsWith("https://"))).toBe(true);
    // main items, then the community group, then Pengaturan / Keluar
    const groups = nav.map((i) => i.group).filter((g, i, a) => a.indexOf(g) === i);
    expect(groups).toEqual(["Menu utama", "Tautan lainnya", "Pengaturan"]);
    expect(nav.some((i) => /mobile/i.test(i.label))).toBe(false);
    expect(buildUserNav({ ...EMPTY_COMMUNITY, telegramChannel: "https://t.me/ch" }).filter((i) => i.group === "Tautan lainnya").map((i) => i.label)).toEqual(["Saluran Telegram"]);
  });
});
