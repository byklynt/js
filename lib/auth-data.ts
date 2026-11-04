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
  sidebarItems: ["Pesanan Saya", "Layanan", "Tambah Saldo", "Tiket", "Pembaruan"],
  sidebarSecondary: ["Pengaturan", "Status"],
  versionLabel: "v2.0",
  stats: [
    { label: "Saldo Akun", value: "Rp 0", actionLabel: "Tambah Saldo", tone: "sky" },
    { label: "Pesanan Saya", value: "0", actionLabel: "Lihat Pesanan", tone: "emerald" },
    { label: "Total Pengeluaran", value: "Rp 0", actionLabel: "Lihat Riwayat", tone: "rose" },
  ],
  orderCard: {
    title: "Buat pesanan",
    tabs: ["Order Baru", "Cari", "Order Massal"],
    categoryLabel: "Pilih Kategori",
    categoryPlaceholder: "Pilih kategori",
    serviceLabel: "Pilih Layanan",
    servicePlaceholder: "Pilih layanan",
    linkLabel: "Link",
    linkPlaceholder: "Masukkan link postingan/profil",
    quantityLabel: "Jumlah",
    quantityPlaceholder: "Masukkan jumlah",
    subtotalLabel: "Subtotal",
    subtotalValue: "Rp 0",
    submitLabel: "Pesan Sekarang",
  },
  infoCard: {
    title: "Detail layanan",
    productId: "Pilih layanan untuk melihat detail",
    completionTimeLabel: "Waktu Selesai",
    completionTimeValue: "Tergantung layanan",
    trustedLabel: "Status",
    trustedValue: "Terlihat setelah memesan",
    howToTitle: "Cara Memesan?",
    howToSteps: [
      "Masukkan link profil atau postingan kamu.",
      "Pilih jumlah sesuai batas layanan.",
      "Pesan dan pantau statusnya di halaman pesanan.",
    ],
  },
} as const;
