# Audit fitur JagoanSosmed

Tanggal: 5 November 2026. Lingkungan: lokal, tanpa database dan tanpa payment gateway.

**Cara audit.** Semua halaman dibuka lewat Playwright (Chromium) pada build produksi (`next build` + `next start`, port 3100) dengan **store terpisah** (`SG_STORE_PATH`) dan `PROVIDER_MODE=mock`, supaya tidak ada pesanan sungguhan ke Likeo. Alurnya memakai akun yang dibuat lewat form daftar (bukan seed): pengguna A/B dan admin `owner` dengan 2FA. Skrip ada di folder scratchpad sesi; hasil ringkasnya di tabel ini. Layar yang dicek: terang dan gelap, 1920 dan 375 piksel (crawl semua rute pada 375 gelap: 0 masalah). Screenshot: `docs/audit/before` (sebelum, ada data demo), `docs/audit/after-empty` (setelah, keadaan kosong), `docs/audit/after-with-data` (setelah sinkron layanan, ada data nyata).

Legenda: **Berfungsi** (diuji end-to-end), **Sebagian** (jalan tetapi ada yang kurang), **Placeholder** (disimpan tapi tidak berefek), **Rusak**, **Butuh layanan eksternal**.

Hasil pemeriksaan teknis: tidak ada galat konsol, hydration warning, request gagal (selain `/brand/logo-mark.png` yang belum ada), `NaN`, `undefined`, `Invalid Date`, atau overflow horizontal di semua rute landing, auth, pengguna, dan admin. Tidak ada `@ts-ignore`, `any`, `console.log`, atau `href="#"` yang tersisa di kode aplikasi.

## Landing dan halaman publik

| Fitur | Status | Catatan | Diperbaiki |
| --- | --- | --- | --- |
| Hero, fitur, FAQ, footer | Berfungsi | Salinan tidak lagi memuat klaim tak terbukti | Klaim "termurah", "#1", "24/7", angka dan nama palsu dihapus |
| Ulasan, rating, jumlah pelanggan | Disembunyikan | Hanya muncul bila `siteConfig.showSocialProof = true` dan ada data nyata | Dibuat flag di `lib/site-config.ts` |
| Navbar, tombol tema, tautan footer | Berfungsi | Tautan mati ke `#` dihapus | Ya |
| `/terms`, `/refund-policy` | Sebagian | Teks contoh, belum ditinjau hukum. `/refund-policy` membaca aturan dari pengaturan admin | Perlu tinjauan hukum |
| Halaman Kebijakan Privasi | Tidak ada | Belum dibuat | Daftar rilis |
| `/status` | Berfungsi | Dihitung dari sinkronisasi nyata; tanpa pesanan tampil "Belum ada data" | Fix "terhenti" palsu saat belum ada pesanan |
| `/robots.txt`, `/sitemap.xml`, `/manifest.webmanifest` | Berfungsi | `/admin` noindex (header dan robots) | Manifest + theme-color ditambah |
| Logo | Sebagian | Memakai `public/brand/logo-mark.png` yang **belum ada**; sementara tampil monogram "JS" | Butuh berkas dari pemilik |

## Autentikasi

| Fitur | Status | Catatan | Diperbaiki |
| --- | --- | --- | --- |
| Daftar | Berfungsi | Validasi (username, email, password, konfirmasi), duplikat, batas 10 pendaftaran/jam/IP, langsung masuk | Sebelumnya stub tanpa akun |
| Masuk (username atau email) | Berfungsi | Pesan galat umum, batas 5 gagal/15 menit, "Ingat saya" 30 hari, akun diblokir ditolak | Idem |
| Keluar | Berfungsi | Hapus cookie sesi | Idem |
| Sesi pengguna | Sebagian | Cookie bertanda tangan HMAC; belum ada pencabutan sesi dari server | Daftar rilis |
| Perlindungan `/dashboard` | Berfungsi | `proxy.ts` + cek sesi di layout; anonim ke `/login` | Ya |
| Masuk dengan Google | Butuh layanan eksternal | Tombol disembunyikan (`features.googleLogin`) | Ya |
| Lupa password | Butuh layanan eksternal | Butuh email; tautan dihapus | Admin bisa membuat password sementara |
| Login admin + 2FA (TOTP) | Berfungsi | Tidak diubah | - |

## Dashboard pengguna

