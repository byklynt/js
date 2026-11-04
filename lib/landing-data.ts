import { brand } from "@/lib/brand";
import type { LucideIcon } from "lucide-react";
import {
  Zap,
  ShieldCheck,
  Rocket,
  Headphones,
  CreditCard,
  CalendarClock,
  Code2,
  Check,
  X,
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
    `${brand.name} adalah SMM panel terpercaya dengan harga termurah, pengiriman cepat, dan layanan 24/7 untuk Instagram, TikTok, X, YouTube, Facebook, dan platform lainnya.`,
};

export const navLinks = [
  { label: "Layanan", href: "#layanan" },
  { label: "API", href: "#api" },
  { label: "Blog", href: "#blog" },
  { label: "Daftar", href: "/signup" },
];

export const heroBadges: { label: string; icon: LucideIcon }[] = [
  { label: "Kualitas Tinggi", icon: ShieldCheck },
  { label: "Harga Termurah", icon: CreditCard },
  { label: "Pengiriman Cepat", icon: Rocket },
  { label: "Support 24/7", icon: Headphones },
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

export const socialProof = {
  badge: "Kepuasan Pelanggan",
  title: "JagoanSosmed berarti satu kisah sukses demi kisah sukses lainnya!",
  subtitle:
    "Bergabunglah dengan ribuan pelanggan yang puas dan raih kesuksesan besar bersama media sosialmu.",
};

export const bentoFeatures = {
  badge: "Layanan Unggulan",
  title: "JagoanSosmed siap bantu bisnis SMM kamu berkembang pesat",
  cards: [
    {
      title: "Panel X (Twitter) yang Dinamis",
      description:
        "Kelola followers, likes, retweet, hingga views X dalam satu dashboard yang simpel dan cepat.",
    },
    {
      title: "Panel YouTube Original",
      description:
        "Tingkatkan subscriber, views, dan watch time channel YouTube kamu dengan layanan tercepat di kelasnya.",
      cta: "Lihat Layanan",
    },
  ],
};

export const servicesGalore = {
  badge: "Mulai Viral Hari Ini!",
  title: "Ribuan Layanan SMM Tersedia",
  description:
    "Layanan yang bisa kamu dapatkan tidak terbatas pada tiga platform besar saja. Kamu juga bisa meningkatkan engagement media sosial klienmu lewat LinkedIn, Reddit, Pinterest, Spotify, layanan SEO, dan masih banyak lagi.",
  cta: "Daftar Sekarang",
};

export const dashboardMock = {
  greeting: "Selamat datang di JagoanSosmed",
  balance: { label: "Saldo Akun", value: "Rp 10.590.000" },
  totalOrders: { label: "Total Pesanan", value: "10" },
  spent: { label: "Total Pengeluaran", value: "Rp 10.590.000" },
  pending: { label: "Pesanan Diproses", value: "235" },
  form: {
    category: "Instagram - Followers",
    service: "Followers Indonesia | Instant | Garansi 30 Hari",
    link: "https://instagram.com/akunkamu",
    quantity: "1000",
  },
};

export const featureColumns: { title: string; description: string; icon: LucideIcon }[] = [
  {
    title: "Pembayaran Otomatis",
    description:
      "Lupakan proses manual yang ribet. Top up saldo otomatis lewat e-wallet, transfer bank, hingga QRIS dalam hitungan detik.",
    icon: CreditCard,
  },
  {
    title: "Layanan SMM Bulanan",
    description:
      "Atur layanan agar berjalan otomatis tiap bulan, cocok untuk kamu yang ingin followers dan engagement selalu stabil.",
    icon: CalendarClock,
  },
  {
    title: "API Siap Pakai",
    description:
      "Integrasikan JagoanSosmed ke platform kamu sendiri lewat API yang lengkap, stabil, dan terdokumentasi dengan baik.",
    icon: Code2,
  },
];

export const massOrder = {
  title: "Setup Mass Order",
  description:
    "Khusus buat kamu yang menjalankan bisnis SMM, JagoanSosmed menyediakan fitur mass order agar kamu bisa memproses puluhan pesanan sekaligus tanpa perlu input satu per satu. Hemat waktu, kerja lebih efisien.",
};

export const testimonials = [
  {
    name: "Dimas Prakoso",
    handle: "@dimasp",
    rating: 5,
    text: "Harganya jauh lebih murah dibanding panel lain yang pernah aku coba. Prosesnya juga cepat banget, followers langsung masuk.",
  },
  {
    name: "Siti Rahma",
    handle: "@sitirahma",
    rating: 5,
    text: "Admin fast respon dan ramah. Pernah ada kendala pesanan, langsung dibantu sampai tuntas. Recommended banget!",
  },
  {
    name: "Bagas Wirawan",
    handle: "@bagaswr",
    rating: 5,
    text: "Dashboard-nya simpel, enak dipakai sehari-hari buat kelola banyak akun klien sekaligus.",
  },
  {
    name: "Putri Ayunda",
    handle: "@putriayu",
    rating: 5,
    text: "Udah langganan 6 bulan buat layanan bulanan Instagram, hasilnya konsisten dan stabil terus.",
  },
  {
    name: "Reza Maulana",
    handle: "@rezam",
    rating: 4,
    text: "Fitur API-nya membantu banget buat integrasi ke sistem reseller aku. Dokumentasinya jelas.",
  },
  {
    name: "Novita Sari",
    handle: "@novitasr",
    rating: 5,
    text: "Garansi layanan beneran jalan. Pas drop followers, langsung di-refill tanpa ribet.",
  },
  {
    name: "Andika Pratama",
    handle: "@andikap",
    rating: 5,
    text: "Pilihan layanannya lengkap banget, dari Instagram sampai Spotify semua ada di satu panel.",
  },
  {
    name: "Laras Wulandari",
    handle: "@laraswln",
    rating: 5,
    text: "Mass order-nya ngebantu banget buat yang jualan jasa follow ke banyak klien tiap hari.",
  },
];

export const ratingSummary = {
  score: "4.9/5.0",
  label: "Rating dari 500+ Ulasan Pelanggan",
};

export const comparison = {
  title: "JagoanSosmed memberikanmu SMM Panel terbaik agar kamu bisa unggul dari kompetitor!",
  columns: ["Panel Kompetitor", "JagoanSosmed"],
  rows: [
    { label: "Harga layanan termurah", competitor: false, jagoansosmed: true },
    { label: "Pengiriman order instan", competitor: false, jagoansosmed: true },
    { label: "Support 24/7 responsif", competitor: false, jagoansosmed: true },
    { label: "Garansi refill otomatis", competitor: true, jagoansosmed: true },
    { label: "API terdokumentasi lengkap", competitor: false, jagoansosmed: true },
    { label: "Program reseller menguntungkan", competitor: false, jagoansosmed: true },
  ],
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
      "Aman. Kami tidak pernah meminta kata sandi akun media sosialmu dan seluruh transaksi diproses melalui sistem pembayaran yang terenkripsi.",
  },
] as const;

