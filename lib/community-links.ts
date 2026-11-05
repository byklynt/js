/**
 * Community links (WhatsApp channel, Telegram channel, Telegram bot) set by an admin in Pengaturan Situs.
 * Pure and client-safe. The SAME validator runs on the server when saving AND again when a link is rendered, so a bad value in the
 * database (or a tampered client) can never become an href.
 */

export type CommunityKind = "whatsapp" | "telegram";
export type CommunityKey = "whatsappChannel" | "telegramChannel" | "telegramBot";
export type CommunityLinks = Record<CommunityKey, string>;

export const EMPTY_COMMUNITY: CommunityLinks = { whatsappChannel: "", telegramChannel: "", telegramBot: "" };
/** Cache tag of the cached read (invalidated on save). */
export const COMMUNITY_TAG = "community-links";

/** Exact hosts only: subdomains and look-alikes (wa.me.evil.com) are NOT accepted. */
export const COMMUNITY_HOSTS: Record<CommunityKind, readonly string[]> = {
  whatsapp: ["wa.me", "whatsapp.com", "chat.whatsapp.com"],
  telegram: ["t.me", "telegram.me"],
};

export const COMMUNITY_FIELDS: { key: CommunityKey; kind: CommunityKind; label: string; sidebarLabel: string; placeholder: string }[] = [
  { key: "whatsappChannel", kind: "whatsapp", label: "URL Saluran WhatsApp", sidebarLabel: "Saluran WhatsApp", placeholder: "https://whatsapp.com/channel/..." },
  { key: "telegramChannel", kind: "telegram", label: "URL Saluran Telegram", sidebarLabel: "Saluran Telegram", placeholder: "https://t.me/nama_saluran" },
  { key: "telegramBot", kind: "telegram", label: "URL Bot Telegram", sidebarLabel: "Bot Telegram", placeholder: "https://t.me/nama_bot" },
];

const MAX_LENGTH = 300;

export type CommunityResult = { ok: true; value: string } | { ok: false; message: string };

const hostList = (kind: CommunityKind) => COMMUNITY_HOSTS[kind].join(", ").replace(/, ([^,]*)$/, " atau $1");

/**
 * Empty -> ok with "" (disabled). Otherwise: https only, no credentials, no explicit port, host EXACTLY one of the allowed hosts for the
 * kind, and a path (a link to the channel / bot, not just the site). Returns the normalized URL (lower-case scheme and host).
 */
export function validateCommunityUrl(raw: string, kind: CommunityKind): CommunityResult {
  const text = (raw ?? "").trim();
  if (text === "") return { ok: true, value: "" };
  if (text.length > MAX_LENGTH) return { ok: false, message: `Tautan terlalu panjang (maksimal ${MAX_LENGTH} karakter).` };
  if (/[\s\u0000-\u001f\u007f]/.test(text)) return { ok: false, message: "Tautan tidak boleh berisi spasi atau karakter kontrol." };
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, message: "Tautan tidak valid. Mulai dengan https://." };
  }
  if (url.protocol !== "https:") return { ok: false, message: "Tautan harus memakai https://." };
  // userinfo in any form, also an empty one (https://@t.me/x), is refused: the URL parser would silently drop it
  if (url.username !== "" || url.password !== "" || /^[a-z][a-z0-9+.-]*:[/\\]{2}[^/?#\\]*@/i.test(text)) return { ok: false, message: "Tautan tidak boleh berisi nama pengguna atau password." };
  if (url.port !== "") return { ok: false, message: "Tautan tidak boleh memakai nomor port." };
  if (!COMMUNITY_HOSTS[kind].includes(url.hostname)) return { ok: false, message: `Alamat harus berasal dari ${hostList(kind)}.` };
  if (url.pathname === "/" || url.pathname === "") return { ok: false, message: "Tautan harus mengarah ke saluran atau bot tertentu, bukan halaman utama." };
  return { ok: true, value: url.href };
}

/** What may be rendered: every field re-validated; anything that does not pass becomes "" (hidden). */
export function sanitizeCommunityLinks(raw: unknown): CommunityLinks {
  const src = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const out: CommunityLinks = { ...EMPTY_COMMUNITY };
  for (const f of COMMUNITY_FIELDS) {
    const v = src[f.key];
    const r = typeof v === "string" ? validateCommunityUrl(v, f.kind) : null;
    out[f.key] = r && r.ok ? r.value : "";
  }
  return out;
}

/** The links that are set, in display order, ready for a menu or a footer. */
export function activeCommunityLinks(links: CommunityLinks): { key: CommunityKey; label: string; href: string }[] {
  return COMMUNITY_FIELDS.flatMap((f) => {
    const r = validateCommunityUrl(links[f.key] ?? "", f.kind);
    return r.ok && r.value ? [{ key: f.key, label: f.sidebarLabel, href: r.value }] : [];
  });
}
