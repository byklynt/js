import { describe, expect, it } from "vitest";
import { activeCommunityLinks, EMPTY_COMMUNITY, sanitizeCommunityLinks, validateCommunityUrl, type CommunityKey } from "@/lib/community-links";
import { communityLinksSchema } from "@/lib/admin-schemas";
import { adminNav, buildUserNav, userNav } from "@/lib/nav-config";

type Kind = "whatsapp" | "telegram";
const WA_ID = "0029VaAbCdEfGh12";
const ok = (url: string, kind: Kind, field?: CommunityKey) => {
  const r = validateCommunityUrl(url, kind, field);
  return r.ok ? r.value : `ERR: ${r.message}`;
};
const bad = (url: string, kind: Kind, field?: CommunityKey) => {
  const r = validateCommunityUrl(url, kind, field);
  expect(r.ok, url).toBe(false);
  return r.ok ? "" : r.message;
};

describe("community URL validator: valid links", () => {
  it("empty (or only spaces) means disabled", () => {
    expect(validateCommunityUrl("", "whatsapp")).toEqual({ ok: true, value: "" });
    expect(validateCommunityUrl("   ", "telegram")).toEqual({ ok: true, value: "" });
  });

  it("WhatsApp: channel on whatsapp.com, invite on chat.whatsapp.com, wa.me phone and wa.me channel", () => {
    expect(ok(`https://whatsapp.com/channel/${WA_ID}`, "whatsapp")).toBe(`https://whatsapp.com/channel/${WA_ID}`);
    expect(ok("https://chat.whatsapp.com/Invite123", "whatsapp")).toBe("https://chat.whatsapp.com/Invite123");
    expect(ok("https://wa.me/6281234567890", "whatsapp")).toBe("https://wa.me/6281234567890");
    expect(ok(`https://wa.me/channel/${WA_ID}`, "whatsapp")).toBe(`https://wa.me/channel/${WA_ID}`);
  });

  it("Telegram: /name (4+), /+invite, /joinchat/code, on t.me and telegram.me", () => {
    expect(ok("https://t.me/jagoansosmed", "telegram")).toBe("https://t.me/jagoansosmed");
    expect(ok("https://t.me/abcd", "telegram")).toBe("https://t.me/abcd"); // 4 characters is the minimum
    expect(ok("https://telegram.me/jagoansosmed_bot", "telegram")).toBe("https://telegram.me/jagoansosmed_bot");
    expect(ok("https://t.me/+AbCdEf123456", "telegram")).toBe("https://t.me/+AbCdEf123456");
    expect(ok("https://t.me/joinchat/AbCdEf123456", "telegram")).toBe("https://t.me/joinchat/AbCdEf123456");
    expect(ok("https://t.me/jagoansosmed?start=ref", "telegram")).toBe("https://t.me/jagoansosmed?start=ref");
  });

  it("an optional www. is accepted for every allowed host and removed when saving", () => {
    expect(ok(`https://www.whatsapp.com/channel/${WA_ID}`, "whatsapp")).toBe(`https://whatsapp.com/channel/${WA_ID}`);
    expect(ok("https://www.wa.me/6281234567890", "whatsapp")).toBe("https://wa.me/6281234567890");
    expect(ok("https://www.chat.whatsapp.com/Invite123", "whatsapp")).toBe("https://chat.whatsapp.com/Invite123");
    expect(ok("https://www.t.me/jagoansosmed", "telegram")).toBe("https://t.me/jagoansosmed");
    expect(ok("https://www.telegram.me/jagoansosmed", "telegram")).toBe("https://telegram.me/jagoansosmed");
  });

  it("normalizes: lower-case scheme and host, no www, no fragment, no trailing slash, no surrounding spaces; the path keeps its case", () => {
    expect(ok(`  https://WWW.WhatsApp.COM/channel/${WA_ID}/  `, "whatsapp")).toBe(`https://whatsapp.com/channel/${WA_ID}`);
    expect(ok(`https://whatsapp.com/channel/${WA_ID}#section`, "whatsapp")).toBe(`https://whatsapp.com/channel/${WA_ID}`);
    expect(ok(`https://whatsapp.com/channel/${WA_ID}/#x`, "whatsapp")).toBe(`https://whatsapp.com/channel/${WA_ID}`);
    expect(ok("  https://t.me/abcd  ", "telegram")).toBe("https://t.me/abcd");
    expect(ok("https://t.me/abcd \n", "telegram")).toBe("https://t.me/abcd");
    expect(ok("HTTPS://T.ME/Channel_Name", "telegram")).toBe("https://t.me/Channel_Name"); // channel ids and names are case-sensitive
    expect(ok("https://CHAT.WhatsApp.com/Ab1Cd2Ef3", "whatsapp")).toBe("https://chat.whatsapp.com/Ab1Cd2Ef3");
    expect(ok("https://t.me/Channel_Name///", "telegram")).toBe("https://t.me/Channel_Name");
    expect(ok("https://t.me/Channel_Name/?start=x", "telegram")).toBe("https://t.me/Channel_Name?start=x");
  });

  it("the normalized value validates to itself (rendering and re-validation see the same URL)", () => {
    for (const [u, k] of [
      [`https://WWW.whatsapp.com/channel/${WA_ID}/#a`, "whatsapp"],
      ["https://www.t.me/Some_Name/", "telegram"],
      ["https://t.me/+AbCdEf123456/", "telegram"],
      ["https://www.wa.me/6281234567890/", "whatsapp"],
    ] as [string, Kind][]) {
      const once = ok(u, k);
      expect(ok(once, k)).toBe(once);
    }
  });
});

