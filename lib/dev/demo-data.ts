/**
 * DEMO DATA. Only imported by tests and by scripts/seed-demo.ts (`npm run seed:demo`).
 * Nothing in the running app reads this file: normal startup seeds nothing.
 */
import { Flame } from "lucide-react";
import type { Category, IconComponent, Service } from "@/lib/dashboard-data";
import type { Order } from "@/lib/orders-data";
import type { Payment } from "@/lib/payments-data";
import type { RefillRequest } from "@/lib/refills-data";
import type { Refund } from "@/lib/refunds-data";
import type { Ticket, TicketMessage } from "@/lib/tickets-data";

export const demoCategories: Category[] = [
  { id: "cat-new", platformId: "", label: "Layanan Baru", icon: Flame as unknown as IconComponent },
  { id: "cat-ig-followers", platformId: "instagram", label: "Instagram Followers" },
  { id: "cat-ig-likes", platformId: "instagram", label: "Instagram Likes" },
  { id: "cat-ig-comments", platformId: "instagram", label: "Instagram Comments" },
  { id: "cat-tiktok-views", platformId: "tiktok", label: "TikTok Views" },
  { id: "cat-youtube-views", platformId: "youtube", label: "YouTube Views" },
  { id: "cat-telegram", platformId: "telegram", label: "Telegram" },
  { id: "cat-twitter-x", platformId: "twitter", label: "Twitter/X" },
];

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

