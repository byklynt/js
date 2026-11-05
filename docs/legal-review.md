# Tinjauan hukum: asumsi, placeholder, dan angka yang harus dikonfirmasi

Teks di `lib/legal-content.ts` (halaman `/syarat-ketentuan`, `/kebijakan-refund`, `/kebijakan-privasi`) adalah **template penyusunan**. Teks ini ditulis dari aturan yang benar-benar berjalan di kode, bukan dari nasihat hukum, dan **harus ditinjau oleh pengacara sebelum peluncuran**.

Versi saat ini: `LEGAL_VERSION = "2026-11-06"` (satu konstanta untuk tanggal "Terakhir diperbarui" dan untuk `profiles.terms_version`). Naikkan setiap kali isi teks berubah secara substansi.

## 1. Placeholder yang tampil di halaman publik (kotak kuning "Belum final")

| Halaman | Bagian | Yang harus diisi |
|---|---|---|
| Kebijakan Refund | Refund deposit | Kebijakan pengembalian deposit (salah transfer, pembayaran ganda, deposit belum terpakai) tidak ada di kode. Saat ini saldo tidak bisa ditarik dan refund hanya ke saldo. |
| Kebijakan Privasi | Penyimpanan dan lokasi data | Wilayah server project Supabase **produksi** (dev memakai ap-northeast-2, produksi direncanakan Singapura). Tulis wilayah final dan dasar pemindahan data lintas negara. |
| Kebijakan Privasi | Masa penyimpanan | Lama penyimpanan pasti catatan transaksi, tiket, dan log keamanan. Kode tidak punya aturan penghapusan otomatis. |

## 2. Asumsi dan angka yang saya tulis dan perlu kamu konfirmasi

| Hal | Nilai di teks | Sumber / status |
|---|---|---|
| Batas waktu komplain | **7 hari** sejak pesanan selesai atau berubah status (`COMPLAINT_WINDOW_DAYS`) | **ASUMSI, bukan dari kode.** Sistem tidak menegakkan batas ini; admin bisa menolak komplain di luar batas. |
| Usia minimal | **17 tahun** (`MIN_USER_AGE`) | Dari permintaanmu. Tidak ditegakkan di kode (tidak ada isian tanggal lahir atau centang usia). |
| Pembatalan oleh pengguna | **72 jam**, **50%** dari bagian belum terkirim, perlu persetujuan admin | Dari kode (`DEFAULT_CANCEL_POLICY`, `request_cancel`, `approve_refund`). **Admin bisa mengubah angka ini di /admin/settings**; halaman hukum statis dan tidak ikut berubah. Bila diubah, ubah juga `DEFAULT_CANCEL_POLICY` dan naikkan `LEGAL_VERSION`. |
| Refund penuh | 100% bila penyedia membatalkan atau pesanan gagal, tanpa syarat usia | Dari kode (`create_refund_for_order`). Provider "Failed" diperlakukan sama dengan "Canceled". |
| Refund sebagian | `floor(biaya x sisa / jumlah)` | Dari kode. Contoh angka diuji di `lib/legal-content.test.ts` dengan fungsi yang sama. |
| Refill | Sekali per **24 jam** per pesanan, selama masa garansi layanan | Dari kode (`REFILL_COOLDOWN_MS`, `refill_days`). |
| Kebocoran data | Pemberitahuan paling lambat **3 x 24 jam** | Dari UU PDP No. 27/2022 (pasal tentang pemberitahuan kegagalan pelindungan data). **Pengacara perlu memverifikasi** angka dan siapa lembaga yang dimaksud. |
| Ingat saya | Sesi 30 hari bila dicentang | Dari kode (`REMEMBER_MAX_AGE`). |
| Cookie | Hanya cookie sesi dan preferensi, tanpa iklan atau pelacak | Sesuai kode saat ini. **Konfirmasi tidak ada analytics/pixel** yang akan ditambahkan. |
| Data yang dikumpulkan | username, email, hash password (Supabase Auth), IP, riwayat order dan saldo, isi tiket + lampiran, preferensi bahasa/tema | Sesuai skema. IP disimpan pada kunci pembatas percobaan (`rate_limits`). |
| Pihak ketiga | Penyedia layanan hanya menerima layanan, link, dan jumlah; Supabase; payment gateway saat aktif | Sesuai `submitToProvider`. **Tambahkan nama hosting aplikasi** (mis. Vercel) bila dianggap pemroses data. |
| Hukum dan sengketa | Hukum Indonesia, musyawarah, lalu pengadilan yang berwenang di Indonesia | Template. Tentukan pengadilan negeri tertentu bila diinginkan. |
| Batasan tanggung jawab | Tanggung jawab per pesanan dibatasi sebesar biaya pesanan | Template. Pengacara perlu memeriksa keberlakuannya (UU Perlindungan Konsumen). |

## 3. Hal yang belum ada di teks dan sebaiknya ditambahkan

- **Identitas pengendali data**: nama badan usaha atau pemilik, alamat, dan pejabat/kontak pelindungan data. Saat ini hanya "JagoanSosmed".
- **Kontak resmi**: `lib/site-config.ts` memiliki `supportEmail`, `whatsapp`, `telegram` yang sengaja kosong; baris kontak hanya muncul bila diisi. Baris "Tiket bantuan" selalu ada. Isi sebelum peluncuran. `brand.supportEmail` (support@jagoansosmed.com) tetap placeholder dan tidak dipakai di halaman hukum.
- **Penghapusan akun**: tidak ada fitur hapus akun mandiri; teks meminta pengguna mengajukannya lewat tiket atau kontak. Siapkan prosedurnya (verifikasi identitas, penanganan saldo tersisa, catatan keuangan).
- **Persetujuan OAuth/Google**: bila login Google diaktifkan, pendaftaran lewat Google belum mencatat `terms_version` (kolom tetap null). Tambahkan langkah persetujuan atau catat di callback.
- **Pengguna lama**: kolom `terms_version` dan `terms_accepted_at` null untuk akun yang sudah ada (tanpa backfill, sesuai permintaan). Rencanakan pemberitahuan versi baru lewat pengumuman bila perlu.
- **Ketentuan per platform**: daftar ketentuan per platform (versi `v1`, bisa diedit admin) tampil di kartu pada halaman order, bukan di halaman hukum. Halaman lama `/refund-policy` yang menampilkannya sekarang dialihkan ke `/kebijakan-refund`.

## 4. Cara mengubah teks

Edit `lib/legal-content.ts` (bagian `TERMS`, `REFUND`, `PRIVACY`). Tulisan `[label](/path)` membuat tautan, `**teks**` membuat huruf tebal, blok `placeholder` tampil sebagai kotak "Belum final". Setelah mengubah isi, naikkan `LEGAL_VERSION`. Tes `lib/legal-content.test.ts` memeriksa id bagian, tautan internal, angka, dan contoh hitungan.
