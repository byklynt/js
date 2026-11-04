# Inventaris data demo (dihapus dari aplikasi)

Tanggal: 5 November 2026. Cadangan store sebelum perubahan: `.data/backup-<timestamp>/dev-store.json` (folder `.data/` ada di `.gitignore`).
Cabang kerja: `chore/remove-demo-data`.

Aturan sekarang: **aplikasi tidak pernah mengisi data contoh saat start.** Semua data demo hanya ada di `lib/dev/` (dipakai tes dan `npm run seed:demo`).
Keadaan awal aplikasi dibuat oleh `createEmptyDb()` di `lib/admin-data.ts`: pengaturan bawaan dan satu baris provider Likeo (saldo kosong). Selebihnya kosong.

## Kode

| File | Isi demo | Tindakan |
| --- | --- | --- |
| `lib/admin-data.ts` | 25 pengguna palsu (`jagoansosmed_user`, `budi_santoso`, `andi_pratama`, `rina_wulandari`, ...), saldo palsu, 36 pesanan, 18 deposit, refill, tiket, 4 pengumuman, 6 log audit, ledger/refund/sync/notifikasi palsu, provider Alfa/Beta/Gamma (`*.example`), 3 deret grafik palsu (`revenueSeries`, `ordersByPlatform`), `MOCK_TODAY` | Dipindah ke `lib/dev/demo-seed.ts`. Diganti `createEmptyDb()`; grafik dihitung dari data nyata (`lib/server/series.ts`); "hari ini" memakai tanggal nyata WIB (`lib/server/time.ts`) |
| `lib/dashboard-data.ts` | ±70 layanan dan 8 kategori statis, kartu statistik palsu (Rp125.000, 7.010.945 pesanan), klaim "8 tahun pengalaman" | Layanan/kategori jadi daftar kosong yang diisi dari layanan hasil sinkron provider (`CatalogHydrator`); kartu statistik dari angka pengguna (`statCardsFor`); katalog lama dipindah ke `lib/dev/demo-data.ts` |
| `lib/orders-data.ts`, `refills-data.ts`, `refunds-data.ts` | Contoh pesanan, refill, refund | Array contoh dipindah ke `lib/dev/demo-data.ts`; file hanya menyimpan tipe dan label |
| `lib/payments-data.ts` | Riwayat pembayaran palsu, tingkat bonus 3/5/6%, metode QRIS/bank/e-wallet/VA/crypto | Riwayat dari deposit nyata; bonus dari pengaturan admin (default kosong); metode butuh gateway ditandai `needsGateway` dan dinonaktifkan |
| `lib/tickets-data.ts` | 8 tiket contoh + helper percakapan | Dipindah ke `lib/dev/demo-data.ts` |
| `lib/updates-data.ts` | 24 "pembaruan layanan" yang dibangkitkan + `MOCK_TODAY` | Dihapus; halaman Pembaruan hanya menampilkan perubahan harga/layanan nyata dan pengumuman admin |
| `lib/admin-stats-data.ts` | Generator 180 hari data statistik acak (`rng`) | Diganti `buildStatsDatasetFromDb()` (dihitung dari pesanan, deposit, pengguna, tiket nyata) |
| `lib/affiliates-data.ts`, `components/affiliates/` | Tautan referral palsu `jagoansosmed.com/ref/kzumg`, statistik komisi | Dihapus; halaman Afiliasi menampilkan "Belum tersedia" |
| `lib/settings-data.ts` | API key palsu `sg_live_...`, peringkat statis "Starter" | Dihapus; peringkat dari data pengguna; API ditandai belum tersedia |
| `lib/balance.ts` | `mockBalance = 125000` | Dihapus; saldo dibaca dari server |
| `lib/auth-actions.ts` | Login/daftar tiruan (`setTimeout`, `console.log`), pengguna tetap `jagoansosmed_user` | Diganti autentikasi sungguhan (lihat laporan audit) |
| `lib/dashboard-actions.ts` | Stub: `reportOrder`, `createDeposit`, `changePassword`, `changeEmail`, `enable2FA`, `disable2FA`, `saveSettings`, `regenerateApiKey` (acak), `requestPayout` | Disambungkan ke server (laporan -> tiket, deposit -> permintaan manual, password/email/pengaturan nyata); sisanya dihapus |
| `lib/landing-data.ts` | 8 testimoni dengan nama palsu, "4.9/5.0 - 500+ Ulasan", "ribuan pelanggan", kartu "Total Penjualan Rp 500.000 +15%", tabel perbandingan kompetitor, klaim "termurah", "Support 24/7", fitur yang belum ada (pembayaran otomatis, layanan bulanan, API) | Testimoni dan rating dikosongkan dan disembunyikan lewat `lib/site-config.ts` (`showSocialProof = false`); kartu penjualan, tabel kompetitor, CTA reseller dihapus; teks diganti salinan netral yang benar |
| `lib/auth-data.ts`, `components/auth/dashboard-preview.tsx`, `components/admin/login/admin-preview.tsx` | Pratinjau dasbor dengan angka dan nama palsu | Angka jadi 0, daftar pesanan kosong ("Belum ada pesanan"), grafik datar |
| `components/auth/floating-cards.tsx` | Kartu melayang "Rani A. dapat followers baru", "Rp 5.000.000 +110%" | Dihapus |
| `components/landing/dashboard-mockup.tsx` | Saldo Rp 10.590.000, 235 pesanan diproses | Angka jadi 0 (lewat `dashboardMock`) |
| `components/settings/two-factor.tsx` | QR tiruan, secret dan kode cadangan palsu | Diganti pemberitahuan "Belum tersedia" |
| `components/funds/bonus-info-card.tsx` | Promo karangan "Bonus Deposit Pertama 10% hingga Rp 50.000" | Dihapus; kartu hanya tampil jika admin mengisi tingkat bonus |
| `components/settings/settings-shell.tsx` | Unggah foto profil tiruan (hanya toast) | Dihapus |
| `components/admin/settings/admin-settings-forms.tsx` | Unggah logo tiruan | Dihapus |
| `components/admin/deposits/deposits-view.tsx` | "Lihat bukti" (pratinjau contoh) | Dihapus (belum ada unggah bukti) |
| `components/admin/providers/providers-view.tsx` | "Tambah provider", "Ubah", "Tampilkan API key" untuk provider acak tanpa adapter | Dihapus; hanya Likeo (URL/key dari `.env.local`) |
| `lib/admin-actions.ts` | `resetUserPassword` "mengirim email" (contoh) | Diganti password sementara sekali tampil untuk admin |
| 7 halaman daftar (`use-list-state`, pesanan, refill, refund, ledger, layanan, statistik) | Skeleton palsu 400 ms setiap filter berubah | Dihapus; skeleton hanya saat data sungguhan dimuat |
| `components/updates/updates-page.tsx` | Skeleton palsu 400 ms | Dihapus |
| Navigasi (`lib/nav-config.ts`) | Tautan mati ke `#` (Aplikasi Mobile, Pengumuman WhatsApp/Telegram, Bot Telegram), menu Afiliasi, Panel Anak, API | Dihapus dari menu; halaman tetap ada dan menampilkan "Belum tersedia" |
| `app/(dashboard)/layout.tsx` | Pengguna tetap dari stub | Cek sesi sungguhan, diarahkan ke `/login` bila belum masuk |

