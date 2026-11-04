import type { ComponentType } from "react";
import { mockBalance, formatBalance } from "@/lib/balance";
import {
  LayoutGrid,
  WalletCards,
  Globe,
  ShoppingCart,
  Gem,
  ArrowDownToLine,
  Flame,
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
  welcomeSubtitle: "Lebih dari 8 tahun pengalaman menyediakan layanan SMM",
  placeholderBody:
    "Fitur ini sedang dalam pengembangan. Kami akan menghadirkannya untukmu secepatnya.",
} as const;

// ---------------------------------------------------------------------------
// Stat cards
// ---------------------------------------------------------------------------

export type StatTone = "sky" | "amber" | "emerald" | "rose";

export const statCards: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone: StatTone;
  actionLabel: string;
  actionHref: string;
}[] = [
  {
    label: "Saldo Akun",
    value: formatBalance(mockBalance),
    icon: WalletCards,
    tone: "sky",
    actionLabel: "Tambah Saldo",
    actionHref: "/dashboard/add-funds",
  },
  {
    label: "Total Pesanan",
    value: "7.010.945",
    icon: ShoppingCart,
    tone: "amber",
    actionLabel: "Pesanan Saya",
    actionHref: "/dashboard/orders",
  },
  {
    label: "Peringkat Pengguna",
    value: "Starter",
    icon: Gem,
    tone: "emerald",
    actionLabel: "Lihat Peringkat",
    actionHref: "#",
  },
  {
    label: "Total Pengeluaran",
    value: "Rp0",
    icon: ArrowDownToLine,
    tone: "rose",
    actionLabel: "Tambah Saldo",
    actionHref: "/dashboard/add-funds",
  },
];

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

export const categories: Category[] = [
  { id: "cat-new", platformId: "", label: "Layanan Baru", icon: Flame as unknown as IconComponent },
  { id: "cat-ig-followers", platformId: "instagram", label: "Instagram Followers" },
  { id: "cat-ig-likes", platformId: "instagram", label: "Instagram Likes" },
  { id: "cat-ig-comments", platformId: "instagram", label: "Instagram Comments" },
  { id: "cat-tiktok-views", platformId: "tiktok", label: "TikTok Views" },
  { id: "cat-youtube-views", platformId: "youtube", label: "YouTube Views" },
  { id: "cat-telegram", platformId: "telegram", label: "Telegram" },
  { id: "cat-twitter-x", platformId: "twitter", label: "Twitter/X" },
];

