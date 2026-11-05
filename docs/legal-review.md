# Tinjauan hukum: asumsi, keputusan terbuka, dan catatan penyusunan

Teks di `lib/legal-content.ts` (halaman `/syarat-ketentuan`, `/kebijakan-refund`, `/kebijakan-privasi`) adalah **template penyusunan**. Teks ini ditulis dari aturan yang benar-benar berjalan di kode, bukan dari nasihat hukum, dan **harus ditinjau oleh pengacara sebelum peluncuran**.

Halaman publik **tidak boleh** menampilkan catatan penyusunan, placeholder, nama vendor/teknologi, atau kutipan undang-undang. Semua itu hanya ada di dokumen ini. Tes `lib/legal-content.test.ts` dan `e2e/legal.test.ts` menjaga hal itu (kata terlarang: Supabase, Postgres, Vercel, Likeo, UU PDP, Undang-Undang, Pasal, "Belum final", dst.).

Versi saat ini: `LEGAL_VERSION = "2026-11-06"` (satu konstanta untuk "Terakhir diperbarui" dan `profiles.terms_version`). Naikkan setiap kali isi teks berubah secara substansi. Catatan: versi berupa tanggal, jadi dua revisi pada hari yang sama memakai versi yang sama.

## 1. Keputusan yang harus kamu ambil

| Keputusan | Kondisi sekarang |
|---|---|
| **Saldo akun yang diblokir** | Teks publik hanya berkata: pesanan yang melanggar tidak mendapat refund, dan akun dapat diblokir dan dibekukan permanen. **Teks tidak menyatakan saldo hangus**, karena kode tidak melakukannya: memblokir akun hanya mengganti `status` menjadi `diblokir` dan mengakhiri semua sesi. Saldo tetap utuh di akun dan tidak ada alur pencairan. Putuskan: ditahan sementara, dihanguskan, atau dikembalikan setelah ditinjau; lalu tulis kebijakannya (dan bila perlu fitur admin untuk itu). |
| **"Dibatalkan tanpa refund"** | Kode belum punya alur "batalkan pesanan karena pelanggaran tanpa refund". Bila penyedia membatalkan pesanan, sistem otomatis mengembalikan 100%. Admin harus menangani pesanan politik/SARA secara manual (mis. tidak mengirim, atau menyesuaikan saldo) sampai ada alur khusus. |
| **Penegakan larangan konten** | Tidak ada pemeriksaan otomatis atas link atau konten. Larangan ditegakkan oleh tinjauan admin. Bila ingin otomatis, perlu fitur daftar kata/domain. |
| **Ketentuan baru dan pengguna lama** | Aturan konten di kartu sebelum order adalah konstanta (`CONTENT_POLICY_BULLET`), bukan bagian dari ketentuan per platform yang berversi (`v1`). Persetujuan lama tidak diminta ulang. Bila perlu, naikkan versi ketentuan platform di /admin/settings agar pengguna menyetujui ulang. |
| **Penghapusan akun, hak data** | Tidak ada fitur hapus akun mandiri; teks meminta pengajuan lewat tiket atau kontak. Siapkan prosedurnya (verifikasi identitas, saldo tersisa, catatan keuangan). |
| **Refund deposit** | Tidak ada kebijakan di kode, jadi bagian ini **dihapus dari halaman publik**. Tambahkan lagi bila pembayaran online diaktifkan (salah transfer, pembayaran ganda, deposit belum terpakai). |

## 2. Hal yang sengaja dihapus dari halaman publik (isi ulang bila perlu)

