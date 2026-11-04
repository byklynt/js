import { Bell, Globe, KeyRound, Lock, Receipt, SlidersHorizontal, type LucideIcon } from "lucide-react";

export type SettingsNavItem = { href: string; label: string; icon: LucideIcon };

export const settingsNav: SettingsNavItem[] = [
  { href: "/dashboard/settings", label: "Keamanan", icon: Lock },
  { href: "/dashboard/settings/2fa", label: "2FA", icon: KeyRound },
  { href: "/dashboard/settings/experience", label: "Pengalaman Pengguna", icon: SlidersHorizontal },
  { href: "/dashboard/settings/timezone-api", label: "Zona Waktu", icon: Globe },
  { href: "/dashboard/settings/invoice", label: "Detail Invoice", icon: Receipt },
  { href: "/dashboard/settings/notifications", label: "Notifikasi", icon: Bell },
];


export const timezones: { id: string; label: string }[] = [
  { id: "Asia/Jakarta", label: "Asia/Jakarta (WIB, UTC+7)" },
  { id: "Asia/Makassar", label: "Asia/Makassar (WITA, UTC+8)" },
  { id: "Asia/Jayapura", label: "Asia/Jayapura (WIT, UTC+9)" },
  { id: "Asia/Singapore", label: "Asia/Singapore (UTC+8)" },
  { id: "Asia/Kuala_Lumpur", label: "Asia/Kuala Lumpur (UTC+8)" },
  { id: "Asia/Bangkok", label: "Asia/Bangkok (UTC+7)" },
  { id: "Asia/Tokyo", label: "Asia/Tokyo (UTC+9)" },
  { id: "Asia/Dubai", label: "Asia/Dubai (UTC+4)" },
  { id: "Europe/London", label: "Europe/London (UTC+0)" },
  { id: "Europe/Berlin", label: "Europe/Berlin (UTC+1)" },
  { id: "America/New_York", label: "America/New York (UTC-5)" },
  { id: "America/Los_Angeles", label: "America/Los Angeles (UTC-8)" },
  { id: "Australia/Sydney", label: "Australia/Sydney (UTC+11)" },
  { id: "UTC", label: "UTC (UTC+0)" },
];

export const notificationEvents = [
  { id: "orderDone", label: "Pesanan selesai", hint: "Kabari saat pesananmu selesai diproses." },
  { id: "ticketReply", label: "Balasan tiket", hint: "Kabari saat tim support membalas tiketmu." },
  { id: "serviceUpdate", label: "Pembaruan layanan", hint: "Perubahan harga, layanan baru, dan gangguan." },
  { id: "promo", label: "Promo & bonus", hint: "Penawaran dan bonus deposit terbaru." },
] as const;

export const notificationChannels = [
  { id: "email", label: "Email" },
  { id: "telegram", label: "Telegram" },
  { id: "whatsapp", label: "WhatsApp" },
] as const;

export const languages = [
  { id: "id", label: "Indonesia" },
  { id: "en", label: "English" },
];
