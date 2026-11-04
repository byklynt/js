/**
 * LANDING PAGE MARKETING CONTENT (single editable file).
 *
 * Everything in the social proof / marketing sections of the landing page is read from here and nowhere else.
 * The items below are SAMPLE content restored from the original design. Before launch, replace them with real
 * ones: edit the entries in place, or empty an array ([]) to hide that section. A section renders only when its
 * array is non-empty. To hide all social proof at once, set `showSocialProof` to false in lib/site-config.ts.
 */
import type { LucideIcon } from "lucide-react";
import { Rocket, ShieldCheck, Headphones, Tag } from "lucide-react";

export type Testimonial = {
  name: string;
  /** Optional line under the name (handle, job, store). */
  role?: string;
  /** 1-5 */
  rating: number;
  text: string;
  /** Letter(s) shown in the avatar circle. */
  avatarInitial: string;
};

export type Stat = { label: string; value: string; /** optional change chip, e.g. "+15%" */ change?: string };

export type ComparisonRow = { label: string; competitor: boolean; us: boolean };

export const hero = {
  badge: "Main Provider — #1 SMM Panel",
  highlight: "SMM Panel",
  headline: "Termurah se-Indonesia",
  description:
    "Tingkatkan followers, views, dan engagement media sosialmu dengan harga paling hemat, proses instan, dan kualitas terjamin.",
};

/** Claims / badges under the hero button. */
export const claims: { label: string; icon: LucideIcon }[] = [
  { label: "Kualitas Tinggi", icon: ShieldCheck },
  { label: "Harga Termurah", icon: Tag },
  { label: "Pengiriman Cepat", icon: Rocket },
  { label: "Support 24/7", icon: Headphones },
];

export const socialProof = {
  badge: "Kepuasan Pelanggan",
  title: "JagoanSosmed berarti satu kisah sukses demi kisah sukses lainnya!",
  subtitle: "Bergabunglah dengan ribuan pelanggan yang puas dan raih kesuksesan besar bersama media sosialmu.",
};

export const testimonialsSection = {
  badge: "Testimoni",
  title: "Apa kata pelanggan kami?",
  subtitle: "Kami menghargai pelanggan dan layanan kami. Lihat apa yang mereka katakan.",
  regionLabel: "Testimoni pelanggan",
};

export const testimonials: Testimonial[] = [
  { name: "Dimas Prakoso", role: "@dimasp", rating: 5, avatarInitial: "D", text: "Harganya jauh lebih murah dibanding panel lain yang pernah aku coba. Prosesnya juga cepat banget, followers langsung masuk." },
  { name: "Siti Rahma", role: "@sitirahma", rating: 5, avatarInitial: "S", text: "Admin fast respon dan ramah. Pernah ada kendala pesanan, langsung dibantu sampai tuntas. Recommended banget!" },
  { name: "Bagas Wirawan", role: "@bagaswr", rating: 5, avatarInitial: "B", text: "Dashboard-nya simpel, enak dipakai sehari-hari buat kelola banyak akun klien sekaligus." },
  { name: "Putri Ayunda", role: "@putriayu", rating: 5, avatarInitial: "P", text: "Udah langganan 6 bulan buat layanan bulanan Instagram, hasilnya konsisten dan stabil terus." },
  { name: "Reza Maulana", role: "@rezam", rating: 4, avatarInitial: "R", text: "Fitur API-nya membantu banget buat integrasi ke sistem reseller aku. Dokumentasinya jelas." },
  { name: "Novita Sari", role: "@novitasr", rating: 5, avatarInitial: "N", text: "Garansi layanan beneran jalan. Pas drop followers, langsung di-refill tanpa ribet." },
  { name: "Andika Pratama", role: "@andikap", rating: 5, avatarInitial: "A", text: "Pilihan layanannya lengkap banget, dari Instagram sampai Spotify semua ada di satu panel." },
  { name: "Laras Wulandari", role: "@laraswln", rating: 5, avatarInitial: "L", text: "Mass order-nya ngebantu banget buat yang jualan jasa follow ke banyak klien tiap hari." },
];

/** Shown as the rating badge. Set to null to hide the badge. */
export const rating: { score: string; count: string } | null = { score: "4.9/5.0", count: "500+" };

/** Sales / statistics numbers. Shown on the closing card. */
export const stats: Stat[] = [{ label: "Total Penjualan", value: "Rp 500.000", change: "+15%" }];

export const comparison = {
  title: "JagoanSosmed memberikanmu SMM Panel terbaik agar kamu bisa unggul dari kompetitor!",
  columns: { feature: "Fitur", competitor: "Panel Kompetitor", us: "JagoanSosmed" },
  rows: [
    { label: "Harga layanan termurah", competitor: false, us: true },
    { label: "Pengiriman order instan", competitor: false, us: true },
    { label: "Support 24/7 responsif", competitor: false, us: true },
    { label: "Garansi refill otomatis", competitor: true, us: true },
    { label: "API terdokumentasi lengkap", competitor: false, us: true },
    { label: "Program reseller menguntungkan", competitor: false, us: true },
  ] as ComparisonRow[],
};
