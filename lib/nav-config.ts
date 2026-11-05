import type { ComponentType } from "react";
import {
  Activity,
  ClipboardCheck,
  ClipboardList,
  Headset,
  LayoutDashboard,
  LayoutGrid,
  List,
  LogOut,
  Megaphone,
  ReceiptText,
  RefreshCcw,
  ScrollText,
  Server,
  Settings,
  ShoppingCart,
  Users,
  WalletCards,
  BookText,
  BarChart3,
  Bot,
} from "lucide-react";
import { FaTelegram, FaWhatsapp } from "react-icons/fa6";
import { activeCommunityLinks, EMPTY_COMMUNITY, type CommunityKey, type CommunityLinks } from "@/lib/community-links";
import type { TKey } from "@/lib/i18n/id";

export type NavIcon = ComponentType<{ className?: string }>;

export type NavItem = {
  label: string;
  /** Dictionary key for the label (lib/i18n). */
  labelKey?: TKey;
  /** Omit for action items such as logout. */
  href?: string;
  icon: NavIcon;
  /** Items sharing a group are rendered together; groups are separated by a short divider. */
  group: string;
  /** Key into the shell's `badges` map (e.g. unread tickets). */
  badgeKey?: string;
  /** Match the exact pathname only (otherwise sub-routes also count as active). */
  exact?: boolean;
  action?: "logout";
  /** An external link: opens in a new tab with rel="noopener noreferrer". */
  external?: boolean;
};

export type Crumb = { label: string; subtitle: string; labelKey?: TKey; subtitleKey?: TKey; /** Extra trail between "Beranda" and the label, e.g. ["Tiket"]. */ parents?: string[] };

// ---------------------------------------------------------------------------
// User dashboard
// ---------------------------------------------------------------------------

const main = "Menu utama";
const extra = "Tautan lainnya";
const account = "Pengaturan";

const userNavBase: NavItem[] = [
  { label: "Order Baru", labelKey: "nav.order_baru", href: "/dashboard", icon: ShoppingCart, group: main, exact: true },
  { label: "Layanan", labelKey: "nav.layanan", href: "/dashboard/services", icon: ClipboardList, group: main },
  { label: "Pesanan", labelKey: "nav.pesanan", href: "/dashboard/orders", icon: ClipboardCheck, group: main },
  { label: "Tambah Saldo", labelKey: "nav.tambah_saldo", href: "/dashboard/add-funds", icon: WalletCards, group: main },
  { label: "Mutasi Saldo", labelKey: "nav.mutasi_saldo", href: "/dashboard/ledger", icon: BookText, group: main },
  { label: "Tiket", labelKey: "nav.tiket", href: "/dashboard/tickets", icon: Headset, group: main, badgeKey: "tickets" },
  { label: "Pembaruan", labelKey: "nav.pembaruan", href: "/dashboard/updates", icon: Activity, group: main, badgeKey: "updates" },
  { label: "Refill", labelKey: "nav.refill", href: "/dashboard/refill", icon: RefreshCcw, group: main },
  { label: "Refund", labelKey: "nav.refund", href: "/dashboard/refunds", icon: ReceiptText, group: main },
  { label: "Order Massal", labelKey: "nav.order_massal", href: "/dashboard/mass-order", icon: List, group: main },


  { label: "Pengaturan", labelKey: "nav.pengaturan", href: "/dashboard/settings", icon: Settings, group: account },
  { label: "Keluar", labelKey: "nav.keluar", icon: LogOut, group: account, action: "logout" },
];

/** "Tautan lainnya" (as before commit fdc638f, minus the mobile app): each item only when its URL is set; no URL -> no group. */
const COMMUNITY_NAV: Record<CommunityKey, { labelKey: NavItem["labelKey"]; icon: NavIcon }> = {
  whatsappChannel: { labelKey: "nav.saluran_whatsapp", icon: FaWhatsapp },
  telegramChannel: { labelKey: "nav.saluran_telegram", icon: FaTelegram },
  telegramBot: { labelKey: "nav.bot_telegram", icon: Bot },
};