describe("community URL validator: hosts", () => {
  it("keeps the two families apart: WhatsApp hosts only for WhatsApp, Telegram hosts only for Telegram", () => {
    expect(bad("https://t.me/abcd", "whatsapp")).toMatch(/wa\.me, whatsapp\.com atau chat\.whatsapp\.com/);
    expect(bad("https://wa.me/6281234567890", "telegram")).toMatch(/t\.me atau telegram\.me/);
    expect(bad("https://telegram.me/abcd", "whatsapp")).toMatch(/Alamat harus berasal dari/);
  });

  it("rejects any other host, other subdomains, a second www. and a trailing dot", () => {
    expect(bad("https://example.com/channel", "whatsapp")).toMatch(/Alamat harus berasal dari/);
    expect(bad("https://evil.com/t.me/abcd", "telegram")).toMatch(/Alamat harus berasal dari/);
    expect(bad("https://api.whatsapp.com/send", "whatsapp")).toMatch(/Alamat harus berasal dari/);
    expect(bad("https://web.t.me/abcd", "telegram")).toMatch(/Alamat harus berasal dari/);
    expect(bad("https://www.www.t.me/abcd", "telegram")).toMatch(/Alamat harus berasal dari/); // only ONE leading www. is dropped
    expect(bad("https://wwww.wa.me/6281234567890", "whatsapp")).toMatch(/Alamat harus berasal dari/);
    expect(bad("https://wa.me./6281234567890", "whatsapp")).toMatch(/Alamat harus berasal dari/);
  });

  it("rejects look-alike hosts (with and without www.)", () => {
    for (const u of [
      "https://wa.me.evil.com/6281234567890",
      "https://www.wa.me.evil.com/6281234567890",
      "https://evilwhatsapp.com/channel/0029VaAbCdEfGh12",
      "https://notwa.me/6281234567890",
      "https://whatsapp.com.evil.com/channel/0029VaAbCdEfGh12",
      "https://chat.whatsapp.com.evil.com/Invite123",
      "https://www.whatsapp.com.evil.com/channel/0029VaAbCdEfGh12",
      "https://whatsapp.com-evil.com/channel/0029VaAbCdEfGh12",
    ]) expect(bad(u, "whatsapp")).toMatch(/Alamat harus berasal dari/);
    for (const u of ["https://t.me.evil.com/abcd", "https://www.t.me.evil.com/abcd", "https://evilt.me/abcd", "https://t.me-evil.com/abcd", "https://telegram.me.evil.com/abcd", "https://nott.me/abcd"]) {
      expect(bad(u, "telegram")).toMatch(/Alamat harus berasal dari/);
    }
    expect(bad("https://tʼme/abcd", "telegram")).toBeTruthy(); // not even a valid host
    expect(bad("https://evil.com\\@t.me/abcd", "telegram")).toMatch(/Alamat harus berasal dari/); // a backslash cannot smuggle the host
  });
});

