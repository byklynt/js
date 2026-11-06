// Detects a social platform from a category / service name. Pure (no icons) so the server import code and the client can share it.
// Rules are tried in order and the FIRST match wins, so specific names come before the generic ones ("google maps" before anything with "google" or "maps").

export type PlatformRule = { id: string; label: string; re: RegExp; /** Gets its own chip on the dashboard (when the catalogue has services for it). The rest stay under "Lainnya". */ promoted?: boolean };

export const PLATFORM_RULES: PlatformRule[] = [
  { id: "google-maps", label: "Google Maps", re: /google\s*maps?|gmaps|\bmaps?\s+(review|ulasan|rating)/i },
  { id: "coinmarketcap", label: "CoinMarketCap", re: /coin\s*market\s*cap|\bcmc\b/i },
  { id: "whatsapp", label: "WhatsApp", re: /whats\s*app|\bwa\s+(channel|saluran|group|grup)|\bwa\b/i, promoted: true },
  { id: "shopee", label: "Shopee", re: /shopee/i, promoted: true },
  { id: "snapchat", label: "Snapchat", re: /snap\s*chat/i, promoted: true },
  { id: "linkedin", label: "LinkedIn", re: /linked\s*in/i, promoted: true },
  { id: "kick", label: "Kick", re: /\bkick(\.com)?\b/i, promoted: true },
  { id: "kwai", label: "Kwai", re: /\bkwai\b|kuaishou/i },
  { id: "instagram", label: "Instagram", re: /instagram|\big\b|\binsta\b/i },
  { id: "youtube", label: "YouTube", re: /you\s*tube|\byt\b/i },
  { id: "tiktok", label: "TikTok", re: /tik\s*tok/i },
  { id: "facebook", label: "Facebook", re: /facebook|\bfb\b/i },
  { id: "twitter", label: "Twitter", re: /twitter|\btweet|\bx\b|x\.com|x \(/i },
  { id: "telegram", label: "Telegram", re: /telegram/i },
  { id: "spotify", label: "Spotify", re: /spotify/i },
  { id: "twitch", label: "Twitch", re: /twitch/i },
  { id: "reddit", label: "Reddit", re: /reddit/i },
  { id: "discord", label: "Discord", re: /discord/i },
  { id: "pinterest", label: "Pinterest", re: /pinterest/i },
  { id: "threads", label: "Threads", re: /\bthreads\b/i },
  { id: "soundcloud", label: "SoundCloud", re: /sound\s*cloud/i },
  { id: "trustpilot", label: "Trustpilot", re: /trustpilot/i },
  { id: "website-traffic", label: "Website Traffic", re: /website traffic|web traffic|\btraffic\b/i },
  { id: "seo-backlink", label: "SEO Backlink", re: /\bseo\b|backlink/i },
];

/** The platform id (a key of PLATFORM_RULES) guessed from the text, or null. */
export function detectPlatform(text: string | null | undefined): string | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  return PLATFORM_RULES.find((r) => r.re.test(t))?.id ?? null;
}

export const promotedPlatformIds: string[] = PLATFORM_RULES.filter((r) => r.promoted).map((r) => r.id);

/** Ids that have their own chip / group in the UI: the original platforms, plus the promoted ones. */
const GROUPED = new Set(["instagram", "youtube", "tiktok", "twitter", "spotify", "telegram", "facebook", "twitch", "reddit", "website-traffic", "seo-backlink", ...promotedPlatformIds]);

/**
 * The platform a category is GROUPED under (chips, filters). The stored platform wins unless it is the catch-all "lainnya": then the name decides, and only
 * platforms that have their own chip count, so e.g. a Google Maps category stays in "Lainnya" (with its own icon).
 */
export function groupPlatformId(platformId: string | null | undefined, label: string | null | undefined): string {
  const stored = platformId || "lainnya";
  if (stored !== "lainnya") return stored;
  const d = detectPlatform(label);
  return d && GROUPED.has(d) ? d : "lainnya";
}
