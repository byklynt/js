export const authCopy = {
  login: {
    heading: "Masuk ke JagoanSosmed",
    subtextPrefix: "Belum punya akun?",
    subtextLinkLabel: "Daftar",
    subtextHref: "/signup",
    submitLabel: "Masuk",
    submitLoadingLabel: "Memproses...",
    googleLabel: "Masuk dengan Google",
    forgotPasswordLabel: "Lupa password?",
    rememberMeLabel: "Ingat saya",
    successMessage: "Berhasil masuk! Mengalihkan ke dashboard...",
    genericError: "Username atau password salah. Silakan coba lagi.",
  },
  signup: {
    heading: "Daftar di JagoanSosmed",
    subtextPrefix: "Sudah punya akun?",
    subtextLinkLabel: "Masuk",
    subtextHref: "/login",
    submitLabel: "Daftar",
    submitLoadingLabel: "Memproses...",
    googleLabel: "Daftar dengan Google",
    successMessage: "Akun berhasil dibuat! Silakan cek email untuk verifikasi.",
    genericError: "Pendaftaran gagal. Silakan coba lagi.",
  },
  backLink: "Kembali",
} as const;

export const fieldLabels = {
  username: "Username",
  email: "Email",
  password: "Password",
  confirmPassword: "Konfirmasi password",
} as const;

export const fieldPlaceholders = {
  username: "nama_pengguna",
  email: "kamu@email.com",
  password: "Minimal 8 karakter",
  confirmPassword: "Ulangi password",
} as const;

export const validationMessages = {
  usernameRequired: "Username wajib diisi.",
  usernameMin: "Username minimal 3 karakter.",
  emailRequired: "Email wajib diisi.",
  emailInvalid: "Format email tidak valid.",
  passwordRequired: "Password wajib diisi.",
  passwordMin: "Password minimal 8 karakter.",
  confirmPasswordRequired: "Konfirmasi password wajib diisi.",
  confirmPasswordMismatch: "Konfirmasi password tidak cocok.",
} as const;

export const dashboardPreviewData = {
  breadcrumb: ["Beranda", "Order Baru"],
  breadcrumbSubtext: "Kelola dan buat pesananmu dari sini.",
  welcomeTitle: "Selamat datang di JagoanSosmed",
  welcomeSubtitle:
    "Hubungkan dan kelola banyak pesanan dengan mudah, bikin transaksimu makin lancar.",
  accountSwitcher: { initials: "SG", name: "JagoanSosmed" },
  sidebarActive: "Order Baru",
  sidebarItems: [
    "Pesanan Saya",
    "Layanan",
    "Tambah Saldo",
    "Referral",
    "Tiket",
    "Pembaruan",
    "Syarat",
    "API",
  ],
  sidebarSecondary: ["Pengaturan", "Status"],
  versionLabel: "v2.0",
  stats: [
    { label: "Saldo Akun", value: "Rp 150.000", actionLabel: "Tambah Saldo", tone: "sky" },
    { label: "Pesanan Saya", value: "10", actionLabel: "Lihat Pesanan", tone: "emerald" },
    { label: "Total Pengeluaran", value: "Rp 150.000", actionLabel: "Lihat Riwayat", tone: "rose" },
  ],
  orderCard: {
    title: "Buat pesanan",
    tabs: ["Order Baru", "Cari", "Order Massal"],
    categoryLabel: "Pilih Kategori",
    categoryPlaceholder: "Instagram",
    serviceLabel: "Pilih Layanan",
    servicePlaceholder: "Followers Indonesia | Instant | Garansi 30 Hari",
    linkLabel: "Link",
    linkPlaceholder: "Masukkan link postingan/profil",
    quantityLabel: "Jumlah",
    quantityPlaceholder: "Min. 100 - Maks. 10.000",
    subtotalLabel: "Subtotal",
    subtotalValue: "Rp 15.000",
    submitLabel: "Pesan Sekarang",
  },
  infoCard: {
    title: "Instagram - Followers Indonesia | Instant",
    productId: "Product ID: 2451",
    completionTimeLabel: "Waktu Selesai",
    completionTimeValue: "±2 jam 10 menit",
    trustedLabel: "Dipercaya Banyak Orang",
    trustedValue: "1.842 pesanan selesai",
    howToTitle: "Cara Memesan?",
    howToSteps: [
      "Masukkan link profil atau postingan kamu.",
      "Pilih jumlah antara 100 sampai 10.000.",
      "Selesaikan pembayaran dan tunggu prosesnya.",
    ],
  },
  floatingFollowerCard: {
    text: "Kamu dapat followers baru! 🎉",
    name: "Rani A.",
  },
  floatingStoreCard: {
    label: "Brand Pakaian Saya",
    metricLabel: "Penjualan Bersih",
    value: "Rp 5.000.000",
    growth: "+110%",
  },
} as const;