describe("community URL validator: security rules", () => {
  it("rejects credentials (userinfo), including the t.me@evil.com trick, also with www.", () => {
    expect(bad("https://t.me@evil.com/abcd", "telegram")).toMatch(/nama pengguna atau password/);
    expect(bad("https://user:pass@t.me/abcd", "telegram")).toMatch(/nama pengguna atau password/);
    expect(bad("https://user:pass@www.t.me/abcd", "telegram")).toMatch(/nama pengguna atau password/);
    expect(bad("https://wa.me:secret@evil.com/6281234567890", "whatsapp")).toMatch(/nama pengguna atau password/);
    expect(bad("https://@t.me/abcd", "telegram")).toBeTruthy();
  });

  it("rejects non-https schemes", () => {
    expect(bad("http://t.me/abcd", "telegram")).toMatch(/https/);
    expect(bad("http://www.whatsapp.com/channel/0029VaAbCdEfGh12", "whatsapp")).toMatch(/https/);
    expect(bad("javascript:alert(1)", "telegram")).toMatch(/https/);
    expect(bad("JavaScript:alert(1)//t.me/abcd", "telegram")).toMatch(/https/);
    expect(bad("data:text/html,<script>alert(1)</script>", "whatsapp")).toMatch(/https/);
    expect(bad("ftp://t.me/abcd", "telegram")).toMatch(/https/);
    expect(bad("//t.me/abcd", "telegram")).toMatch(/tidak valid/); // no scheme
    expect(bad("t.me/abcd", "telegram")).toMatch(/tidak valid/);
    expect(bad("tg://resolve?domain=abcd", "telegram")).toMatch(/https/);
  });

  it("rejects ports, whitespace and control characters, the bare site and over-long values", () => {
    expect(bad("https://t.me:8443/abcd", "telegram")).toMatch(/port/);
    expect(bad("https://www.t.me:8443/abcd", "telegram")).toMatch(/port/);
    expect(bad("https://t.me/ab cd", "telegram")).toMatch(/spasi/);
    expect(bad("https://t.me/ab\tcd", "telegram")).toMatch(/spasi/);
    expect(bad("https://t.me/ab\u0000cd", "telegram")).toMatch(/spasi atau karakter kontrol/);
    expect(bad("https://t.me/", "telegram")).toMatch(/saluran atau bot tertentu/);
    expect(bad("https://www.t.me", "telegram")).toMatch(/saluran atau bot tertentu/);
    expect(bad("https://wa.me", "whatsapp")).toMatch(/saluran atau bot tertentu/);
    expect(bad("https://wa.me///", "whatsapp")).toMatch(/saluran atau bot tertentu/);
    expect(bad(`https://t.me/${"a".repeat(300)}`, "telegram")).toMatch(/terlalu panjang/);
  });
});

