/**
 * Legal texts as structured data (edit the text here, not in JSX). Client-safe, no I/O.
 *
 * - LEGAL_VERSION is the ONE constant for "Terakhir diperbarui" and for the version stored on a profile at signup
 *   (profiles.terms_version). Bump it whenever any text below changes in substance.
 * - The numbers (72 jam, 50%, 24 jam) come from the same constants the system uses, so the text cannot drift from the code.
 *   The only exception is the cancel policy, which an admin can edit at runtime in /admin/settings: if it is changed there,
 *   update DEFAULT_CANCEL_POLICY (and this file's version) as well. See docs/legal-review.md.
 * - Inline markup in text: [label](/path) makes a link, **text** makes bold.
 */
import { DEFAULT_CANCEL_POLICY } from "@/lib/order-rules";

export const LEGAL_VERSION = "2026-11-06";

/** Days after an order ends (or after a refund/refill decision) within which a complaint can be filed. ASSUMPTION: confirm before launch. */
export const COMPLAINT_WINDOW_DAYS = 7;
/** Minimum age to use the service. */
export const MIN_USER_AGE = 17;
/** A refill can be requested once per this many hours for each order (same rule as the system: REFILL_COOLDOWN_MS). */
export const REFILL_COOLDOWN_HOURS = 24;

export type LegalBlock =
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  /** A worked calculation. `lines` are shown one per line. */
  | { type: "example"; title: string; lines: string[] }
  /** Text that is NOT final yet. Rendered as a visible "belum final" box and listed in docs/legal-review.md. */
  | { type: "placeholder"; text: string };

export type LegalSection = { id: string; heading: string; blocks: LegalBlock[] };
export type LegalDoc = { slug: string; title: string; description: string; intro?: string; sections: LegalSection[] };

const MIN_AGE = DEFAULT_CANCEL_POLICY.minAgeHours;
const PERCENT = DEFAULT_CANCEL_POLICY.refundPercent;