- **Dasar hukum**: tidak ada kutipan UU No. 27 Tahun 2022 (UU PDP), pasal, atau peraturan bernama. Bila pengacara meminta, pasal yang relevan dapat ditambahkan lagi: hak subjek data, dan kewajiban memberi tahu kegagalan pelindungan data. Sebelumnya teks menyebut batas **3 x 24 jam** untuk pemberitahuan kebocoran; sekarang teks hanya berkata "secepat mungkin". **Verifikasi angka itu** dengan pengacara sebelum dicantumkan kembali.
- **Nama vendor**: lokasi dan penyedia penyimpanan tidak disebut. Privasi hanya berkata data disimpan di server yang diamankan dan hanya bisa diakses oleh pihak yang berwenang. Untuk laporan internal: infrastruktur adalah Supabase (project produksi belum dibuat; dev di ap-northeast-2, produksi direncanakan Singapura). Bila pengacara menilai lokasi server (termasuk di luar Indonesia) wajib diungkapkan, tulis wilayah final.
- **Lama penyimpanan**: sekarang hanya "selama akun aktif; setelah dihapus, data pribadi dihapus atau dianonimkan kecuali catatan yang wajib disimpan". Lama pasti untuk catatan transaksi, tiket, dan log keamanan **belum ditetapkan**; kode tidak punya penghapusan otomatis.
- **Nama penyedia layanan (supplier)**: tidak pernah disebut ke pelanggan. Pesan error dari penyedia (mengandung nama penyedia) tidak sampai ke pengguna: aksi pengguna hanya menampilkan pesan umum untuk kesalahan selain `ServiceError`. Nama penyedia hanya terlihat di panel admin.

## 3. Asumsi dan angka yang perlu dikonfirmasi

| Hal | Nilai di teks | Sumber / status |
|---|---|---|
| Batas waktu komplain | **7 hari** (`COMPLAINT_WINDOW_DAYS`) | **ASUMSI, bukan dari kode.** Tidak ditegakkan sistem. |
| Usia minimal | **17 tahun** (`MIN_USER_AGE`) | Dari permintaanmu. Tidak ditegakkan di kode. |
| Pembatalan oleh pengguna | **72 jam**, **50%** dari bagian belum terkirim, perlu persetujuan admin | Dari kode (`DEFAULT_CANCEL_POLICY`). **Admin bisa mengubah angka ini di /admin/settings**; halaman hukum statis tidak ikut berubah. Bila diubah, ubah juga `DEFAULT_CANCEL_POLICY` dan naikkan `LEGAL_VERSION`. |
| Refund penuh / sebagian | 100% bila penyedia membatalkan atau pesanan gagal; `floor(biaya x sisa / jumlah)` | Dari kode. Provider "Failed" diperlakukan sama dengan "Canceled". Contoh angka diuji dengan fungsi yang sama dengan sistem. |
| Refill | Sekali per **24 jam** per pesanan, selama masa garansi layanan | Dari kode (`REFILL_COOLDOWN_MS`, `refill_days`). |
| Ingat saya | Sesi 30 hari bila dicentang | Dari kode (`REMEMBER_MAX_AGE`). |
| Cookie | Hanya cookie sesi dan preferensi, tanpa iklan atau pelacak | Sesuai kode saat ini. Konfirmasi tidak ada analytics/pixel yang akan ditambahkan. |
| Data yang dikumpulkan | username, email, hash password, IP, riwayat order dan saldo, isi tiket + lampiran, preferensi bahasa/tema | Sesuai skema. IP disimpan pada kunci pembatas percobaan (`rate_limits`). |
| Pihak ketiga | Penyedia layanan hanya menerima layanan, link, dan jumlah; penyedia infrastruktur; payment gateway saat aktif | Sesuai `submitToProvider`. |
| Hukum dan sengketa | Hukum Republik Indonesia, musyawarah, lalu pengadilan yang berwenang | Template. Tentukan pengadilan negeri tertentu bila diinginkan. |
| Batasan tanggung jawab | Per pesanan dibatasi sebesar biaya pesanan | Template. Pengacara perlu memeriksa keberlakuannya. |

## 4. Hal yang belum ada di teks dan sebaiknya ditambahkan

