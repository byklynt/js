import { LEGAL_PATHS } from "@/lib/legal-content";
import { brand } from "@/lib/brand";
import type { LucideIcon } from "lucide-react";
import {
  CreditCard,
  CalendarClock,
  Code2,
  } from "lucide-react";
import {
  SiInstagram,
  SiTiktok,
  SiX,
  SiYoutube,
  SiFacebook,
  SiTelegram,
  SiSpotify,
  SiThreads,
} from "react-icons/si";
import type { IconType } from "react-icons";

export const siteConfig = {
  name: brand.name,
  tagline: brand.tagline,
  description:
    `${brand.name} adalah SMM panel untuk memesan layanan media sosial (Instagram, TikTok, X, YouTube, Facebook, dan lainnya) dengan saldo yang tercatat jelas dan aturan refund yang transparan.`,
};

export const navLinks = [
  { label: "Layanan", href: "/services" },
  { label: "Blog", href: "/blog" },
];

export const platformMarquee: { label: string; icon: IconType }[] = [
  { label: "Instagram", icon: SiInstagram },
  { label: "TikTok", icon: SiTiktok },
  { label: "X (Twitter)", icon: SiX },
  { label: "YouTube", icon: SiYoutube },
  { label: "Facebook", icon: SiFacebook },
  { label: "Telegram", icon: SiTelegram },
  { label: "Spotify", icon: SiSpotify },
  { label: "Threads", icon: SiThreads },
];

export const floatingSocialIcons: { icon: IconType; side: "left" | "right"; position: string; delay: string }[] = [
  { icon: SiTiktok, side: "left", position: "top-24 left-4 md:left-10", delay: "0s" },
  { icon: SiInstagram, side: "right", position: "top-16 right-4 md:right-10", delay: "0.4s" },
  { icon: SiX, side: "left", position: "top-56 left-0 md:left-2", delay: "0.8s" },
  { icon: SiYoutube, side: "right", position: "top-64 right-0 md:right-2", delay: "1.1s" },
];

export const bentoFeatures = {
  badge: "Layanan Unggulan",
  title: "JagoanSosmed siap bantu bisnis SMM kamu berkembang pesat",
  cards: [
    {
      title: "Layanan untuk X (Twitter)",
      description:
        "Pesan followers, likes, retweet, atau views X dari satu dashboard. Layanan yang tersedia mengikuti katalog provider.",
    },
    {
      title: "Layanan untuk YouTube",
      description:
        "Pesan subscriber, views, atau layanan YouTube lainnya. Lihat detail, batas pesanan, dan harga sebelum memesan.",
      cta: "Lihat Layanan",
    },
  ],
};

export const servicesGalore = {
  badge: "Mulai Viral Hari Ini!",
  title: "Pilihan Layanan SMM",
  description:
    "Layanan yang bisa kamu dapatkan tidak terbatas pada tiga platform besar saja. Kamu juga bisa meningkatkan engagement media sosial klienmu lewat LinkedIn, Reddit, Pinterest, Spotify, layanan SEO, dan masih banyak lagi.",
  cta: "Daftar Sekarang",
};

export const dashboardMock = {
  greeting: "Selamat datang di JagoanSosmed",
  balance: { label: "Saldo Akun", value: "Rp 0" },
  totalOrders: { label: "Total Pesanan", value: "0" },
  spent: { label: "Total Pengeluaran", value: "Rp 0" },
  pending: { label: "Pesanan Diproses", value: "0" },
  form: {
    category: "Pilih kategori",
    service: "Pilih layanan",
    link: "https://instagram.com/akunkamu",
    quantity: "1000",
  },
};

export const featureColumns: { title: string; description: string; icon: LucideIcon }[] = [
  {
    title: "Saldo dan Mutasi Transparan",
    description: "Setiap perubahan saldo tercatat: deposit, pesanan, dan refund. Kamu bisa melihat riwayatnya kapan saja.",
    icon: CreditCard,
  },
  {
    title: "Refund Sesuai Aturan",
    description: "Pesanan yang dibatalkan atau tidak selesai direfund otomatis sesuai kebijakan yang tertulis jelas.",
    icon: CalendarClock,
  },
  {
    title: "Pantau Pesanan",
    description: "Lihat status, jumlah awal, dan sisa pesananmu di satu halaman, lengkap dengan notifikasi.",
    icon: Code2,
  },
];

export const massOrder = {
  title: "Setup Mass Order",
  description:
    "Khusus buat kamu yang menjalankan bisnis SMM, JagoanSosmed menyediakan fitur mass order agar kamu bisa memproses puluhan pesanan sekaligus tanpa perlu input satu per satu. Hemat waktu, kerja lebih efisien.",
};

export const faqLeft = [
  {
    question: "Apa itu SMM Panel?",
    answer:
      "SMM Panel adalah platform yang menyediakan layanan media sosial seperti followers, likes, views, dan komentar secara instan dengan harga terjangkau untuk berbagai platform.",
  },
  {
    question: "Layanan SMM apa saja yang bisa saya beli?",
    answer:
      "Kamu bisa membeli layanan untuk Instagram, TikTok, X, YouTube, Facebook, Telegram, Spotify, Threads, dan masih banyak platform lainnya langsung dari dashboard JagoanSosmed.",
  },
  {
    question: "Apakah aman menggunakan JagoanSosmed?",
    answer:
      "Kami tidak pernah meminta kata sandi akun media sosialmu. Yang kami butuhkan hanya link profil atau postingan yang ingin ditingkatkan.",
  },
] as const;

export const faqRight = [
  {
    question: "Apakah JagoanSosmed menyediakan dukungan pelanggan?",
    answer:
      "Ya. Kamu bisa membuat tiket bantuan dari dashboard, dan tim kami akan membalasnya di halaman tiket.",
  },
  {
    question: "Bagaimana cara mulai melakukan pemesanan?",
    answer:
      "Daftar akun, ajukan deposit saldo, pilih kategori dan layanan, masukkan link serta jumlah, lalu klik Pesan Sekarang.",
  },
  {
    question: "Kenapa harus memilih JagoanSosmed?",
    answer:
      "Karena saldo, pesanan, dan refund tercatat jelas, dan aturan layanan ditulis terbuka sebelum kamu memesan.",
  },
] as const;

export const closingCta = {
  title: "Mulai bersama JagoanSosmed dan lesatkan bisnismu",
  description:
    "Daftar sekarang dan kelola pesanan SMM-mu dalam satu panel.",
  cta: "Daftar",
};

export const footerLinks = {
  bantuan: [
    { label: "Layanan", href: "/services" },
    { label: "Blog", href: "/blog" },
    { label: "Syarat & Ketentuan", href: LEGAL_PATHS.terms },
    { label: "Kebijakan Refund", href: LEGAL_PATHS.refund },
    { label: "Kebijakan Privasi", href: LEGAL_PATHS.privacy },
  ],
};