export const faqRight = [
  {
    question: "Apakah JagoanSosmed menyediakan dukungan pelanggan?",
    answer:
      "Tentu. Tim support kami siap membantu 24/7 lewat live chat maupun tiket bantuan untuk menjawab semua pertanyaanmu.",
  },
  {
    question: "Bagaimana cara mulai melakukan pemesanan?",
    answer:
      "Cukup daftar akun, top up saldo, pilih kategori dan layanan yang diinginkan, masukkan link serta jumlah, lalu klik Pesan Sekarang.",
  },
  {
    question: "Kenapa harus memilih JagoanSosmed?",
    answer:
      "Karena kami menawarkan kombinasi harga termurah, kualitas tinggi, kecepatan pengiriman, dan layanan pelanggan terbaik dalam satu panel.",
  },
] as const;

export const resellerCta = {
  title: "Mau jadi reseller?",
  description:
    "Jual kembali layanan JagoanSosmed dengan brand kamu sendiri dan dapatkan margin keuntungan maksimal setiap bulannya.",
  cta: "Lihat Program Reseller",
};

export const closingCta = {
  title: "Mulai bersama JagoanSosmed dan lesatkan bisnismu",
  description:
    "Daftar sekarang dan rasakan kemudahan mengelola seluruh kebutuhan SMM dalam satu panel yang cepat, murah, dan terpercaya.",
  cta: "Sign up",
  stat: { label: "Total Penjualan", value: "Rp 500.000", growth: "+15%" },
};

export const footerLinks = {
  layanan: [
    { label: "Instagram", href: "#" },
    { label: "TikTok", href: "#" },
    { label: "YouTube", href: "#" },
    { label: "X (Twitter)", href: "#" },
  ],
  perusahaan: [
    { label: "Tentang Kami", href: "#" },
    { label: "Blog", href: "#" },
    { label: "Program Reseller", href: "#" },
    { label: "API Docs", href: "#" },
  ],
  bantuan: [
    { label: "FAQ", href: "#" },
    { label: "Hubungi Kami", href: "#" },
    { label: "Syarat & Ketentuan", href: "/terms" },
    { label: "Kebijakan Refund", href: "/refund-policy" },
    { label: "Status Layanan", href: "/status" },
  ],
};

export const brandIcons = { Zap, Check, X };
