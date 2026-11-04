export type OrderStatus =
  | "menunggu"
  | "diproses"
  | "berjalan"
  | "selesai"
  | "sebagian"
  | "dibatalkan"
  /** Could not be submitted to the provider after 3 attempts; the charge is refunded automatically. */
  | "gagal_kirim";

export type Order = {
  id: string;
  serviceId: string;
  platform: string;
  name: string;
  link: string;
  charge: number;
  quantity: number;
  startCount: number;
  remains: number;
  status: OrderStatus;
  createdAt: string;
  refillable: boolean;
};

export const orderStatusLabels: Record<OrderStatus, string> = {
  menunggu: "Menunggu",
  diproses: "Diproses",
  berjalan: "Sedang berjalan",
  selesai: "Selesai",
  sebagian: "Sebagian",
  dibatalkan: "Dibatalkan",
  gagal_kirim: "Gagal kirim",
};

export const orderStatusFilters: { id: OrderStatus | "semua"; label: string }[] = [
  { id: "semua", label: "Semua" },
  { id: "menunggu", label: "Menunggu" },
  { id: "diproses", label: "Diproses" },
  { id: "berjalan", label: "Sedang berjalan" },
  { id: "selesai", label: "Selesai" },
  { id: "sebagian", label: "Sebagian" },
  { id: "dibatalkan", label: "Dibatalkan" },
  { id: "gagal_kirim", label: "Gagal kirim" },
];

// Mock data. TODO: load from the orders API.
export const orders: Order[] = [
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
