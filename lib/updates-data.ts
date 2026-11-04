import {
  categories,
  getServiceTitle,
  platforms,
  services,
  type Service,
} from "@/lib/dashboard-data";

import type { AnnouncementLevel } from "@/lib/announcements-data";

export type UpdateType = "baru" | "naik" | "turun" | "nonaktif" | "perubahan" | "pengumuman";

export type ServiceUpdate = {
  id: string;
  serviceId: string;
  platform: string;
  name: string;
  type: UpdateType;
  /** ISO date (yyyy-mm-dd) */
  date: string;
  detail: string;
  /** Set for admin announcements shown on the updates page (type "pengumuman"). */
  announcement?: { body: string; level: AnnouncementLevel; publishAt: string };
};

/**
 * Fixed "today" for the mock data so server and client render the same
 * "Hari ini" / "Kemarin" labels. TODO: use the real date once updates come from the API.
 */
export const MOCK_TODAY = "2026-11-04";

export const updateTypeLabels: Record<UpdateType, string> = {
  baru: "Layanan baru",
  naik: "Harga naik",
  turun: "Harga turun",
  nonaktif: "Dinonaktifkan",
  perubahan: "Perubahan",
  pengumuman: "Pengumuman",
};

export const updateTypeFilters: { id: UpdateType | "semua"; label: string }[] = [
  { id: "semua", label: "Semua" },
  { id: "baru", label: "Layanan baru" },
  { id: "naik", label: "Harga naik" },
  { id: "turun", label: "Harga turun" },
  { id: "nonaktif", label: "Layanan dinonaktifkan" },
  { id: "perubahan", label: "Perubahan layanan" },
  { id: "pengumuman", label: "Pengumuman" },
];

function platformOf(service: Service): string {
  const category = categories.find((c) => c.id === service.categoryId);
  if (category?.platformId) return category.platformId;
  const lower = service.name.toLowerCase();
  const found = platforms.find((p) => lower.includes(p.label.toLowerCase().replace("/x", "")));
  return found?.id ?? "instagram";
}

const rupiah = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

function detailFor(type: UpdateType, service: Service): string {
  const price = service.pricePer1000;
  switch (type) {
    case "baru":
      return `Layanan baru tersedia dengan harga ${rupiah(price)} per 1000.`;
    case "naik":
      return `Harga berubah dari ${rupiah(Math.round(price / 1.3))} menjadi ${rupiah(price)} per 1000.`;
    case "turun":
      return `Harga berubah dari ${rupiah(Math.round(price * 1.25))} menjadi ${rupiah(price)} per 1000.`;
    case "nonaktif":
      return "Layanan dinonaktifkan sementara karena penyedia sedang mengalami gangguan.";
    case "pengumuman":
      return "";
    case "perubahan":
      return `Kecepatan dan batas pesanan diperbarui menjadi ${service.min.toLocaleString("id-ID")} - ${service.max.toLocaleString("id-ID")}.`;
  }
}

// [index into the services mock, type, date] - newest first.
const plan: [number, UpdateType, string][] = [
  [0, "baru", "2026-11-04"], [1, "baru", "2026-11-04"], [2, "baru", "2026-11-04"],
  [3, "naik", "2026-11-04"], [4, "turun", "2026-11-04"], [5, "perubahan", "2026-11-03"],
  [6, "naik", "2026-11-03"], [7, "nonaktif", "2026-11-03"], [8, "baru", "2026-11-03"],
  [9, "turun", "2026-11-02"], [10, "perubahan", "2026-11-02"], [11, "naik", "2026-11-02"],
  [12, "baru", "2026-11-01"], [13, "nonaktif", "2026-11-01"], [14, "turun", "2026-11-01"],
  [15, "perubahan", "2026-10-31"], [16, "naik", "2026-10-31"], [17, "baru", "2026-10-31"],
  [18, "turun", "2026-10-30"], [19, "nonaktif", "2026-10-30"], [20, "perubahan", "2026-10-29"],
  [21, "baru", "2026-10-29"], [22, "naik", "2026-10-28"], [23, "turun", "2026-10-28"],
];

// Mock data derived from the services mock so rows link to real services.
// TODO: load from the updates API.
export const updates: ServiceUpdate[] = plan.map(([index, type, date], i) => {
  const service = services[index % services.length];
  return {
    id: `u${i + 1}`,
    serviceId: service.id,
    platform: platformOf(service),
    name: getServiceTitle(service),
    type,
    date,
    detail: detailFor(type, service),
  };
});

const dateFormatter = new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "UTC" });

function shiftDay(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "Hari ini", "Kemarin", or a long id-ID date. */
export function formatUpdateGroupLabel(iso: string): string {
  if (iso === MOCK_TODAY) return "Hari ini";
  if (iso === shiftDay(MOCK_TODAY, -1)) return "Kemarin";
  return dateFormatter.format(new Date(`${iso}T00:00:00Z`));
}
