export type RefillStatus = "menunggu" | "berjalan" | "selesai" | "ditolak";

export type RefillRequest = {
  id: string;
  orderId: string;
  platform: string;
  name: string;
  link: string;
  status: RefillStatus;
  createdAt: string;
};

export const refillStatusLabels: Record<RefillStatus, string> = {
  menunggu: "Menunggu",
  berjalan: "Sedang berjalan",
  selesai: "Selesai",
  ditolak: "Ditolak",
};

export const refillStatusFilters: { id: RefillStatus | "semua"; label: string }[] = [
  { id: "semua", label: "Semua" },
  { id: "menunggu", label: "Menunggu" },
  { id: "berjalan", label: "Sedang berjalan" },
  { id: "selesai", label: "Selesai" },
  { id: "ditolak", label: "Ditolak" },
];

// Mock data. TODO: load from the refills API.
export const refills: RefillRequest[] = [
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
