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

/** Exact hosts only, after ONE leading "www." is stripped: subdomains and look-alikes (wa.me.evil.com, evilwhatsapp.com) are NOT accepted. */
export const COMMUNITY_HOSTS: Record<CommunityKind, readonly string[]> = {
  whatsapp: ["wa.me", "whatsapp.com", "chat.whatsapp.com"],
  telegram: ["t.me", "telegram.me"],
};

export const COMMUNITY_FIELDS: { key: CommunityKey; kind: CommunityKind; label: string; sidebarLabel: string; placeholder: string; example: string }[] = [
  { key: "whatsappChannel", kind: "whatsapp", label: "URL Saluran WhatsApp", sidebarLabel: "Saluran WhatsApp", placeholder: "https://whatsapp.com/channel/...", example: "https://whatsapp.com/channel/0029Va..." },
  { key: "telegramChannel", kind: "telegram", label: "URL Saluran Telegram", sidebarLabel: "Saluran Telegram", placeholder: "https://t.me/nama_saluran", example: "https://t.me/namasaluran" },
  { key: "telegramBot", kind: "telegram", label: "URL Bot Telegram", sidebarLabel: "Bot Telegram", placeholder: "https://t.me/nama_bot", example: "https://t.me/nama_bot" },
];

const MAX_LENGTH = 300;

/** ok: the normalized URL (and a friendly warning when the link is valid but looks unusual). */
export type CommunityResult = { ok: true; value: string; warning?: string } | { ok: false; message: string };

const hostList = (kind: CommunityKind) => COMMUNITY_HOSTS[kind].join(", ").replace(/, ([^,]*)$/, " atau $1");
const exampleFor = (kind: CommunityKind, field?: CommunityKey) =>
  COMMUNITY_FIELDS.find((f) => f.key === (field ?? (kind === "whatsapp" ? "whatsappChannel" : "telegramChannel")))!.example;

const WA_CHANNEL_ID = /^[A-Za-z0-9]{10,}$/;
const WA_INVITE = /^[A-Za-z0-9_-]{6,}$/;
const WA_PHONE = /^\d{6,15}$/;
const TG_NAME = /^[A-Za-z0-9_]{4,32}$/;
const TG_INVITE = /^[A-Za-z0-9_-]{6,}$/;

/** The path of a link, checked per host. Returns an error text (without the example) or null. `segs` are the path segments (none empty). */
function pathProblem(host: string, segs: string[], junk: string): string | null {
  if (host === "whatsapp.com") {
    if (segs[0] !== "channel") return "Tautan whatsapp.com harus berbentuk https://whatsapp.com/channel/<kode saluran>.";
    if (segs.length === 1) return "Kode saluran belum ada setelah /channel/.";
    if (!WA_CHANNEL_ID.test(segs[1])) return "Kode saluran tidak valid: harus 10 karakter atau lebih, hanya huruf dan angka.";
    return segs.length > 2 ? junk : null;
  }
  if (host === "chat.whatsapp.com") {
    if (!WA_INVITE.test(segs[0])) return "Kode undangan grup tidak valid: minimal 6 karakter huruf, angka, strip, atau garis bawah.";
    return segs.length > 1 ? junk : null;
  }
  if (host === "wa.me") {
    if (segs[0] === "channel") {
      if (segs.length === 1) return "Kode saluran belum ada setelah /channel/.";
      if (!WA_CHANNEL_ID.test(segs[1])) return "Kode saluran tidak valid: harus 10 karakter atau lebih, hanya huruf dan angka.";
      return segs.length > 2 ? junk : null;
    }
    if (!WA_PHONE.test(segs[0])) return "Tautan wa.me harus berisi nomor telepon (angka saja, contoh https://wa.me/6281234567890) atau saluran (https://wa.me/channel/<kode>).";
    return segs.length > 1 ? junk : null;
  }
  // t.me / telegram.me
  const first = segs[0];
  if (first === "joinchat") {
    if (segs.length === 1) return "Kode undangan belum ada setelah /joinchat/.";
    if (!TG_INVITE.test(segs[1])) return "Kode undangan tidak valid: minimal 6 karakter huruf, angka, strip, atau garis bawah.";
    return segs.length > 2 ? junk : null;
  }
  if (first.startsWith("+")) {
    if (!TG_INVITE.test(first.slice(1))) return "Kode undangan tidak valid: minimal 6 karakter huruf, angka, strip, atau garis bawah setelah tanda +.";
    return segs.length > 1 ? junk : null;
  }
  if (!TG_NAME.test(first)) return "Nama tidak valid: 4 sampai 32 karakter, hanya huruf, angka, atau garis bawah.";
  return segs.length > 1 ? junk : null;
}