export const demoServices: Service[] = [
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



function conversation(
  id: string,
  userText: string,
  userAt: string,
  replyText: string | null,
  replyAt?: string
): TicketMessage[] {
  const list: TicketMessage[] = [{ id: `${id}-1`, from: "user", text: userText, at: userAt }];
  if (replyText && replyAt) {
    list.push({ id: `${id}-2`, from: "support", text: replyText, at: replyAt });
  }
  return list;
}

// FROM lib/orders-data.ts
// Mock data. TODO: load from the orders API.
export const demoUserOrders: Order[] = [
  {
    id: "7112481", serviceId: "11062", platform: "tiktok",
    name: "11062 - TikTok Views + 10% Like | 🔘 Maks 100K | ⚡ Instan",
    link: "https://vt.tiktok.com/ZSgTV9aXT/", charge: 5000, quantity: 1000, startCount: 0, remains: 0,
    status: "berjalan", createdAt: "2026-11-01T04:19:41+07:00", refillable: false,
  },
  {
    id: "7025157", serviceId: "10693", platform: "facebook",
    name: "10693 - Facebook Followers | 🔘 Maks 100K | ⭐ Low Drop | ♻️ Refill 30 Hari | ⚡ Instan | 🚀 50K/Hari",
    link: "https://www.facebook.com/tokosobatku", charge: 18200, quantity: 2600, startCount: 6288, remains: 0,
    status: "selesai", createdAt: "2026-10-18T11:33:45+07:00", refillable: true,
  },
  {
    id: "6996240", serviceId: "11062", platform: "tiktok",
    name: "11062 - TikTok Views | 🔘 Kualitas Tinggi | ⚡ Instan | ♻️ Refill 30 Hari",
    link: "https://vt.tiktok.com/ZSgJle9H6/", charge: 12400, quantity: 104422, startCount: 14, remains: 0,
    status: "selesai", createdAt: "2026-10-14T04:03:50+07:00", refillable: true,
  },
  {
    id: "6996050", serviceId: "11062", platform: "tiktok",
    name: "11062 - TikTok Views | 🔘 Kualitas Tinggi | ⚡ Instan | ♻️ Refill 30 Hari",
    link: "https://vt.tiktok.com/ZSgJvKHAT/", charge: 12700, quantity: 107554, startCount: 20, remains: 0,
    status: "selesai", createdAt: "2026-10-14T03:08:28+07:00", refillable: true,
  },
  {
    id: "6977964", serviceId: "4742", platform: "tiktok",
    name: "4742 - TikTok Likes | 🔘 500K | ⚡ Mulai 1 Jam | 🚀 10K/Hari",
    link: "https://vt.tiktok.com/ZSgBq3Lm2/", charge: 8300, quantity: 5000, startCount: 312, remains: 5000,
    status: "dibatalkan", createdAt: "2026-10-11T13:18:02+07:00", refillable: false,
  },
  {
    id: "6951203", serviceId: "12001", platform: "telegram",
    name: "12001 - Telegram Post Views | 🔘 1 Post | ⚡ Instan | ⭐ Non Drop | 🚀 200K/Hari",
    link: "https://t.me/kanalpromosi/482", charge: 500, quantity: 1000, startCount: 2210, remains: 0,
    status: "selesai", createdAt: "2026-10-09T19:42:10+07:00", refillable: false,
  },
  {
    id: "6932877", serviceId: "10210", platform: "instagram",
    name: "10210 - Instagram Followers Target Indonesia | 👤 100% Aktif | ♻️ Refill 30 Hari | ⚡ Mulai Instan",
    link: "https://www.instagram.com/tokosobatku", charge: 42000, quantity: 2000, startCount: 1530, remains: 640,
    status: "sebagian", createdAt: "2026-10-07T08:25:33+07:00", refillable: false,
  },
  {
    id: "6918440", serviceId: "10388", platform: "youtube",
    name: "10388 - YouTube Views | 🔘 Retensi Tinggi | ⭐ Garansi 30 Hari | 🚀 5K/Hari",
    link: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", charge: 36500, quantity: 3000, startCount: 87, remains: 0,
    status: "selesai", createdAt: "2026-10-05T21:10:05+07:00", refillable: true,
  },
  {
    id: "6890125", serviceId: "10455", platform: "instagram",
    name: "10455 - Instagram Likes Target Indonesia | 👤 Real Active | ⚡ Mulai Instan",
    link: "https://www.instagram.com/p/C9xKq2LsT7a/", charge: 9600, quantity: 3000, startCount: 45, remains: 0,
    status: "diproses", createdAt: "2026-10-03T14:02:19+07:00", refillable: false,
  },
  {
    id: "6871934", serviceId: "10620", platform: "twitter",
    name: "10620 - Twitter/X Followers | 🔘 Global | ⭐ Non Drop | 🚀 2K/Hari",
    link: "https://x.com/tokosobatku", charge: 27800, quantity: 1000, startCount: 904, remains: 0,
    status: "selesai", createdAt: "2026-10-01T10:47:52+07:00", refillable: true,
  },
  {
    id: "6850011", serviceId: "10388", platform: "youtube",
    name: "10388 - YouTube Views | 🔘 Retensi Tinggi | ⭐ Garansi 30 Hari | 🚀 5K/Hari",
    link: "https://www.youtube.com/watch?v=9bZkp7q19f0", charge: 12200, quantity: 1000, startCount: 1204, remains: 1000,
    status: "menunggu", createdAt: "2026-09-29T17:31:26+07:00", refillable: false,
  },
  {
    id: "6829742", serviceId: "10210", platform: "instagram",
    name: "10210 - Instagram Followers Target Indonesia | 👤 100% Aktif | ♻️ Refill 30 Hari",
    link: "https://www.instagram.com/akunbaruku", charge: 21000, quantity: 1000, startCount: 310, remains: 180,
    status: "sebagian", createdAt: "2026-09-27T06:55:48+07:00", refillable: false,
  },
];

// FROM lib/refills-data.ts
// Mock data. TODO: load from the refills API.
export const demoUserRefills: RefillRequest[] = [
  {
    id: "219655", orderId: "6996240", platform: "tiktok",
    name: "11062 - TikTok Views | 🔘 Kualitas Tinggi | ⚡ Instan | ♻️ Refill 30 Hari",
    link: "https://vt.tiktok.com/ZSgJle9H6/", status: "berjalan", createdAt: "2026-10-11T13:15:55+07:00",
  },
  {
    id: "219412", orderId: "7025157", platform: "facebook",
    name: "10693 - Facebook Followers | 🔘 Maks 100K | ⭐ Low Drop | ♻️ Refill 30 Hari | ⚡ Instan",
    link: "https://www.facebook.com/tokosobatku", status: "selesai", createdAt: "2026-10-10T09:41:20+07:00",
  },
  {
    id: "219208", orderId: "6932877", platform: "instagram",
    name: "10210 - Instagram Followers Target Indonesia | 👤 100% Aktif | ♻️ Refill 30 Hari",
    link: "https://www.instagram.com/tokosobatku", status: "selesai", createdAt: "2026-10-09T21:05:07+07:00",
  },
  {
    id: "218977", orderId: "6918440", platform: "youtube",
    name: "10388 - YouTube Views | 🔘 Retensi Tinggi | ⭐ Garansi 30 Hari | 🚀 5K/Hari",
    link: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", status: "menunggu", createdAt: "2026-10-09T08:22:41+07:00",
  },
  {
    id: "218640", orderId: "6871934", platform: "twitter",
    name: "10620 - Twitter/X Followers | 🔘 Global | ⭐ Non Drop | 🚀 2K/Hari",
    link: "https://x.com/tokosobatku", status: "ditolak", createdAt: "2026-10-07T16:48:33+07:00",
  },
  {
    id: "218305", orderId: "6996050", platform: "tiktok",
    name: "11062 - TikTok Views | 🔘 Kualitas Tinggi | ⚡ Instan | ♻️ Refill 30 Hari",
    link: "https://vt.tiktok.com/ZSgJvKHAT/", status: "selesai", createdAt: "2026-10-06T11:09:18+07:00",
  },
  {
    id: "218011", orderId: "6951203", platform: "telegram",
    name: "12001 - Telegram Post Views | 🔘 1 Post | ⚡ Instan | ⭐ Non Drop | 🚀 200K/Hari",
    link: "https://t.me/kanalpromosi/482", status: "berjalan", createdAt: "2026-10-05T13:30:02+07:00",
  },
  {
    id: "217766", orderId: "6829742", platform: "instagram",
    name: "10210 - Instagram Followers Target Indonesia | 👤 100% Aktif | ♻️ Refill 30 Hari",
    link: "https://www.instagram.com/akunbaruku", status: "ditolak", createdAt: "2026-10-03T19:12:49+07:00",
  },
  {
    id: "217402", orderId: "6890125", platform: "instagram",
    name: "10455 - Instagram Likes Target Indonesia | 👤 Real Active | ⚡ Mulai Instan",
    link: "https://www.instagram.com/p/C9xKq2LsT7a/", status: "menunggu", createdAt: "2026-10-02T07:56:14+07:00",
  },
  {
    id: "217093", orderId: "6850011", platform: "youtube",
    name: "10388 - YouTube Views | 🔘 Retensi Tinggi | ⭐ Garansi 30 Hari | 🚀 5K/Hari",
    link: "https://www.youtube.com/watch?v=9bZkp7q19f0", status: "selesai", createdAt: "2026-09-30T10:18:36+07:00",
  },
];

// FROM lib/refunds-data.ts
// Mock data. TODO: load from the refunds API.
export const demoUserRefunds: Refund[] = [
  { id: "r1", orderId: "6977964", amount: 3000, status: "dibatalkan", createdAt: "2026-10-30T19:53:10+07:00" },
  { id: "r2", orderId: "7112481", amount: 2600, status: "dibatalkan", createdAt: "2026-10-19T08:30:43+07:00" },
  { id: "r3", orderId: "7025157", amount: 3300, status: "dibatalkan", createdAt: "2026-10-12T05:39:51+07:00" },
  { id: "r4", orderId: "6932877", amount: 6600, status: "sebagian", createdAt: "2026-10-11T18:49:56+07:00" },
  { id: "r5", orderId: "6996240", amount: 13800, status: "dibatalkan", createdAt: "2026-10-05T08:10:00+07:00" },
  { id: "r6", orderId: "6996050", amount: 33700, status: "dibatalkan", createdAt: "2026-10-05T07:21:28+07:00" },
  { id: "r7", orderId: "6951203", amount: 8000, status: "dibatalkan", createdAt: "2026-10-04T13:12:29+07:00" },
  { id: "r8", orderId: "6918440", amount: 13600, status: "dibatalkan", createdAt: "2026-10-04T13:12:29+07:00" },
  { id: "r9", orderId: "6890125", amount: 1700, status: "dibatalkan", createdAt: "2026-10-04T13:11:38+07:00" },
  { id: "r10", orderId: "6829742", amount: 9400, status: "sebagian", createdAt: "2026-10-03T22:04:17+07:00" },
  { id: "r11", orderId: "6871934", amount: 4200, status: "dibatalkan", createdAt: "2026-10-02T15:27:09+07:00" },
  { id: "r12", orderId: "6850011", amount: 21500, status: "dibatalkan", createdAt: "2026-10-01T09:45:52+07:00" },
  { id: "r13", orderId: "6977964", amount: 5100, status: "sebagian", createdAt: "2026-09-29T20:36:41+07:00" },
  { id: "r14", orderId: "6932877", amount: 7800, status: "dibatalkan", createdAt: "2026-09-28T12:08:23+07:00" },
];

// FROM lib/payments-data.ts
// Mock data. TODO: load from the payments API.
export const demoPayments: Payment[] = [
  { id: "215593", method: "QRIS", amount: 100000, status: "berhasil", createdAt: "2026-10-30T14:46:47+07:00" },
  { id: "215309", method: "E-Wallet (DANA)", amount: 50000, status: "berhasil", createdAt: "2026-10-29T09:03:02+07:00" },
  { id: "214870", method: "Transfer Bank (BCA)", amount: 250000, status: "menunggu", createdAt: "2026-10-27T20:15:11+07:00" },
  { id: "214102", method: "Virtual Account", amount: 75000, status: "gagal", createdAt: "2026-10-22T11:40:36+07:00" },
  { id: "213556", method: "QRIS", amount: 500000, status: "berhasil", createdAt: "2026-10-15T16:27:58+07:00" },
];

// FROM lib/tickets-data.ts
// Mock data. TODO: load from the support backend.
export const demoTickets: Ticket[] = [
  {
    id: "127276", title: "Pesanan - Percepat", status: "dibalas", updatedAt: "2026-10-11T14:37:05+07:00", unread: false,
    messages: conversation("127276", "Pesanan 7025157 sudah dua hari belum selesai, bisa dipercepat?", "2026-10-11T10:02:11+07:00",
      "Halo! Pesananmu sudah kami dorong ke antrean prioritas dan akan selesai dalam beberapa jam.", "2026-10-11T14:37:05+07:00"),
  },
  {
    id: "126698", title: "Pesanan - Refill", status: "dibalas", updatedAt: "2026-10-06T00:37:08+07:00", unread: false,
    messages: conversation("126698", "Jumlah followers turun setelah 10 hari, mohon di-refill. Pesanan 6932877.", "2026-10-05T21:15:40+07:00",
      "Refill sudah kami ajukan. Pantau lagi dalam 24 jam ya.", "2026-10-06T00:37:08+07:00"),
  },
  {
    id: "126697", title: "Pesanan - Refill", status: "dibalas", updatedAt: "2026-10-06T00:35:52+07:00", unread: true,
    messages: conversation("126697", "Mohon refill untuk pesanan 6996240, views berkurang sebagian.", "2026-10-05T21:10:02+07:00",
      "Refill untuk pesanan tersebut sedang berjalan. Terima kasih sudah menunggu.", "2026-10-06T00:35:52+07:00"),
  },
  {
    id: "126696", title: "Pesanan - Refill", status: "dibalas", updatedAt: "2026-10-06T00:34:50+07:00", unread: true,
    messages: conversation("126696", "Tolong refill pesanan 6996050 ya.", "2026-10-05T21:08:30+07:00",
      "Sudah kami proses. Jika masih turun setelah 2 hari, balas tiket ini.", "2026-10-06T00:34:50+07:00"),
  },
  {
    id: "126446", title: "Pesanan - Percepat", status: "dibalas", updatedAt: "2026-10-03T10:04:06+07:00", unread: false,
    messages: conversation("126446", "Bisa dipercepat untuk pesanan 6890125? Targetnya sore ini.", "2026-10-03T08:40:00+07:00",
      "Kami sudah meneruskan permintaanmu ke tim teknis.", "2026-10-03T10:04:06+07:00"),
  },
  {
    id: "126349", title: "Pesanan - Percepat", status: "dibalas", updatedAt: "2026-10-02T09:55:57+07:00", unread: false,
    messages: conversation("126349", "Pesanan 6871934 masih di status menunggu. Mohon dicek.", "2026-10-02T07:20:19+07:00",
      "Pesananmu sudah berjalan sekarang. Mohon maaf atas keterlambatannya.", "2026-10-02T09:55:57+07:00"),
  },
  {
    id: "126280", title: "Pesanan - Percepat", status: "dibalas", updatedAt: "2026-10-01T15:23:12+07:00", unread: true,
    messages: conversation("126280", "Mohon dipercepat, pelanggan saya menunggu hasilnya.", "2026-10-01T13:01:44+07:00",
      "Tim kami sedang menanganinya dan akan mengabari lagi di sini.", "2026-10-01T15:23:12+07:00"),
  },
  {
    id: "126115", title: "Lainnya", status: "dibalas", updatedAt: "2026-10-01T11:37:22+07:00", unread: true,
    messages: conversation("126115", "Apakah ada program reseller dengan harga khusus?", "2026-10-01T09:55:30+07:00",
      "Ada. Kamu bisa membuka menu Panel Anak atau membalas tiket ini untuk detail paketnya.", "2026-10-01T11:37:22+07:00"),
  },
  {
    id: "125902", title: "Pembayaran - Deposit Belum Masuk", status: "menunggu", updatedAt: "2026-09-29T18:12:40+07:00", unread: false,
    messages: conversation("125902", "Saya sudah transfer Rp 250.000 tapi saldo belum bertambah. Bukti transfer terlampir.", "2026-09-29T18:12:40+07:00", null),
  },
  {
    id: "125610", title: "Layanan - Saran Layanan", status: "ditutup", updatedAt: "2026-09-24T16:48:03+07:00", unread: false,
    messages: conversation("125610", "Bisa ditambahkan layanan komentar custom untuk Telegram?", "2026-09-24T12:30:00+07:00",
      "Terima kasih atas sarannya, sudah kami catat untuk tim produk. Tiket ini kami tutup.", "2026-09-24T16:48:03+07:00"),
  },
];