## Data tersimpan (`.data/dev-store.json`)

| Isi | Tindakan |
| --- | --- |
| 4 pengumuman contoh ("Diskon deposit akhir bulan", "Jadwal pemeliharaan sistem", "Harga khusus reseller", "Layanan YouTube sedang gangguan") | Dihapus |
| 6 log audit contoh (`log_1`..`log_6`) | Dihapus (log tindakan admin yang sebenarnya dipertahankan) |
| Notifikasi dan bahasa dari uji | Dihapus |
| 2 pengguna uji (`testern...`) yang terbuat saat audit | Dihapus |
| Admin: hash password, 2FA, sesi, kunci `ADMIN_2FA_ENC_KEY`, `keyCheck` | **Tidak disentuh** |
| Konfigurasi Likeo (`PROVIDER_MODE`, `LIKEO_API_URL`, `LIKEO_API_KEY` di `.env.local`) | **Tidak disentuh** |
| 5.082 layanan hasil sinkron LIVE dari Likeo, kurs dan markup yang kamu atur | Dipertahankan (data nyata) |

## Yang sengaja masih ada

- `lib/dev/demo-data.ts`, `lib/dev/demo-seed.ts`, `scripts/seed-demo.ts` (`npm run seed:demo`, menolak jalan di production, membuat cadangan dulu).
- Adapter mock provider (`lib/server/providers/mock.ts`): hanya aktif bila `PROVIDER_MODE=mock` dipilih sendiri. Tanpa `PROVIDER_MODE`, provider "belum aktif" dan tidak ada data karangan.
- Tes (`lib/**/__tests__`) membuat fixture sendiri dari `seedDemoDb()` di memori; tidak menyentuh store.
- `DEV_OWNER_TOTP_SECRET` (kunci TOTP awal akun `owner` untuk pengembangan) tetap ada karena kamu minta data 2FA admin tidak diubah.