| Fitur | Status | Catatan | Diperbaiki |
| --- | --- | --- | --- |
| Kartu statistik | Berfungsi | Mulai Rp0 / 0, dari data pengguna | Sebelumnya angka tetap palsu |
| Order baru (kategori, layanan, link, jumlah) | Berfungsi | Tanpa checkbox, catatan persetujuan implisit, validasi, penjaga duplikat link, batas laju, saldo terpotong lewat ledger | Keadaan kosong "Belum ada layanan tersedia" |
| Detail layanan, chip platform | Berfungsi | Katalog dari layanan hasil sinkron | Static catalog dihapus |
| Layanan (pencarian, filter, favorit, "Beli Sekarang") | Berfungsi | Dengan katalog Likeo ±5 ribu layanan halaman terasa berat | Skeleton palsu dihapus |
| Order massal | Berfungsi | Per baris, galat per baris | Keadaan kosong |
| Pesanan (daftar, cari, status, laporkan) | Berfungsi | "Laporkan" membuat tiket nyata | Sebelumnya stub |
| Pembatalan oleh pengguna (aturan 72 jam / 50%) | Sebagian | Diuji di tes unit dan tombol tersembunyi untuk pesanan baru; belum diuji klik di browser karena butuh pesanan berumur 72 jam | - |
| Refill | Berfungsi | Diuji: pesanan selesai -> ajukan -> tampil di pengguna dan admin | Antrian admin membaca data yang salah; diperbaiki |
| Refund | Berfungsi | Sebagian dan batal tercatat dan masuk saldo | - |
| Tambah saldo | Sebagian | Tanpa gateway: pengguna mengajukan deposit, admin mengonfirmasi manual; riwayat nyata | Promo karangan dan unduh invoice palsu dihapus |
| Mutasi saldo | Berfungsi | Ledger nyata, ekspor admin CSV | - |
| Tiket (buat, balas, tutup, buka kembali) | Berfungsi | Lampiran disimpan sebagai data URL di store | `<main>` bersarang diperbaiki |
| Notifikasi (lonceng, halaman, tandai dibaca) | Berfungsi | Polling 30 detik, bukan realtime | - |
| Pembaruan | Berfungsi | Perubahan harga/layanan nyata + pengumuman admin | 24 pembaruan palsu dihapus |
| Pengumuman (admin -> banner pengguna) | Berfungsi | Waktu tayang bawaan sebelumnya tetap `2026-11-05 09:00` | Default jadi waktu sekarang |
| Pengaturan: password, email | Berfungsi | Perlu password saat ini | Sebelumnya stub |
| Pengaturan: detail invoice, zona waktu, pengalaman | Placeholder | Tersimpan dan dimuat ulang, tetapi belum dipakai (tidak ada invoice; zona waktu tidak mengubah tampilan) | Pengisian ulang nilai tersimpan |
| Pengaturan: notifikasi (email/Telegram/WhatsApp) | Butuh layanan eksternal | Halaman hanya menjelaskan; lonceng selalu aktif | Toggle palsu dihapus |
| Pengaturan: 2FA pengguna | Belum tersedia | Pemberitahuan jelas | QR/secret palsu dihapus |
| Foto profil | Dihapus | Belum ada penyimpanan | Ya |
| Afiliasi, Panel Anak, API | Belum tersedia | Halaman menjelaskan; menu disembunyikan (`lib/features.ts`) | Data referral dan API key palsu dihapus |
| Bahasa (id/en), tema, menu akun | Berfungsi | Terjemahan hanya cangkang aplikasi | - |

## Admin

| Fitur | Status | Catatan | Diperbaiki |
| --- | --- | --- | --- |
| Dasbor | Berfungsi | Semua angka dari data nyata; grafik "Belum ada data"; kartu "Langkah awal" menautkan ke langkah berikutnya | Seri grafik acak diganti; profit memakai biaya provider efektif (batal tidak lagi minus) |
| Pengguna (cari, tambah/kurangi saldo, blokir, reset) | Berfungsi | Saldo lewat ledger dengan password; reset = password sementara sekali tampil | Reset sebelumnya "mengirim email" palsu |
| Pesanan (status, awal/sisa, batalkan+refund, kirim ulang, cek manual) | Berfungsi | Parsial dan batal menghasilkan refund yang benar | - |
| Layanan (sinkron + diff, markup, tambah, ubah, impor/ekspor CSV, aktif) | Berfungsi | Diff dikunci ke pratinjau; tampil banner bila kosong | Banner dan pemblokiran kurs/markup kosong |
| Provider (tes koneksi, segarkan, kurs & markup, aktif/nonaktif) | Berfungsi | Mode live diuji dengan API Likeo asli (saldo dan layanan); pembuatan pesanan live **belum** diuji | Tambah provider palsu dihapus |
| Deposit (konfirmasi manual, tolak) | Berfungsi | Idempoten | "Lihat bukti" palsu dihapus |
| Refill, Refund | Berfungsi | Antrian refill kini membaca permintaan nyata | Ya |
| Tiket (dua panel, balas, catatan internal) | Berfungsi | - | - |
| Pengumuman | Berfungsi | - | Waktu tayang bawaan |
| Buku besar, ekspor CSV | Berfungsi | - | - |
| Log aktivitas | Berfungsi | Log contoh dihapus | Ya |
| Statistik (5 tab, rentang, bandingkan) | Berfungsi | Dihitung dari data panel; tanpa data tampil nol/kosong | Generator acak dihapus |
| Pengaturan: umum, pembayaran, operasional, peringkat, ketentuan order, keamanan | Berfungsi | Unggah logo palsu dihapus | Ya |
| Pengaturan: cadangan terakhir, DSN pemantauan, webhook Telegram/email | Placeholder | Disimpan, tidak berefek; teksnya sekarang jujur | Teks diganti |
| Notifikasi admin (lonceng) | Berfungsi | - | - |
| Pemeliharaan (mode) | Berfungsi | Pengguna melihat halaman pemeliharaan | - |

