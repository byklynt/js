import type { AnnouncementLevel } from "@/lib/announcements-data";
import { shiftDay, todayIso } from "@/lib/server/time";

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

const dateFormatter = new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "UTC" });

/** "Hari ini", "Kemarin", or a long id-ID date. */
export function formatUpdateGroupLabel(iso: string, today: string = todayIso()): string {
  if (iso === today) return "Hari ini";
  if (iso === shiftDay(today, -1)) return "Kemarin";
  return dateFormatter.format(new Date(`${iso}T00:00:00Z`));
}