/**
 * Empty -> ok with "" (disabled). Otherwise: https only, no credentials, no explicit port, no whitespace, the host EXACTLY one of the allowed hosts for the kind
 * after ONE leading "www." is stripped, and a path with the shape of a real channel / bot / invite link for that host. Returns the normalized URL:
 * https, lower-case host without "www.", no fragment, no trailing slash. The path keeps its case (channel ids are case-sensitive); a query string is kept as entered.
 * Every error says what to fix and shows an example for the field. Pass `field` for that field's own example and the bot-name hint.
 */
export function validateCommunityUrl(raw: string, kind: CommunityKind, field?: CommunityKey): CommunityResult {
  const text = (raw ?? "").trim();
  if (text === "") return { ok: true, value: "" };
  const example = exampleFor(kind, field);
  const fail = (message: string): CommunityResult => ({ ok: false, message: `${message} Contoh: ${example}` });
  if (text.length > MAX_LENGTH) return fail(`Tautan terlalu panjang (maksimal ${MAX_LENGTH} karakter).`);
  if (/[\s\u0000-\u001f\u007f]/.test(text)) return fail("Tautan tidak boleh berisi spasi atau karakter kontrol.");
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return fail("Tautan tidak valid. Mulai dengan https://.");
  }
  if (url.protocol !== "https:") return fail("Tautan harus memakai https://.");
  // userinfo in any form, also an empty one (https://@t.me/x), is refused: the URL parser would silently drop it
  if (url.username !== "" || url.password !== "" || /^[a-z][a-z0-9+.-]*:[/\\]{2}[^/?#\\]*@/i.test(text)) return fail("Tautan tidak boleh berisi nama pengguna atau password.");
  if (url.port !== "") return fail("Tautan tidak boleh memakai nomor port.");
  // ONE leading "www." is allowed; what is left must equal a listed host (so www.www.wa.me, wa.me.evil.com, notwa.me and wa.me. stay out)
  const host = url.hostname.replace(/^www\./, "");
  if (!COMMUNITY_HOSTS[kind].includes(host)) return fail(`Alamat harus berasal dari ${hostList(kind)} (boleh diawali www.).`);
  const path = url.pathname.replace(/\/+$/, "");
  if (path === "") return fail("Tautan harus mengarah ke saluran atau bot tertentu, bukan halaman utama.");
  const segs = path.split("/").slice(1);
  if (segs.some((x) => x === "")) return fail("Tautan tidak valid: ada bagian kosong (//) di tengah alamat.");
  const what = field === "telegramBot" ? "nama bot" : host === "wa.me" && segs[0] !== "channel" ? "nomor" : "kode saluran";
  const problem = pathProblem(host, segs, `Ada tambahan yang tidak dikenali di akhir tautan. Hapus bagian setelah ${what}.`);
  if (problem) return fail(problem);
  const value = `https://${host}${path}${url.search}`;
  // a bot's name ends with "bot"; a link that does not is still saved, with a friendly hint
  const isBotName = !segs[0].startsWith("+") && segs[0] !== "joinchat" && /bot$/i.test(segs[0]);
  if (field === "telegramBot" && !isBotName) return { ok: true, value, warning: 'Nama bot biasanya diakhiri "bot" (contoh: https://t.me/nama_bot). Tautan tetap bisa disimpan.' };
  return { ok: true, value };
}

/** What may be rendered: every field re-validated; anything that does not pass becomes "" (hidden). */
export function sanitizeCommunityLinks(raw: unknown): CommunityLinks {
  const src = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const out: CommunityLinks = { ...EMPTY_COMMUNITY };
  for (const f of COMMUNITY_FIELDS) {
    const v = src[f.key];
    const r = typeof v === "string" ? validateCommunityUrl(v, f.kind, f.key) : null;
    out[f.key] = r && r.ok ? r.value : "";
  }
  return out;
}

/** The links that are set, in display order, ready for a menu or a footer. */
export function activeCommunityLinks(links: CommunityLinks): { key: CommunityKey; label: string; href: string }[] {
  return COMMUNITY_FIELDS.flatMap((f) => {
    const r = validateCommunityUrl(links[f.key] ?? "", f.kind, f.key);
    return r.ok && r.value ? [{ key: f.key, label: f.sidebarLabel, href: r.value }] : [];
  });
}