/** The user menu: main items, then the community group (when any link is set), then Pengaturan / Keluar (the order of the old design). */
export function buildUserNav(community: CommunityLinks = EMPTY_COMMUNITY): NavItem[] {
  const links: NavItem[] = activeCommunityLinks(community).map((l) => ({
    label: l.label, labelKey: COMMUNITY_NAV[l.key].labelKey, href: l.href, icon: COMMUNITY_NAV[l.key].icon, group: extra, external: true,
  }));
  const at = userNavBase.findIndex((i) => i.group === account);
  return [...userNavBase.slice(0, at), ...links, ...userNavBase.slice(at)];
}

/** Without community links. */
export const userNav: NavItem[] = buildUserNav();

export const userBreadcrumbs: Record<string, Crumb> = {
  "/dashboard": { label: "Order Baru", subtitle: "Buat pesananmu dari sini", labelKey: "crumb.order_baru", subtitleKey: "crumbsub.buat_pesananmu_dari_sini" },
  "/dashboard/services": { label: "Layanan", subtitle: "Lihat daftar layanan kami di sini", labelKey: "crumb.layanan", subtitleKey: "crumbsub.lihat_daftar_layanan_kami_di_sini" },
  "/dashboard/orders": { label: "Pesanan", subtitle: "Kelola dan pantau pesananmu di sini", labelKey: "crumb.pesanan", subtitleKey: "crumbsub.kelola_dan_pantau_pesananmu_di_sini" },
  "/dashboard/ledger": { label: "Mutasi Saldo", subtitle: "Riwayat semua perubahan saldomu", labelKey: "crumb.mutasi_saldo", subtitleKey: "crumbsub.riwayat_semua_perubahan_saldomu" },
  "/dashboard/add-funds": { label: "Tambah Saldo", subtitle: "Tambah saldo ke akunmu dengan mudah", labelKey: "crumb.tambah_saldo", subtitleKey: "crumbsub.tambah_saldo_ke_akunmu_dengan_mudah" },
  "/dashboard/tickets": { label: "Tiket", subtitle: "Lihat dan kelola tiket bantuanmu", labelKey: "crumb.tiket", subtitleKey: "crumbsub.lihat_dan_kelola_tiket_bantuanmu" },
  "/dashboard/tickets/[id]": { label: "Detail Tiket", subtitle: "Lihat detail tiketmu", labelKey: "crumb.detail_tiket", subtitleKey: "crumbsub.lihat_detail_tiketmu", parents: ["Tiket"] },
  "/dashboard/notifications": { label: "Notifikasi", subtitle: "Semua pemberitahuan untukmu", labelKey: "page.notifications", subtitleKey: "notif.page.subtitle" },
  "/dashboard/updates": { label: "Pembaruan", subtitle: "Lihat pembaruan terbaru layanan kami", labelKey: "crumb.pembaruan", subtitleKey: "crumbsub.lihat_pembaruan_terbaru_layanan_kami" },
  "/dashboard/refill": { label: "Refill", subtitle: "Ajukan refill untuk pesananmu di sini", labelKey: "crumb.refill", subtitleKey: "crumbsub.ajukan_refill_untuk_pesananmu_di_sini" },
  "/dashboard/refunds": { label: "Refund", subtitle: "Kelola dan pantau refund pesananmu", labelKey: "crumb.refund", subtitleKey: "crumbsub.kelola_dan_pantau_refund_pesananmu" },
  "/dashboard/mass-order": { label: "Order Massal", subtitle: "Buat banyak pesanan sekaligus", labelKey: "crumb.order_massal", subtitleKey: "crumbsub.buat_banyak_pesanan_sekaligus" },
  "/dashboard/affiliates": { label: "Afiliasi", subtitle: "Ajak pelanggan dan dapatkan komisi", labelKey: "crumb.afiliasi", subtitleKey: "crumbsub.ajak_pelanggan_dan_dapatkan_komisi" },
  "/dashboard/child-panel": { label: "Panel Anak", subtitle: "Kelola panel reseller kamu sendiri", labelKey: "crumb.panel_anak", subtitleKey: "crumbsub.kelola_panel_reseller_kamu_sendiri" },
  "/dashboard/api": { label: "API", subtitle: "Integrasikan JagoanSosmed ke sistemmu", labelKey: "crumb.api", subtitleKey: "crumbsub.integrasikan_jagoansosmed_ke_sistemmu" },
  "/dashboard/settings": { label: "Akun", subtitle: "Pengaturan akunmu", labelKey: "crumb.akun", subtitleKey: "crumbsub.pengaturan_akunmu" },
  "/dashboard/settings/2fa": { label: "Akun", subtitle: "Pengaturan akunmu", labelKey: "crumb.akun", subtitleKey: "crumbsub.pengaturan_akunmu" },
  "/dashboard/settings/experience": { label: "Akun", subtitle: "Pengaturan akunmu", labelKey: "crumb.akun", subtitleKey: "crumbsub.pengaturan_akunmu" },
  "/dashboard/settings/timezone-api": { label: "Akun", subtitle: "Pengaturan akunmu", labelKey: "crumb.akun", subtitleKey: "crumbsub.pengaturan_akunmu" },
  "/dashboard/settings/invoice": { label: "Akun", subtitle: "Pengaturan akunmu", labelKey: "crumb.akun", subtitleKey: "crumbsub.pengaturan_akunmu" },
  "/dashboard/settings/notifications": { label: "Akun", subtitle: "Pengaturan akunmu", labelKey: "crumb.akun", subtitleKey: "crumbsub.pengaturan_akunmu" },
};

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export const adminNav: NavItem[] = [
  { label: "Dasbor", labelKey: "nav.dasbor", href: "/admin", icon: LayoutDashboard, group: "Ringkasan", exact: true },
  { label: "Statistik", labelKey: "nav.statistik", href: "/admin/stats", icon: BarChart3, group: "Ringkasan" },

  { label: "Pengguna", labelKey: "nav.pengguna", href: "/admin/users", icon: Users, group: "Manajemen" },
  { label: "Pesanan", labelKey: "nav.pesanan", href: "/admin/orders", icon: ClipboardCheck, group: "Manajemen" },
  { label: "Layanan", labelKey: "nav.layanan", href: "/admin/services", icon: LayoutGrid, group: "Manajemen" },
  { label: "Provider", labelKey: "nav.provider", href: "/admin/providers", icon: Server, group: "Manajemen" },

  { label: "Deposit", labelKey: "nav.deposit", href: "/admin/deposits", icon: WalletCards, group: "Keuangan dan dukungan" },
  { label: "Refill", labelKey: "nav.refill", href: "/admin/refills", icon: RefreshCcw, group: "Keuangan dan dukungan" },
  { label: "Refund", labelKey: "nav.refund", href: "/admin/refunds", icon: ReceiptText, group: "Keuangan dan dukungan" },
  { label: "Buku Besar", labelKey: "nav.buku_besar", href: "/admin/ledger", icon: BookText, group: "Keuangan dan dukungan" },
  { label: "Tiket", labelKey: "nav.tiket", href: "/admin/tickets", icon: Headset, group: "Keuangan dan dukungan", badgeKey: "tickets" },

  { label: "Pengumuman", labelKey: "nav.pengumuman", href: "/admin/announcements", icon: Megaphone, group: "Konten" },
  { label: "Log Aktivitas", labelKey: "nav.log_aktivitas", href: "/admin/logs", icon: ScrollText, group: "Konten" },

  { label: "Pengaturan Situs", labelKey: "nav.pengaturan_situs", href: "/admin/settings", icon: Settings, group: "Sistem" },
  { label: "Keluar", labelKey: "nav.keluar", icon: LogOut, group: "Sistem", action: "logout" },
];