export function getCategoryIcon(category: Category): IconComponent {
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

function buildDescription(opts: {
  startTime: string;
  guarantee: string;
  max: number;
  refillDays: number | null;
  linkFormat: string;
}): string[] {
  const lines = [
    `Mulai: ${opts.startTime}`,
    `Garansi: ${opts.guarantee}`,
    "Auto cancel aktif jika link tidak valid",
    `Maks pemesanan: ${opts.max.toLocaleString("id-ID")}`,
    `Link: ${opts.linkFormat}`,
  ];
  if (opts.refillDays) {
    lines.push(`Refill otomatis tersedia selama ${opts.refillDays} hari jika terjadi penurunan`);
  }
  return lines;
}

let serviceIdCounter = 12001;

function svc(opts: {
  categoryId: string;
  name: string;
  badges: string[];
  pricePer1000: number;
  min: number;
  max: number;
  speedPerHour: number;
  startTime: string;
  refillDays?: number | null;
  guarantee: string;
  estimate?: string;
  linkFormat: string;
}): Service {
  const refillDays = opts.refillDays ?? null;
  return {
    id: String(serviceIdCounter++),
    categoryId: opts.categoryId,
    name: opts.name,
    badges: opts.badges,
    pricePer1000: opts.pricePer1000,
    min: opts.min,
    max: opts.max,
    speedPerHour: opts.speedPerHour,
    startTime: opts.startTime,
    refillDays,
    guarantee: opts.guarantee,
    estimate: opts.estimate ?? opts.startTime,
    linkFormat: opts.linkFormat,
    description: buildDescription({
      startTime: opts.startTime,
      guarantee: opts.guarantee,
      max: opts.max,
      refillDays,
      linkFormat: opts.linkFormat,
    }),
  };
}

export const services: Service[] = [
  // New Services -----------------------------------------------------------
  svc({
    categoryId: "cat-new",
    name: "Telegram Post Views",
    badges: ["1 Post", "Instan", "Non Drop", "200K/Hari"],
    pricePer1000: 500,
    min: 10,
    max: 300000,
    speedPerHour: 20000,
    startTime: "Instan",
    guarantee: "Non Drop",
    estimate: "28 menit",
    linkFormat: "link postingan atau username channel Telegram",
  }),
  svc({
    categoryId: "cat-new",
    name: "Instagram Komentar AI Generated",
    badges: ["AI Generated", "100% Wanita", "Mulai Instan"],
    pricePer1000: 68000,
    min: 5,
    max: 1000,
    speedPerHour: 1500,
    startTime: "Instan",
    guarantee: "Non Drop",
    linkFormat: "postingan publik",
  }),
  svc({
    categoryId: "cat-new",
    name: "Instagram Komentar Custom",
    badges: ["Custom", "100% Aktif", "Mulai Instan"],
    pricePer1000: 72000,
    min: 5,
    max: 1000,
    speedPerHour: 1200,
    startTime: "Instan",
    guarantee: "Non Drop",
    linkFormat: "postingan publik",
  }),
  svc({
    categoryId: "cat-new",
    name: "Instagram Followers Target Indonesia",
    badges: ["Indonesia", "100% Aktif", "Refill 30 Hari"],
    pricePer1000: 21000,
    min: 20,
    max: 100000,
    speedPerHour: 5000,
    startTime: "15 Menit",
    refillDays: 30,
    guarantee: "Refill 30 Hari",
    linkFormat: "profil publik",
  }),
  svc({
    categoryId: "cat-new",
    name: "Instagram Likes Target Indonesia",
    badges: ["Indonesia", "100% Aktif", "Refill 30 Hari", "Mulai Instan"],
    pricePer1000: 3200,
    min: 20,
    max: 100000,
    speedPerHour: 8000,
    startTime: "15 Menit",
    refillDays: 30,
    guarantee: "Refill 30 Hari",
    linkFormat: "postingan publik",
  }),

  // Instagram Followers ------------------------------------------------------
  svc({
    categoryId: "cat-ig-followers",
    name: "Instagram Followers - Reguler",
    badges: ["Non Drop"],
    pricePer1000: 15000,
    min: 100,
    max: 50000,
    speedPerHour: 15000,
    startTime: "Instan",
    guarantee: "Non Drop",
    linkFormat: "profil publik",
  }),
  svc({
    categoryId: "cat-ig-followers",
    name: "Instagram Followers - Premium",
    badges: ["Non Drop", "Garansi 30 Hari"],
    pricePer1000: 24000,
    min: 50,
    max: 75000,
    speedPerHour: 25000,
    startTime: "Instan",
    refillDays: 30,
    guarantee: "Non Drop - Garansi 30 Hari",
    linkFormat: "profil publik",
  }),
  svc({
    categoryId: "cat-ig-followers",
    name: "Instagram Followers - Real Active",
    badges: ["Real Active", "Garansi 60 Hari"],
    pricePer1000: 36000,
    min: 50,
    max: 30000,
    speedPerHour: 8000,
    startTime: "0-1 Jam",
    refillDays: 60,
    guarantee: "Non Drop - Garansi 60 Hari",
    linkFormat: "profil publik",
  }),
  svc({
    categoryId: "cat-ig-followers",
    name: "Instagram Followers - World Wide",
    badges: ["Global", "Mulai Cepat"],
    pricePer1000: 13000,
    min: 100,
    max: 100000,
    speedPerHour: 20000,
    startTime: "Instan",
    guarantee: "Non Drop",
    linkFormat: "profil publik",
  }),
  svc({
    categoryId: "cat-ig-followers",
    name: "Instagram Followers - Target Negara Pilihan",
    badges: ["Pilih Negara", "Refill 30 Hari"],
    pricePer1000: 26000,
    min: 50,
    max: 50000,
    speedPerHour: 6000,
    startTime: "30 Menit",
    refillDays: 30,
    guarantee: "Refill 30 Hari",
    linkFormat: "profil publik",
  }),

  // Instagram Likes ----------------------------------------------------------
  svc({
    categoryId: "cat-ig-likes",
    name: "Instagram Likes - Reguler",
    badges: ["Non Drop"],
    pricePer1000: 4000,
    min: 50,
    max: 20000,
    speedPerHour: 10000,
    startTime: "Instan",
    guarantee: "Non Drop",
    linkFormat: "postingan publik",
  }),
  svc({
    categoryId: "cat-ig-likes",
    name: "Instagram Likes - Premium",
    badges: ["Non Drop", "Garansi 30 Hari"],
    pricePer1000: 6500,
    min: 50,
    max: 30000,
    speedPerHour: 18000,
    startTime: "Instan",
    refillDays: 30,
    guarantee: "Non Drop - Garansi 30 Hari",
    linkFormat: "postingan publik",
  }),
  svc({
    categoryId: "cat-ig-likes",
    name: "Instagram Likes - Real Active",
    badges: ["Real Active", "Garansi 60 Hari"],
    pricePer1000: 9500,
    min: 50,
    max: 15000,
    speedPerHour: 5000,
    startTime: "0-1 Jam",
    refillDays: 60,
    guarantee: "Non Drop - Garansi 60 Hari",
    linkFormat: "postingan publik",
  }),
  svc({
    categoryId: "cat-ig-likes",
    name: "Instagram Likes - Target Indonesia",
    badges: ["Indonesia", "Refill 30 Hari"],
    pricePer1000: 5200,
    min: 50,
    max: 20000,
    speedPerHour: 7000,
    startTime: "15 Menit",
    refillDays: 30,
    guarantee: "Refill 30 Hari",
    linkFormat: "postingan publik",
  }),

  // Instagram Comments ---------------------------------------------------------
  svc({
    categoryId: "cat-ig-comments",
    name: "Instagram Komentar Acak Positif",
    badges: ["Acak", "Bahasa Indonesia"],
    pricePer1000: 55000,
    min: 5,
    max: 2000,
    speedPerHour: 1000,
    startTime: "Instan",
    guarantee: "Non Drop",
    linkFormat: "postingan publik",
  }),
  svc({
    categoryId: "cat-ig-comments",
    name: "Instagram Komentar Custom",
    badges: ["Custom", "Tulis Sendiri"],
    pricePer1000: 72000,
    min: 5,
    max: 1000,
    speedPerHour: 800,
    startTime: "Instan",
    guarantee: "Non Drop",
    linkFormat: "postingan publik",
  }),
  svc({
    categoryId: "cat-ig-comments",
    name: "Instagram Komentar Emoji",
    badges: ["Emoji", "Mulai Instan"],
    pricePer1000: 38000,
    min: 5,
    max: 3000,
    speedPerHour: 1500,
    startTime: "Instan",
    guarantee: "Non Drop",
    linkFormat: "postingan publik",
  }),
  svc({
    categoryId: "cat-ig-comments",
    name: "Instagram Komentar AI Generated",
    badges: ["AI Generated", "Relevan"],
    pricePer1000: 68000,
    min: 5,
    max: 1000,
    speedPerHour: 1200,
    startTime: "Instan",
    guarantee: "Non Drop",
    linkFormat: "postingan publik",
  }),

  // TikTok Views ---------------------------------------------------------------
  svc({
    categoryId: "cat-tiktok-views",
    name: "TikTok Views - Reguler",
    badges: ["Non Drop"],
    pricePer1000: 500,
    min: 100,
    max: 5000000,
    speedPerHour: 500000,
    startTime: "Instan",
    guarantee: "Non Drop",
    linkFormat: "video publik",
  }),
  svc({
    categoryId: "cat-tiktok-views",
    name: "TikTok Views - Non Drop HQ",
    badges: ["HQ", "Garansi 15 Hari"],
    pricePer1000: 900,
    min: 100,
    max: 2000000,
    speedPerHour: 300000,
    startTime: "Instan",
    refillDays: 15,
    guarantee: "Non Drop - Garansi 15 Hari",
    linkFormat: "video publik",
  }),
  svc({
    categoryId: "cat-tiktok-views",
    name: "TikTok Views - Super Cepat",
    badges: ["Super Cepat", "Mulai Instan"],
    pricePer1000: 700,
    min: 500,
    max: 10000000,
    speedPerHour: 1000000,
    startTime: "Instan",
    guarantee: "Non Drop",
    linkFormat: "video publik",
  }),
  svc({
    categoryId: "cat-tiktok-views",
    name: "TikTok Views - Target Indonesia",
    badges: ["Indonesia", "Refill 30 Hari"],
    pricePer1000: 1200,
    min: 100,
    max: 1000000,
    speedPerHour: 150000,
    startTime: "15 Menit",
    refillDays: 30,
    guarantee: "Refill 30 Hari",
    linkFormat: "video publik",
  }),

  // YouTube Views ---------------------------------------------------------------
  svc({
    categoryId: "cat-youtube-views",
    name: "YouTube Views - Reguler",
    badges: ["Non Drop"],
    pricePer1000: 3500,
    min: 500,
    max: 1000000,
    speedPerHour: 30000,
    startTime: "Instan",
    guarantee: "Non Drop",
    linkFormat: "video publik",
  }),
  svc({
    categoryId: "cat-youtube-views",
    name: "YouTube Views - Retensi Tinggi",
    badges: ["Retensi Tinggi", "Garansi 30 Hari"],
    pricePer1000: 8500,
    min: 500,
    max: 500000,
    speedPerHour: 10000,
    startTime: "0-1 Jam",
    refillDays: 30,
    guarantee: "Non Drop - Garansi 30 Hari",
    linkFormat: "video publik",
  }),
  svc({
    categoryId: "cat-youtube-views",
    name: "YouTube Views - Non Drop",
    badges: ["HQ", "Garansi 15 Hari"],
    pricePer1000: 5200,
    min: 500,
    max: 700000,
    speedPerHour: 20000,
    startTime: "Instan",
    refillDays: 15,
    guarantee: "Non Drop - Garansi 15 Hari",
    linkFormat: "video publik",
  }),
  svc({
    categoryId: "cat-youtube-views",
    name: "YouTube Views - Real Active",
    badges: ["Real Active", "Garansi 60 Hari"],
    pricePer1000: 12000,
    min: 500,
    max: 300000,
    speedPerHour: 5000,
    startTime: "0-1 Jam",
    refillDays: 60,
    guarantee: "Non Drop - Garansi 60 Hari",
    linkFormat: "video publik",
  }),

  // Telegram ----------------------------------------------------------------
  svc({
    categoryId: "cat-telegram",
    name: "Telegram Member Channel",
    badges: ["Real", "Non Drop"],
    pricePer1000: 16000,
    min: 100,
    max: 100000,
    speedPerHour: 8000,
    startTime: "Instan",
    guarantee: "Non Drop",
    linkFormat: "username channel",
  }),
  svc({
    categoryId: "cat-telegram",
    name: "Telegram Member Grup",
    badges: ["Real", "Non Drop"],
    pricePer1000: 18000,
    min: 100,
    max: 50000,
    speedPerHour: 6000,
    startTime: "Instan",
    guarantee: "Non Drop",
    linkFormat: "username grup",
  }),
  svc({
    categoryId: "cat-telegram",
    name: "Telegram Post Views",
    badges: ["1 Postingan", "Mulai Instan"],
    pricePer1000: 1200,
    min: 100,
    max: 300000,
    speedPerHour: 20000,
    startTime: "Instan",
    guarantee: "Non Drop",
    linkFormat: "link postingan",
  }),
  svc({
    categoryId: "cat-telegram",
    name: "Telegram Reaksi Postingan",
    badges: ["Emoji", "Mulai Instan"],
    pricePer1000: 2500,
    min: 50,
    max: 50000,
    speedPerHour: 5000,
    startTime: "Instan",
    guarantee: "Non Drop",
    linkFormat: "link postingan",
  }),

  // Twitter/X -----------------------------------------------------------------
  svc({
    categoryId: "cat-twitter-x",
    name: "Twitter/X Followers",
    badges: ["Non Drop"],
    pricePer1000: 18000,
    min: 50,
    max: 20000,
    speedPerHour: 4000,
    startTime: "Instan",
    guarantee: "Non Drop",
    linkFormat: "profil publik",
  }),
  svc({
    categoryId: "cat-twitter-x",
    name: "Twitter/X Likes",
    badges: ["Non Drop"],
    pricePer1000: 6000,
    min: 50,
    max: 10000,
    speedPerHour: 6000,
    startTime: "Instan",
    guarantee: "Non Drop",
    linkFormat: "postingan publik",
  }),
  svc({
    categoryId: "cat-twitter-x",
    name: "Twitter/X Retweet",
    badges: ["Non Drop"],
    pricePer1000: 7500,
    min: 50,
    max: 10000,
    speedPerHour: 5000,
    startTime: "Instan",
    guarantee: "Non Drop",
    linkFormat: "postingan publik",
  }),
  svc({
    categoryId: "cat-twitter-x",
    name: "Twitter/X Views",
    badges: ["Mulai Instan", "Non Drop"],
    pricePer1000: 600,
    min: 100,
    max: 500000,
    speedPerHour: 50000,
    startTime: "Instan",
    guarantee: "Non Drop",
    linkFormat: "postingan publik",
  }),
];

export function getCategoriesByPlatform(platformId: string): Category[] {
  if (platformId === allPlatformsId) return categories;
  return categories.filter((c) => c.platformId === platformId);
}

export function getServicesByCategory(categoryId: string): Service[] {
  return services.filter((s) => s.categoryId === categoryId);
}

export function getPlatformForCategory(categoryId: string): Platform | undefined {
  const category = categories.find((c) => c.id === categoryId);
  if (!category) return undefined;
  return platforms.find((p) => p.id === category.platformId);
}

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