describe("community URL validator: the shape of the path", () => {
  it("WhatsApp channel links must be /channel/<id> with 10+ letters and digits", () => {
    expect(bad("https://whatsapp.com/channel/abc", "whatsapp")).toMatch(/Kode saluran tidak valid/);
    expect(bad("https://whatsapp.com/channel/0029Va-AbCdEf", "whatsapp")).toMatch(/Kode saluran tidak valid/);
    expect(bad("https://whatsapp.com/channel/", "whatsapp")).toMatch(/Kode saluran belum ada/);
    expect(bad("https://whatsapp.com/channel", "whatsapp")).toMatch(/Kode saluran belum ada/);
    expect(bad("https://whatsapp.com/send?phone=1", "whatsapp")).toMatch(/harus berbentuk https:\/\/whatsapp\.com\/channel/);
    expect(bad("https://whatsapp.com/0029VaAbCdEfGh12", "whatsapp")).toMatch(/harus berbentuk/);
  });

  it("invites and wa.me paths have to look like invites / phone numbers / channels", () => {
    expect(bad("https://chat.whatsapp.com/ab", "whatsapp")).toMatch(/Kode undangan grup tidak valid/);
    expect(bad("https://wa.me/hello", "whatsapp")).toMatch(/nomor telepon/);
    expect(bad("https://wa.me/12", "whatsapp")).toMatch(/nomor telepon/);
    expect(bad("https://wa.me/channel/short", "whatsapp")).toMatch(/Kode saluran tidak valid/);
  });

  it("Telegram: names are 4-32 letters, digits or underscores; invites need a real code", () => {
    expect(bad("https://t.me/abc", "telegram")).toMatch(/Nama tidak valid/); // 3 characters
    expect(bad("https://t.me/nama-saluran", "telegram")).toMatch(/Nama tidak valid/);
    expect(bad(`https://t.me/${"a".repeat(33)}`, "telegram")).toMatch(/Nama tidak valid/);
    expect(bad("https://t.me/+ab", "telegram")).toMatch(/Kode undangan tidak valid/);
    expect(bad("https://t.me/joinchat", "telegram")).toMatch(/Kode undangan belum ada/);
    expect(bad("https://t.me/joinchat/ab", "telegram")).toMatch(/Kode undangan tidak valid/);
  });

  it("junk after a valid path gets a clear message instead of saving something broken", () => {
    const junk = /Ada tambahan yang tidak dikenali di akhir tautan\. Hapus bagian setelah kode saluran\./;
    expect(bad(`https://whatsapp.com/channel/${WA_ID}/100`, "whatsapp")).toMatch(junk);
    expect(bad(`https://www.whatsapp.com/channel/${WA_ID}/100/`, "whatsapp")).toMatch(junk);
    expect(bad("https://chat.whatsapp.com/Invite123/extra", "whatsapp")).toMatch(junk);
    expect(bad("https://t.me/jagoansosmed/100", "telegram")).toMatch(junk);
    expect(bad("https://t.me/+AbCdEf123456/1", "telegram")).toMatch(junk);
    expect(bad("https://t.me/joinchat/AbCdEf123456/1", "telegram")).toMatch(junk);
    expect(bad("https://t.me/jagoansosmed/100", "telegram", "telegramBot")).toMatch(/Hapus bagian setelah nama bot\./);
    expect(bad("https://wa.me/6281234567890/1", "whatsapp")).toMatch(/Hapus bagian setelah nomor\./);
    expect(bad("https://t.me/a//b", "telegram")).toMatch(/bagian kosong/);
  });

  it("a Telegram bot link without 'bot' at the end is saved with a friendly hint, not an error", () => {
    const r = validateCommunityUrl("https://t.me/jagoansosmed", "telegram", "telegramBot");
    expect(r).toMatchObject({ ok: true, value: "https://t.me/jagoansosmed" });
    expect(r.ok && r.warning).toMatch(/diakhiri "bot"/);
    for (const name of ["jagoan_bot", "JagoanBOT", "Jagoan_Bot"]) {
      const good = validateCommunityUrl(`https://t.me/${name}`, "telegram", "telegramBot");
      expect(good.ok && good.warning).toBeUndefined();
    }
    // a channel field never warns about it
    const channel = validateCommunityUrl("https://t.me/jagoansosmed", "telegram", "telegramChannel");
    expect(channel.ok && channel.warning).toBeUndefined();
  });
});

