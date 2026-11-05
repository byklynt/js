import type { ComponentType } from "react";
import { formatBalance } from "@/lib/balance";
import {
  LayoutGrid,
  WalletCards,
  Globe,
  ShoppingCart,
  Gem,
  ArrowDownToLine,
  Rocket,
  type LucideIcon,
} from "lucide-react";
import {
  SiInstagram,
  SiYoutube,
  SiTiktok,
  SiX,
  SiSpotify,
  SiTelegram,
  SiFacebook,
  SiTwitch,
  SiReddit,
} from "react-icons/si";

export type IconComponent = ComponentType<{ className?: string }>;

export const dashboardCopy = {
  welcomeTitle: "Selamat datang di JagoanSosmed",
  welcomeSubtitle: "Buat pesananmu dari sini",
  placeholderBody: "Fitur ini belum tersedia.",
} as const;

// ---------------------------------------------------------------------------
// Stat cards
// ---------------------------------------------------------------------------

export type StatTone = "sky" | "amber" | "emerald" | "rose" | "slate";

export type UserStats = { balance: number; totalOrders: number; rank: string; totalSpent: number };
export const emptyUserStats: UserStats = { balance: 0, totalOrders: 0, rank: "Starter", totalSpent: 0 };

export type StatCardData = { label: string; value: string; icon: LucideIcon; tone: StatTone; actionLabel: string; actionHref: string };

/** The four cards on /dashboard, from the signed-in user's real numbers (zeros for a new account). */
export function statCardsFor(stats: UserStats): StatCardData[] {
  return [
    { label: "Saldo Akun", value: formatBalance(stats.balance), icon: WalletCards, tone: "sky", actionLabel: "Tambah Saldo", actionHref: "/dashboard/add-funds" },
    { label: "Total Pesanan", value: stats.totalOrders.toLocaleString("id-ID"), icon: ShoppingCart, tone: "amber", actionLabel: "Pesanan Saya", actionHref: "/dashboard/orders" },
    { label: "Peringkat Pengguna", value: stats.rank, icon: Gem, tone: "emerald", actionLabel: "Lihat Layanan", actionHref: "/dashboard/services" },
    { label: "Total Pengeluaran", value: formatBalance(stats.totalSpent), icon: ArrowDownToLine, tone: "rose", actionLabel: "Mutasi Saldo", actionHref: "/dashboard/ledger" },
  ];
}

// ---------------------------------------------------------------------------
// Platforms / categories / services
// ---------------------------------------------------------------------------

export type Platform = {
  id: string;
  label: string;
  icon: IconComponent;
};

export const allPlatformsId = "semua";

export const platforms: Platform[] = [
  { id: "instagram", label: "Instagram", icon: SiInstagram },
  { id: "youtube", label: "YouTube", icon: SiYoutube },
  { id: "tiktok", label: "TikTok", icon: SiTiktok },
  { id: "twitter", label: "Twitter", icon: SiX },
  { id: "spotify", label: "Spotify", icon: SiSpotify },
  { id: "telegram", label: "Telegram", icon: SiTelegram },
  { id: "facebook", label: "Facebook", icon: SiFacebook },
  { id: "twitch", label: "Twitch", icon: SiTwitch },
  { id: "reddit", label: "Reddit", icon: SiReddit },
  { id: "website-traffic", label: "Website Traffic", icon: Globe as unknown as IconComponent },
  { id: "seo-backlink", label: "SEO Backlink", icon: Rocket as unknown as IconComponent },
];

export type Category = {
  id: string;
  platformId: string;
  label: string;
  icon?: IconComponent;
};

export function getCategoryIcon(category: { platformId: string; icon?: IconComponent }): IconComponent {
  if (category.icon) return category.icon;
  const platform = platforms.find((p) => p.id === category.platformId);
  return platform?.icon ?? (LayoutGrid as unknown as IconComponent);
}

export type Service = {
  id: string;
  categoryId: string;
  name: string;
  badges: string[];
  pricePer1000: number;
  min: number;
  max: number;
  speedPerHour: number;
  startTime: string;
  refillDays: number | null;
  guarantee: string;
  /** Human-readable delivery estimate shown in the detail panel. */
  estimate: string;
  linkFormat: string;
  description: string[];
};

export const rupiahFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

export function formatRupiah(value: number): string {
  return rupiahFormatter.format(value);
}

export function getBadgeEmoji(text: string): string {
  const t = text.toLowerCase();
  if (t.includes("instan") || t.includes("cepat")) return "⚡";
  if (t.includes("non drop") || t.includes("real") || t.includes("hq")) return "⭐";
  if (t.includes("garansi") || t.includes("refill")) return "🔄";
  if (t.includes("post")) return "🔘";
  if (t.includes("ai")) return "✨";
  if (t.includes("custom") || t.includes("tulis")) return "✍️";
  if (
    t.includes("indonesia") ||
    t.includes("global") ||
    t.includes("negara") ||
    t.includes("wanita") ||
    t.includes("aktif") ||
    t.includes("latin")
  )
    return "👤";
  if (/\d/.test(t) || t.includes("hari")) return "🚀";
  return "🔘";
}

export function formatPricePer1000(value: number): string {
  return `Rp ${value.toLocaleString("id-ID")}/1000`;
}

/** "Nama | 🔘 1 Post | ⚡ Instan | ..." (no price) */
export function getServiceTitle(service: Service): string {
  return [service.name, ...service.badges.map((b) => `${getBadgeEmoji(b)} ${b}`)].join(" | ");
}

/** Full select-list name: title + " - Rp 500/1000" */
export function getServiceFullName(service: Service): string {
  return `${getServiceTitle(service)} - ${formatPricePer1000(service.pricePer1000)}`;
}