export const adminBreadcrumbs: Record<string, Crumb> = {
  "/admin": { label: "Dasbor", subtitle: "Ringkasan operasional JagoanSosmed", labelKey: "crumb.dasbor", subtitleKey: "crumbsub.ringkasan_operasional_jagoansosmed" },
  "/admin/stats": { label: "Statistik", subtitle: "Analisis keuangan, layanan, dan pengguna", labelKey: "crumb.statistik", subtitleKey: "crumbsub.analisis_keuangan_layanan_dan_pengguna" },
  "/admin/users": { label: "Pengguna", subtitle: "Kelola akun, saldo, dan status pengguna", labelKey: "crumb.pengguna", subtitleKey: "crumbsub.kelola_akun_saldo_dan_status_pengguna" },
  "/admin/orders": { label: "Pesanan", subtitle: "Pantau dan tangani pesanan pengguna", labelKey: "crumb.pesanan", subtitleKey: "crumbsub.pantau_dan_tangani_pesanan_pengguna" },
  "/admin/services": { label: "Layanan", subtitle: "Atur layanan, harga, dan markup", labelKey: "crumb.layanan", subtitleKey: "crumbsub.atur_layanan_harga_dan_markup" },
  "/admin/providers": { label: "Provider", subtitle: "Kelola koneksi ke provider layanan", labelKey: "crumb.provider", subtitleKey: "crumbsub.kelola_koneksi_ke_provider_layanan" },
  "/admin/deposits": { label: "Deposit", subtitle: "Konfirmasi dan pantau deposit pengguna", labelKey: "crumb.deposit", subtitleKey: "crumbsub.konfirmasi_dan_pantau_deposit_pengguna" },
  "/admin/refills": { label: "Refill", subtitle: "Tinjau permintaan refill", labelKey: "crumb.refill", subtitleKey: "crumbsub.tinjau_permintaan_refill" },
  "/admin/refunds": { label: "Refund", subtitle: "Tinjau dan proses refund", labelKey: "crumb.refund", subtitleKey: "crumbsub.tinjau_dan_proses_refund" },
  "/admin/ledger": { label: "Buku Besar", subtitle: "Semua mutasi saldo pengguna", labelKey: "crumb.buku_besar", subtitleKey: "crumbsub.semua_mutasi_saldo_pengguna" },
  "/admin/notifications": { label: "Notifikasi", subtitle: "Semua pemberitahuan operasional", labelKey: "page.notifications", subtitleKey: "notif.page.subtitleAdmin" },
  "/admin/tickets": { label: "Tiket", subtitle: "Balas dan kelola tiket bantuan", labelKey: "crumb.tiket", subtitleKey: "crumbsub.balas_dan_kelola_tiket_bantuan" },
  "/admin/announcements": { label: "Pengumuman", subtitle: "Atur pengumuman untuk pengguna", labelKey: "crumb.pengumuman", subtitleKey: "crumbsub.atur_pengumuman_untuk_pengguna" },
  "/admin/logs": { label: "Log Aktivitas", subtitle: "Jejak audit semua tindakan admin", labelKey: "crumb.log_aktivitas", subtitleKey: "crumbsub.jejak_audit_semua_tindakan_admin" },
  "/admin/settings": { label: "Pengaturan Situs", subtitle: "Konfigurasi situs dan keamanan admin", labelKey: "crumb.pengaturan_situs", subtitleKey: "crumbsub.konfigurasi_situs_dan_keamanan_admin" },
  "/admin/settings/payments": { label: "Pengaturan Situs", subtitle: "Konfigurasi situs dan keamanan admin", labelKey: "crumb.pengaturan_situs", subtitleKey: "crumbsub.konfigurasi_situs_dan_keamanan_admin" },
  "/admin/settings/ranks": { label: "Pengaturan Situs", subtitle: "Konfigurasi situs dan keamanan admin", labelKey: "crumb.pengaturan_situs", subtitleKey: "crumbsub.konfigurasi_situs_dan_keamanan_admin" },
  "/admin/settings/security": { label: "Pengaturan Situs", subtitle: "Konfigurasi situs dan keamanan admin", labelKey: "crumb.pengaturan_situs", subtitleKey: "crumbsub.konfigurasi_situs_dan_keamanan_admin" },
  "/admin/settings/order-rules": { label: "Pengaturan Situs", subtitle: "Konfigurasi situs dan keamanan admin", labelKey: "crumb.pengaturan_situs", subtitleKey: "crumbsub.konfigurasi_situs_dan_keamanan_admin" },
  "/admin/settings/operations": { label: "Pengaturan Situs", subtitle: "Konfigurasi situs dan keamanan admin", labelKey: "crumb.pengaturan_situs", subtitleKey: "crumbsub.konfigurasi_situs_dan_keamanan_admin" },
  "/admin/settings/notifications": { label: "Pengaturan Situs", subtitle: "Konfigurasi situs dan keamanan admin", labelKey: "crumb.pengaturan_situs", subtitleKey: "crumbsub.konfigurasi_situs_dan_keamanan_admin" },
};