describe("community URL validator: messages", () => {
  it("every error is Indonesian, names the fix and shows an example for that field", () => {
    expect(bad("http://t.me/abcd", "whatsapp", "whatsappChannel")).toContain("Contoh: https://whatsapp.com/channel/0029Va...");
    expect(bad("http://t.me/abcd", "telegram", "telegramChannel")).toContain("Contoh: https://t.me/namasaluran");
    expect(bad("http://t.me/abcd", "telegram", "telegramBot")).toContain("Contoh: https://t.me/nama_bot");
    for (const u of ["javascript:alert(1)", "https://t.me:1/abcd", "https://evil.com/x", "https://t.me/ab", "https://t.me/abcd/1", "https://t.me/"]) {
      expect(bad(u, "telegram", "telegramChannel")).toContain("Contoh: https://t.me/namasaluran");
    }
  });

  it("an error never echoes the input", () => {
    const m = bad("https://t.me@evil.com/<script>", "telegram");
    expect(m).not.toContain("<script>");
    expect(m).not.toContain("evil.com");
  });
});

describe("what may be rendered", () => {
  it("sanitize keeps valid links and blanks everything else (a tampered database value never becomes an href)", () => {
    const s = sanitizeCommunityLinks({ whatsappChannel: "javascript:alert(1)", telegramChannel: " https://T.me/abcd ", telegramBot: "https://t.me.evil.com/x", extra: "https://t.me/zzz" });
    expect(s).toEqual({ whatsappChannel: "", telegramChannel: "https://t.me/abcd", telegramBot: "" });
    expect(sanitizeCommunityLinks(null)).toEqual(EMPTY_COMMUNITY);
    expect(sanitizeCommunityLinks({ telegramBot: 5 })).toEqual(EMPTY_COMMUNITY);
  });
  it("activeCommunityLinks lists only what is set, in display order", () => {
    expect(activeCommunityLinks(EMPTY_COMMUNITY)).toEqual([]);
    const l = activeCommunityLinks({ whatsappChannel: "https://wa.me/6281234567890", telegramChannel: "", telegramBot: "https://t.me/jagoan_bot" });
    expect(l.map((x) => x.label)).toEqual(["Saluran WhatsApp", "Bot Telegram"]);
    expect(l.map((x) => x.href)).toEqual(["https://wa.me/6281234567890", "https://t.me/jagoan_bot"]);
    // a value that fails validation is dropped even if it reaches this function
    expect(activeCommunityLinks({ whatsappChannel: "http://wa.me/6281234567890", telegramChannel: "", telegramBot: "" })).toEqual([]);
  });
});

describe("the admin schema (server-side validation)", () => {
  it("normalizes valid input and treats empty as disabled", () => {
    const r = communityLinksSchema.safeParse({ whatsappChannel: " https://WWW.WA.ME/6281234567890/ ", telegramChannel: "", telegramBot: "https://t.me/jagoan_bot" });
    expect(r.success && r.data).toEqual({ whatsappChannel: "https://wa.me/6281234567890", telegramChannel: "", telegramBot: "https://t.me/jagoan_bot" });
    expect(communityLinksSchema.safeParse({}).success).toBe(true);
  });
  it("rejects a malicious value with an Indonesian message naming the field", () => {
    const r = communityLinksSchema.safeParse({ whatsappChannel: "", telegramChannel: "javascript:alert(1)", telegramBot: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("URL Saluran Telegram: Tautan harus memakai https://. Contoh: https://t.me/namasaluran");
    const r2 = communityLinksSchema.safeParse({ whatsappChannel: "https://wa.me@evil.com/x", telegramChannel: "", telegramBot: "" });
    expect(r2.success).toBe(false);
    if (!r2.success) expect(r2.error.issues[0].message).toMatch(/^URL Saluran WhatsApp: /);
  });
});

describe("navigation never contains an empty or '#' link", () => {
  const all = { whatsappChannel: "https://wa.me/6281234567890", telegramChannel: "https://t.me/namasaluran", telegramBot: "https://t.me/jagoan_bot" };
  const navs = { userNav, adminNav, "user + all community links": buildUserNav(all), "user + one link": buildUserNav({ ...EMPTY_COMMUNITY, telegramBot: "https://t.me/jagoan_bot" }) };
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
    expect(buildUserNav({ ...EMPTY_COMMUNITY, telegramChannel: "https://t.me/namasaluran" }).filter((i) => i.group === "Tautan lainnya").map((i) => i.label)).toEqual(["Saluran Telegram"]);
  });
});