/** "2026-11-06" -> "6 November 2026". Pure string work, no time zone involved. */
export function formatLegalDate(version: string = LEGAL_VERSION): string {
  const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(version);
  if (!m) return version;
  return `${Number(m[3])} ${months[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

/* ---------------------------------------------------------------------------------------------------------------- */
export const TERMS: LegalDoc = {
  slug: "syarat-ketentuan",
  title: "Syarat & Ketentuan",
  description: "Syarat & Ketentuan penggunaan JagoanSosmed: layanan, akun, saldo, kewajiban sebelum order, larangan, dan batasan tanggung jawab.",
  intro: "Dengan membuat akun atau memakai JagoanSosmed, kamu menyetujui syarat di halaman ini, Kebijakan Refund & Pembatalan, dan Kebijakan Privasi. Baca sebelum memesan.",
  sections: [
    {
      id: "layanan",
      heading: "Tentang layanan",
      blocks: [
        { type: "p", text: "JagoanSosmed adalah reseller dan penyedia layanan pertumbuhan media sosial. Kamu memilih layanan, memasukkan link target dan jumlah, lalu pesanan diteruskan ke penyedia layanan (supplier) kami untuk dikerjakan." },
        { type: "p", text: "JagoanSosmed tidak berafiliasi, tidak disponsori, dan tidak didukung oleh platform seperti Instagram, TikTok, YouTube, Facebook, Twitter/X, Telegram, atau Spotify. Semua nama platform adalah milik pemiliknya masing-masing dan hanya disebut untuk menjelaskan layanan." },
        { type: "p", text: "Platform pihak ketiga bisa mengubah aturan, algoritma, atau tampilan kapan saja. Hasil di platform tersebut berada di luar kendali kami." },
      ],
    },
    {
      id: "akun",
      heading: "Akun pengguna",
      blocks: [
        { type: "ul", items: [
          `Kamu harus berusia minimal ${MIN_USER_AGE} tahun untuk membuat akun dan memesan.`,
          "Data yang kamu berikan (username, email) harus benar dan milikmu. Kamu bertanggung jawab menjaga data itu tetap akurat.",
          "Kamu bertanggung jawab atas keamanan akun dan passwordmu. Semua aktivitas dari akunmu dianggap dilakukan olehmu. Segera hubungi kami bila akunmu dipakai orang lain.",
          "Satu orang satu akun. Jangan memakai atau menjual akunmu kepada orang lain.",
        ] },
      ],
    },
    {
      id: "saldo-order",
      heading: "Saldo dan cara order",
      blocks: [
        { type: "p", text: "Pesanan dibayar dari saldo JagoanSosmed. Biaya pesanan dipotong dari saldo saat pesanan dibuat, sesuai harga yang tampil di form order saat itu. Setiap perubahan saldo (isi saldo, pesanan, refund, penyesuaian) tercatat di halaman Mutasi Saldo." },
        { type: "p", text: "Saldo hanya bisa dipakai untuk pesanan di JagoanSosmed. Saldo tidak bisa ditarik tunai, kecuali sebagaimana diatur dalam [Kebijakan Refund & Pembatalan](/kebijakan-refund)." },
        { type: "p", text: "Pesanan tidak bisa diubah setelah dibuat. Sebelum setiap pesanan, kamu diminta menyetujui ketentuan order untuk platform yang bersangkutan; versi yang berlaku saat itu dicatat bersama pesananmu." },
      ],
    },
    {
      id: "kewajiban-order",
      heading: "Kewajibanmu sebelum dan selama order",
      blocks: [
        { type: "p", text: "Pesanan hanya bisa dikerjakan bila target memenuhi syarat berikut. Ketentuan lengkap per platform tampil di kartu ketentuan pada halaman order." },
        { type: "ul", items: [
          "Akun atau postingan target tidak private (publik) selama pesanan berjalan.",
          "Bila platform punya fitur untuk meninjau tag, sebutan, komentar, atau pengikut secara manual, matikan fitur tersebut.",
          "Link yang kamu masukkan benar dan lengkap. Link yang salah tidak bisa dibatalkan maupun direfund.",
          "Jangan mengganti username atau link, dan jangan menghapus konten target, selama pesanan masih berjalan.",
          "Jangan membuat pesanan kedua untuk link yang sama sebelum pesanan pertama selesai. Sistem menolak pesanan ganda untuk link yang sama (huruf besar/kecil, garis miring di akhir, dan bagian setelah # dianggap sama).",
        ] },
      ],
    },
    {
      id: "estimasi-waktu",
      heading: "Estimasi waktu pengerjaan",
      blocks: [
        { type: "p", text: "Waktu mulai dan waktu selesai yang tertera hanyalah perkiraan, bukan janji. Kecepatan bergantung pada penyedia layanan, jumlah pesanan, dan kondisi platform. Keterlambatan bukan alasan refund selama pesanan masih diproses." },
      ],
    },
    {
      id: "penurunan",
      heading: "Penurunan (drop) dan garansi",
      blocks: [
        { type: "p", text: "Jumlah pengikut, like, atau views dapat turun setelah pesanan selesai. Penurunan tidak dijamin akan dipulihkan, kecuali pada layanan yang berlabel refill atau garansi." },
        { type: "p", text: `Pada layanan bergaransi, kamu bisa mengajukan refill selama masa garansi yang tertera pada layanan itu, satu kali per ${REFILL_COOLDOWN_HOURS} jam untuk tiap pesanan. Refill memulihkan jumlah yang turun; refill bukan pengembalian saldo.` },
      ],
    },
    {
      id: "larangan",
      heading: "Larangan",
      blocks: [
        { type: "p", text: "Kamu dilarang:" },
        { type: "ul", items: [
          "melakukan penipuan, termasuk chargeback atau klaim palsu atas pembayaran dan refund;",
          "memesan untuk konten yang melanggar hukum, termasuk konten kekerasan, eksploitasi, perjudian ilegal, atau yang melanggar hak pihak lain;",
          "menyalahgunakan bug, celah, atau kesalahan sistem, termasuk untuk mendapatkan saldo atau layanan yang bukan hakmu;",
          "membuat banyak akun untuk mengambil promo, bonus, atau keuntungan lain berkali-kali;",
          "meminta batal atau refund secara berulang dan tidak wajar;",
          "mengganggu atau mencoba mengakses sistem, data pengguna lain, atau panel admin tanpa izin.",
        ] },
      ],
    },
    {
      id: "penangguhan",
      heading: "Penangguhan dan pembatalan oleh kami",
      blocks: [
        { type: "p", text: "Kami berhak menahan atau meninjau pesanan secara manual, menangguhkan atau memblokir akun, dan membatalkan pesanan yang melanggar syarat ini atau hukum yang berlaku. Akun yang ditinjau dapat mengalami penundaan pada pesanan dan refund sampai admin selesai memeriksa." },
      ],
    },
    {
      id: "tanggung-jawab",
      heading: "Batasan tanggung jawab",
      blocks: [
        { type: "ul", items: [
          "Layanan diberikan apa adanya. Kami tidak menjamin hasil tertentu di platform pihak ketiga, termasuk peningkatan penjualan, jangkauan, atau peringkat.",
          "Kami tidak bertanggung jawab atas pembatasan, penangguhan, atau penghapusan akun atau konten di platform pihak ketiga, atau atas keputusan platform tersebut.",
          "Tanggung jawab kami atas satu pesanan dibatasi sebesar biaya pesanan tersebut, sebagaimana diatur dalam Kebijakan Refund & Pembatalan.",
          "Kami tidak bertanggung jawab atas kerugian tidak langsung, kehilangan keuntungan, atau gangguan di luar kendali wajar kami (gangguan jaringan, penyedia layanan, atau platform).",
        ] },
      ],
    },
    {
      id: "perubahan-layanan",
      heading: "Perubahan layanan dan harga",
      blocks: [
        { type: "p", text: "Layanan, harga, dan ketersediaan dapat berubah sewaktu-waktu, misalnya mengikuti harga penyedia layanan. Harga yang berlaku untuk pesananmu adalah harga yang tampil saat pesanan dibuat. Layanan dapat dinonaktifkan tanpa pemberitahuan terlebih dahulu." },
      ],
    },
    {
      id: "perubahan-syarat",
      heading: "Perubahan syarat",
      blocks: [
        { type: "p", text: `Kami dapat memperbarui syarat ini. Versi dan tanggal terakhir diperbarui tertera di bagian atas halaman (versi ${LEGAL_VERSION}). Dengan terus memakai layanan setelah perubahan berlaku, kamu dianggap menyetujui versi terbaru. Perubahan penting kami umumkan melalui dasbor.` },
      ],
    },
    {
      id: "hukum",
      heading: "Hukum yang berlaku",
      blocks: [
        { type: "p", text: "Syarat ini diatur oleh hukum Republik Indonesia. Perselisihan diupayakan diselesaikan secara musyawarah lebih dahulu melalui tiket atau kontak kami. Bila tidak tercapai kesepakatan, perselisihan diselesaikan melalui pengadilan yang berwenang di Indonesia." },
      ],
    },
  ],
};

/* ---------------------------------------------------------------------------------------------------------------- */
export const REFUND: LegalDoc = {
  slug: "kebijakan-refund",
  title: "Kebijakan Refund & Pembatalan",
  description: `Kebijakan Refund & Pembatalan JagoanSosmed: refund penuh, refund sebagian dengan rumus dan contoh, pembatalan oleh pengguna setelah ${MIN_AGE} jam, dan cara mengajukan komplain.`,
  intro: "Aturan di halaman ini sama dengan yang dijalankan sistem. Semua refund kembali ke saldo JagoanSosmed dan tidak pernah melebihi biaya pesanan.",
  sections: [
    {
      id: "refund-penuh",
      heading: "Refund penuh: dibatalkan penyedia atau gagal",
      blocks: [
        { type: "p", text: "Bila penyedia layanan membatalkan pesananmu, atau pesanan gagal (gagal dikirim ke penyedia atau dinyatakan gagal oleh penyedia), seluruh biaya pesanan (100%) dikembalikan otomatis oleh sistem, tanpa syarat usia pesanan dan tanpa perlu mengajukan apa pun." },
        { type: "p", text: "Bila pengiriman ke penyedia tidak jelas hasilnya (misalnya koneksi terputus), admin memeriksanya lebih dulu agar pesanan tidak terkirim dua kali. Bila ternyata pesanan tidak masuk ke penyedia, seluruh biaya dikembalikan." },
      ],
    },
    {
      id: "refund-sebagian",
      heading: "Refund sebagian (partial)",
      blocks: [
        { type: "p", text: "Bila penyedia menyelesaikan pesanan hanya sebagian (status Partial), kamu menerima kembali bagian yang belum terkirim, secara otomatis." },
        { type: "p", text: "**Rumus:** refund = floor(biaya pesanan x sisa / jumlah pesanan). Hasilnya dibulatkan ke bawah ke rupiah penuh, tidak pernah dibulatkan ke atas." },
        { type: "example", title: "Contoh 1", lines: ["Biaya pesanan Rp1.500, jumlah 1.000, sisa belum terkirim 250.", "Refund = floor(1.500 x 250 / 1.000) = floor(375) = Rp375."] },
        { type: "example", title: "Contoh 2 (pembulatan ke bawah)", lines: ["Biaya pesanan Rp1.000, jumlah 3, sisa belum terkirim 1.", "Refund = floor(1.000 x 1 / 3) = floor(333,33) = Rp333."] },
        { type: "p", text: "Bila sisa nol, tidak ada yang direfund. Bila refund manual sudah pernah diberikan untuk pesanan yang sama, yang dibayarkan hanya selisihnya, sehingga totalnya tidak pernah melebihi biaya pesanan." },
      ],
    },
    {
      id: "pembatalan-pengguna",
      heading: "Pembatalan yang kamu ajukan sendiri",
      blocks: [
        { type: "ul", items: [
          `Pembatalan baru bisa diajukan setelah pesanan berumur ${MIN_AGE} jam. Sebelum itu, permintaan ditolak oleh sistem.`,
          "Hanya untuk pesanan yang masih berjalan dan pada layanan yang mendukung pembatalan. Satu permintaan pada satu waktu untuk tiap pesanan.",
          `Bila disetujui, kamu menerima ${PERCENT}% dari bagian yang belum terkirim: floor(biaya pesanan x sisa x ${PERCENT}% / jumlah pesanan).`,
          "Permintaan masuk ke antrean admin. Admin menyetujui atau menolak (disertai alasan). Perhitungan memakai sisa pesanan pada saat disetujui, dan hasilnya tidak pernah melebihi biaya pesanan.",
          "Setelah disetujui, pesanan ditutup sebagai dibatalkan. Bagian yang sudah terkirim tidak direfund.",
        ] },
        { type: "example", title: "Contoh", lines: [`Biaya pesanan Rp1.500, jumlah 1.000, sisa belum terkirim 600, pesanan berumur lebih dari ${MIN_AGE} jam.`, `Refund = floor(1.500 x 600 x ${PERCENT}% / 1.000) = floor(450) = Rp450.`] },
        { type: "p", text: `Aturan ${PERCENT}% hanya untuk pembatalan yang kamu ajukan. Pembatalan oleh penyedia dan pesanan gagal tetap dikembalikan penuh secara otomatis.` },
      ],
    },
    {
      id: "tanpa-refund",
      heading: "Kondisi yang tidak mendapat refund",
      blocks: [
        { type: "p", text: "Tidak ada refund (atau pembatalan) bila pesanan tidak bisa dikerjakan atau tidak sesuai karena:" },
        { type: "ul", items: [
          "akun atau target bersifat private selama pesanan berjalan;",
          "link yang dimasukkan salah;",
          "fitur peninjauan tag, sebutan, komentar, atau pengikut masih aktif;",
          "username atau link diganti, atau konten dihapus, selama pesanan berjalan;",
          "penurunan (drop) setelah pesanan selesai pada layanan yang tidak bergaransi;",
          "pesanan yang sudah selesai dikerjakan sesuai jumlahnya.",
        ] },
        { type: "p", text: "Bila ada masalah pada pesanan yang selesai, ajukan komplain lewat tiket. Admin memeriksa dan memberi alasan bila ditolak." },
      ],
    },
    {
      id: "bentuk-refund",
      heading: "Bentuk pengembalian",
      blocks: [
        { type: "p", text: "Refund selalu dikembalikan ke saldo JagoanSosmed, bukan ke rekening bank atau e-wallet. Setiap refund tercatat di halaman Mutasi Saldo dan kamu mendapat notifikasi. Saldo tidak bisa ditarik tunai." },
        { type: "p", text: "Refund dan pesanan dari akun yang sedang ditinjau admin dapat tertunda sampai peninjauan selesai." },
      ],
    },
    {
      id: "refund-deposit",
      heading: "Refund deposit (isi saldo)",
      blocks: [
        { type: "placeholder", text: "Kebijakan pengembalian deposit (misalnya salah transfer, pembayaran ganda, atau deposit yang belum terpakai) belum ditetapkan. Bagian ini akan diisi sebelum pembayaran online diaktifkan." },
      ],
    },
    {
      id: "komplain",
      heading: "Cara mengajukan komplain",
      blocks: [
        { type: "ul", items: [
          "Buka menu Tiket di dasbor, pilih kategori yang sesuai, sebutkan nomor pesanan, dan jelaskan masalahnya (lampirkan tangkapan layar bila ada).",
          `Ajukan dalam ${COMPLAINT_WINDOW_DAYS} hari sejak pesanan selesai atau berubah status. Komplain di luar batas ini dapat ditolak.`,
          "Tim kami memeriksa dan membalas lewat tiket yang sama. Keputusan beserta alasannya dicatat.",
        ] },
      ],
    },
  ],
};

/* ---------------------------------------------------------------------------------------------------------------- */
export const PRIVACY: LegalDoc = {
  slug: "kebijakan-privasi",
  title: "Kebijakan Privasi",
  description: "Kebijakan Privasi JagoanSosmed: data yang dikumpulkan, tujuan, penyimpanan, keamanan, pihak ketiga, cookie, dan hakmu sesuai UU Pelindungan Data Pribadi.",
  intro: "Kami menjaga data pribadimu sesuai Undang-Undang No. 27 Tahun 2022 tentang Pelindungan Data Pribadi (UU PDP). Halaman ini menjelaskan data apa yang kami simpan, untuk apa, dan apa yang bisa kamu lakukan.",
  sections: [
    {
      id: "data-dikumpulkan",
      heading: "Data yang kami kumpulkan",
      blocks: [
        { type: "ul", items: [
          "Data akun: username, alamat email, dan password. Password dikelola oleh layanan autentikasi dan hanya disimpan dalam bentuk hash, bukan teks asli.",
          "Alamat IP, dipakai untuk membatasi percobaan masuk dan pendaftaran serta untuk keamanan.",
          "Riwayat pesanan (layanan, link target, jumlah, status) dan riwayat saldo (isi saldo, pemakaian, refund).",
          "Isi tiket bantuan beserta lampiran yang kamu kirim.",
          "Preferensi bahasa dan tema tampilan.",
          "Cookie sesi agar kamu tetap masuk.",
        ] },
        { type: "p", text: "Kami tidak meminta data sensitif seperti data kesehatan, biometrik, atau dokumen identitas untuk memakai layanan." },
      ],
    },
    {
      id: "tujuan",
      heading: "Tujuan penggunaan",
      blocks: [
        { type: "ul", items: [
          "membuat dan mengamankan akunmu;",
          "memproses pesanan, saldo, dan refund;",
          "menjawab tiket dan memberi dukungan;",
          "mengirim notifikasi tentang akun dan pesananmu;",
          "mencegah penipuan dan penyalahgunaan;",
          "memenuhi kewajiban hukum dan pencatatan keuangan.",
        ] },
      ],
    },
    {
      id: "dasar-pemrosesan",
      heading: "Dasar pemrosesan",
      blocks: [
        { type: "p", text: "Kami memproses datamu berdasarkan persetujuanmu saat mendaftar, kebutuhan untuk melaksanakan perjanjian denganmu (memproses pesanan), kepentingan sah untuk keamanan dan pencegahan penipuan, dan kewajiban hukum." },
      ],
    },
    {
      id: "penyimpanan",
      heading: "Penyimpanan dan lokasi data",
      blocks: [
        { type: "p", text: "Data disimpan di basis data dan penyimpanan berkas milik penyedia infrastruktur kami, Supabase." },
        { type: "placeholder", text: "Lokasi wilayah server produksi belum ditetapkan dan akan ditulis di sini setelah project produksi dibuat. Pemindahan data ke luar wilayah Indonesia dilakukan dengan memperhatikan UU PDP." },
      ],
    },
    {
      id: "keamanan",
      heading: "Keamanan data",
      blocks: [
        { type: "p", text: "Kami menerapkan langkah keamanan yang wajar: koneksi terenkripsi, password disimpan sebagai hash, pembatasan akses data per pengguna, akses admin dengan verifikasi dua langkah, pencatatan aktivitas admin, dan kunci rahasia yang tidak pernah dikirim ke peramban. Tidak ada sistem yang sepenuhnya bebas risiko, tetapi kami meninjau dan memperbaikinya terus-menerus." },
      ],
    },
    {
      id: "pihak-ketiga",
      heading: "Pihak ketiga yang menerima data",
      blocks: [
        { type: "ul", items: [
          "Penyedia layanan (supplier): hanya menerima link atau target pesanan, jenis layanan, dan jumlah. Penyedia tidak menerima email, password, atau saldomu.",
          "Penyedia infrastruktur (Supabase): menyimpan dan memproses data atas nama kami.",
          "Payment gateway: menerima data pembayaran yang diperlukan untuk memproses isi saldo, pada saat pembayaran online diaktifkan.",
          "Pihak berwenang: bila diwajibkan oleh hukum.",
        ] },
        { type: "p", text: "Kami tidak menjual datamu dan tidak membagikannya untuk iklan." },
      ],
    },
    {
      id: "cookie",
      heading: "Cookie",
      blocks: [
        { type: "p", text: "Kami hanya memakai cookie yang diperlukan: cookie sesi untuk menjaga kamu tetap masuk (berlaku selama sesi peramban, atau 30 hari bila kamu mencentang Ingat saya) dan penyimpanan preferensi seperti bahasa dan tema. Kami tidak memakai cookie iklan atau pelacak pihak ketiga." },
      ],
    },
    {
      id: "masa-penyimpanan",
      heading: "Masa penyimpanan",
      blocks: [
        { type: "p", text: "Data akun disimpan selama akunmu aktif. Setelah akun dihapus, data pribadi dihapus atau dianonimkan, kecuali catatan transaksi dan keuangan yang wajib kami simpan sesuai ketentuan hukum." },
        { type: "placeholder", text: "Lama penyimpanan pasti untuk catatan transaksi, tiket, dan log keamanan belum ditetapkan dan akan ditulis di sini." },
      ],
    },
    {
      id: "hak-pengguna",
      heading: "Hakmu",
      blocks: [
        { type: "p", text: "Sesuai UU PDP, kamu berhak untuk:" },
        { type: "ul", items: [
          "mengakses dan mendapatkan salinan data pribadimu;",
          "memperbaiki data yang tidak akurat;",
          "meminta penghapusan akun dan data pribadimu;",
          "menarik persetujuan pemrosesan data.",
        ] },
        { type: "p", text: `Ajukan lewat tiket di dasbor atau lewat kontak di bawah, dengan menyebutkan username dan permintaanmu. Kami memverifikasi identitasmu dan menanggapi dalam waktu wajar. Menarik persetujuan atau menghapus akun berarti kamu tidak bisa lagi memakai layanan; saldo yang tersisa diperlakukan menurut [Kebijakan Refund & Pembatalan](/kebijakan-refund).` },
      ],
    },
    {
      id: "insiden",
      heading: "Penanganan kebocoran data",
      blocks: [
        { type: "p", text: "Bila terjadi kegagalan pelindungan data pribadi, kami menyelidiki dan membatasi dampaknya, lalu memberi tahu pengguna yang terdampak dan lembaga yang berwenang secara tertulis paling lambat 3 x 24 jam sejak insiden diketahui, sesuai UU PDP. Pemberitahuan memuat data yang terungkap, kapan dan bagaimana terjadinya, serta langkah penanganan dan pemulihan." },
      ],
    },
    {
      id: "usia",
      heading: "Usia pengguna",
      blocks: [
        { type: "p", text: `Layanan ini untuk pengguna berusia minimal ${MIN_USER_AGE} tahun. Kami tidak dengan sengaja mengumpulkan data dari pengguna di bawah usia tersebut. Bila kamu mengetahui hal itu terjadi, hubungi kami agar datanya dihapus.` },
      ],
    },
    {
      id: "perubahan",
      heading: "Perubahan kebijakan",
      blocks: [
        { type: "p", text: `Kebijakan ini dapat diperbarui. Versi dan tanggalnya tertera di bagian atas halaman (versi ${LEGAL_VERSION}). Perubahan penting kami umumkan melalui dasbor.` },
      ],
    },
  ],
};

export const LEGAL_DOCS = [TERMS, REFUND, PRIVACY] as const;
/** Public routes of the legal pages (footer, sitemap, signup text). */
export const LEGAL_PATHS = { terms: `/${TERMS.slug}`, refund: `/${REFUND.slug}`, privacy: `/${PRIVACY.slug}` } as const;