- **Identitas pengendali data**: nama badan usaha atau pemilik, alamat, dan kontak pelindungan data. Saat ini hanya "JagoanSosmed".
- **Kontak resmi**: `lib/site-config.ts` memiliki `supportEmail`, `whatsapp`, `telegram` yang sengaja kosong; baris kontak hanya muncul bila diisi. Baris "Tiket bantuan" selalu ada.
- **Pendaftaran lewat Google**: bila login Google diaktifkan, `terms_version` belum dicatat untuk pendaftaran lewat Google (kolom tetap null).
- **Pengguna lama**: `terms_version` dan `terms_accepted_at` null untuk akun yang sudah ada (tanpa backfill). Rencanakan pemberitahuan versi baru lewat pengumuman bila perlu.
- **Pesan akun dibekukan**: semua jalur (masuk, pesanan, deposit, tiket) memakai satu pesan, "Akun kamu dibekukan. Hubungi bantuan." Pastikan kanal bantuan di `site-config` sudah diisi supaya pesan itu punya tujuan.

## 5. Pemblokiran akun oleh admin (sudah ada, diperkuat)

- Admin memblokir di Admin > Pengguna > Blokir: wajib password admin, mengetik `BLOKIR`, dan memilih **alasan** (daftar: *Pelanggaran kebijakan konten*, Penipuan atau chargeback, Penyalahgunaan bug atau saldo, Multi-akun untuk promo, Permintaan refund berulang yang tidak wajar, Lainnya) ditambah catatan opsional. Tanpa alasan, aksi ditolak.
- Efek: `profiles.status = 'diblokir'`, semua sesi diakhiri, tidak bisa masuk, memesan, deposit, atau membuka tiket.
- Audit log: aksi `user.ban` dengan admin, status sebelum, dan `{status, reason, note}`; `user.unban` untuk mengaktifkan kembali.
- Status internal tetap `aktif` / `diblokir`; pesan ke pengguna menyebutnya "dibekukan".

## 6. Cara mengubah teks

Edit `lib/legal-content.ts` (bagian `TERMS`, `REFUND`, `PRIVACY`). `[label](/path)` membuat tautan, `**teks**` huruf tebal. Setelah mengubah isi, naikkan `LEGAL_VERSION`. Aturan konten singkat untuk kartu sebelum order ada di `CONTENT_POLICY_BULLET` (`lib/order-rules.ts`).

## 7. Pembatalan tanpa refund dan saldo akun diblokir (sudah ada di kode)

- **Batalkan tanpa refund (pelanggaran)**: Admin > Pesanan > menu pesanan. Wajib mengetik `BATAL`, password admin, dan alasan (Pelanggaran kebijakan konten, SARA/kekerasan, Penipuan, Lainnya) + catatan opsional. Satu fungsi database membatalkan pesanan (`cancelled_by = 'admin'`, `violation_reason`), menolak refund/permintaan batal yang menunggu, memberi tahu pengguna ("Pesananmu dibatalkan karena melanggar ketentuan layanan."), dan menulis audit `order.cancel_violation`. **Tidak ada entri ledger.** Refund otomatis tidak pernah dibuat untuk pesanan ini, termasuk bila penyedia kemudian melapor Canceled. Admin tetap bisa membuat refund manual secara sadar. Pembatalan juga diteruskan ke penyedia (upaya terbaik).
- **Saldo akun diblokir**: memblokir tidak menyentuh saldo. Admin > Pengguna menampilkan lencana "Saldo ditahan", dan menu **Selesaikan saldo** menawarkan: *kembalikan* (dibayar di luar sistem; saldo dikurangi lewat penyesuaian saldo), *hanguskan* (dikurangi lewat penyesuaian saldo), atau *biarkan ditahan* (hanya audit). Tiap keputusan butuh alasan dan password admin, dan menulis audit `user.balance.settle` (+ `user.balance.adjust` per entri ledger; nominal besar dipecah per Rp 100.000.000). Catatan ledger yang terlihat pengguna: "Saldo dikembalikan ke pengguna: <alasan>" atau "Saldo dihanguskan (pelanggaran): <alasan>".
- **Keputusan kebijakan tetap milikmu**: kapan saldo boleh dihanguskan, dan apakah teks publik boleh menyebutnya. Teks publik saat ini tidak menyebut saldo hangus.
