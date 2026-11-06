// One place that decides which icon a category / platform gets. Brand glyphs come from react-icons (simple-icons, plus Font Awesome where simple-icons
// dropped the brand), imported one by one so the bundle only carries what is listed here. Icons are monochrome (currentColor): they take the text colour of
// whatever they sit in, so light and dark themes both work.
import type { ComponentType } from "react";
import { LayoutGrid, Globe, Rocket } from "lucide-react";
import {
  SiInstagram, SiYoutube, SiTiktok, SiX, SiSpotify, SiTelegram, SiFacebook, SiTwitch, SiReddit, SiWhatsapp, SiShopee, SiSnapchat, SiKick, SiKuaishou,
  SiCoinmarketcap, SiGooglemaps, SiDiscord, SiPinterest, SiThreads, SiSoundcloud, SiTrustpilot,
} from "react-icons/si";
import { FaLinkedin } from "react-icons/fa6";
import { detectPlatform, groupPlatformId } from "@/lib/platform-detect";

export type IconComponent = ComponentType<{ className?: string }>;

/** Neutral icon for anything without a brand glyph, so every row has an icon of the same size. */
export const GenericPlatformIcon: IconComponent = LayoutGrid as unknown as IconComponent;

const ICONS: Record<string, IconComponent> = {
  instagram: SiInstagram,
  youtube: SiYoutube,
  tiktok: SiTiktok,
  twitter: SiX,
  spotify: SiSpotify,
  telegram: SiTelegram,
  facebook: SiFacebook,
  twitch: SiTwitch,
  reddit: SiReddit,
  whatsapp: SiWhatsapp,
  shopee: SiShopee,
  snapchat: SiSnapchat,
  kick: SiKick,
  kwai: SiKuaishou,
  coinmarketcap: SiCoinmarketcap,
  "google-maps": SiGooglemaps,
  discord: SiDiscord,
  pinterest: SiPinterest,
  threads: SiThreads,
  soundcloud: SiSoundcloud,
  trustpilot: SiTrustpilot,
  linkedin: FaLinkedin as unknown as IconComponent,
  "website-traffic": Globe as unknown as IconComponent,
  "seo-backlink": Rocket as unknown as IconComponent,
};

/** Icon for a platform id; the generic icon for unknown ids (including "lainnya"). */
export function iconForPlatform(id: string | null | undefined): IconComponent {
  return (id && ICONS[id]) || GenericPlatformIcon;
}

/**
 * Icon for a category / service. The name is checked first (so "WhatsApp Channel Members" or "Google Maps Reviews" get their brand even when the stored
 * platform is the catch-all "lainnya"); then the stored platform id; then the generic icon.
 */
export function iconForCategory(category: { platformId?: string | null; label?: string | null }): IconComponent {
  const stored = category.platformId && category.platformId !== "lainnya" ? category.platformId : null;
  if (stored && ICONS[stored]) return ICONS[stored];
  const detected = detectPlatform(category.label);
  return (detected && ICONS[detected]) || GenericPlatformIcon;
}

export { detectPlatform, groupPlatformId };