## Server dan logika

| Bagian | Status | Catatan |
| --- | --- | --- |
| Ledger, transaksi + rollback, refund idempoten | Berfungsi | 247 tes unit |
| Adapter Likeo | Sebagian | Format respons terverifikasi dengan API asli (`npm run provider:check`); pembuatan pesanan, refill, cancel live belum dicoba. `add` tidak pernah di-retry saat timeout |
| Sinkron status | Butuh layanan eksternal | Endpoint `/api/cron/sync-orders` (CRON_SECRET) jalan; **tidak ada penjadwal**, jadi pesanan tidak berubah status sampai endpoint dipanggil atau admin menekan "Sinkronkan ulang" |
| Persistensi | Sebagian | File JSON `.data/dev-store.json` (bukan database): tidak aman untuk banyak proses, tanpa transaksi nyata |
| Batas laju | Sebagian | Di memori; reset saat restart, tidak dibagi antar instance |
| Webhook pembayaran | Butuh layanan eksternal | Verifikasi tanda tangan placeholder (HMAC); tanpa gateway tidak ada yang memanggilnya |
| Email | Butuh layanan eksternal | Tidak ada pengiriman |
| Lampiran tiket | Sebagian | Data URL di store; perlu object storage |
| Pembaruan realtime | Butuh layanan eksternal | Polling (lonceng 30 dtk, tiket) |
| Keamanan | Berfungsi | Pengguna B tidak bisa membaca tiket/pesanan A; non-admin tidak bisa `/admin`; admin `noindex`; tidak ada kunci/rahasia di bundle atau HTML; webhook tanpa tanda tangan ditolak (401); cron tanpa secret ditolak (401); batas login bekerja |

## Yang masih harus dikerjakan sebelum rilis

1. **Database sungguhan** (pengganti `.data/dev-store.json`): tabel pengguna, pesanan, ledger, deposit, tiket, notifikasi, log; transaksi nyata dan cadangan.
2. **Payment gateway + webhook** dengan verifikasi tanda tangan sesuai gateway, lalu aktifkan metode otomatis (`features.paymentGateway`).
3. **Email/SMTP**: verifikasi email, lupa password, notifikasi; lalu aktifkan lagi tautan "Lupa password".
4. **Penjadwal sinkron** (cron di hosting) untuk `/api/cron/sync-orders`, plus peringatan bila berhenti.
5. **Uji pesanan live ke Likeo** dengan satu pesanan kecil, termasuk refill dan cancel, dan sesuaikan adapter bila respons berbeda.
6. **Cadangan dan pemulihan** data, serta **pemantauan error** (DSN, log terpusat).
7. **Sesi pengguna yang bisa dicabut** (server-side), batas laju bersama (Redis/DB), dan 2FA untuk pengguna.
8. **Penyimpanan berkas** (object storage) untuk lampiran tiket.
9. **Halaman hukum**: Syarat, Kebijakan Refund, **Kebijakan Privasi** yang ditinjau hukum.
10. **Berkas logo** (`public/brand/logo-mark.png`) lalu `npm run brand:assets` untuk ikon dan favicon.
11. Katalog Likeo ±5 ribu layanan membuat halaman dashboard berat: batasi impor per kategori atau muat bertahap.
12. Fitur yang belum dibuat bila diinginkan: afiliasi, panel anak, API pelanggan, foto profil, notifikasi email/Telegram.
