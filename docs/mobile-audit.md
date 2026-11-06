# Audit tampilan seluler

Dihasilkan oleh `scripts/mobile-audit.mjs` (Playwright, WebKit + Chromium) dan `scripts/mobile-audit-report.mjs`. Hanya DEV, tidak menyentuh produksi.

Pemeriksaan terukur: sebelum **897**, sesudah **897** (satu pemeriksaan = satu halaman pada satu perangkat/tema/orientasi).

## Ringkasan sebelum / sesudah

| Tingkat | Pemeriksaan | Halaman sebelum | Temuan sebelum | Halaman sesudah | Temuan sesudah |
|---|---|---:|---:|---:|---:|
| Merusak pemakaian | Halaman bisa digeser ke samping (overflow horizontal) | 134 | 134 | 0 | 0 |
| Merusak pemakaian | Input di bawah 16px (iOS zoom saat fokus) | 552 | 1572 | 0 | 0 |
| Merusak pemakaian | Kontrol tertutup elemen lain | 107 | 680 | 1 | 3 |
| Merusak pemakaian | Dialog / drawer bermasalah (keluar layar, tidak bisa di-scroll, scroll halaman tidak terkunci) | 0 | 0 | 0 | 0 |
| Terlihat salah | Lapisan fixed / sticky saling menimpa | 58 | 100 | 0 | 0 |
| Terlihat salah | Teks terpotong tanpa elipsis | 0 | 0 | 0 | 0 |
| Terlihat salah | Target sentuh < 40px | 885 | 7732 | 63 | 114 |
| Terlihat salah | Atribut keyboard (inputmode / autocomplete / type) | 180 | 180 | 0 | 0 |
| Minor | Gambar tanpa ruang tercadang (layout shift) | 0 | 0 | 0 | 0 |

## Merusak pemakaian

### Halaman bisa digeser ke samping (overflow horizontal) (sebelum: 134 halaman)

- **blog article** pada 12 konfigurasi: `a.text-primary-600.underline "https://www.instagram.co" right=1536 (viewport 1280)`, `a.text-primary-600.underline "https://www.instagram.co" right=1536 (viewport 1440)`, `a.text-primary-600.underline "https://www.instagram.co" right=1536 (viewport 320)`
- **dashboard (Order Baru)** pada 1 konfigurasi: 
- **dashboard + drawer** pada 1 konfigurasi: 
- **dashboard + account menu** pada 2 konfigurasi: `div.flex.shrink-0 "Terang3RpRp25.900.000Zzt" right=342 (viewport 320)`, `div.relative "Zzt_mu_mdsoyxzt_mu_mdsoy" right=342 (viewport 320)`
- **dashboard + notifications** pada 2 konfigurasi: `div.flex.shrink-0 "Terang3NotifikasiTandai " right=342 (viewport 320)`, `div.relative "Z" right=342 (viewport 320)`
- **dashboard tab Cari** pada 2 konfigurasi: `div.flex.shrink-0 "Terang3RpRp25.900.000Z" right=342 (viewport 320)`, `div.relative "Z" right=342 (viewport 320)`
- **dashboard tab Order Massal** pada 1 konfigurasi: 
- **dashboard + category dropdown** pada 1 konfigurasi: 
- **layanan** pada 1 konfigurasi: 
- **pesanan (list)** pada 2 konfigurasi: `form.flex.h-[38px] right=333 (viewport 320)`, `button.flex.h-7 "Cari" right=328 (viewport 320)`
- **tambah saldo** pada 1 konfigurasi: 
- **tambah saldo + riwayat** pada 2 konfigurasi: `div.flex.shrink-0 "Terang3RpRp25.900.000Z" right=342 (viewport 320)`, `div.relative "Z" right=342 (viewport 320)`
- **deposit pending-qris** pada 1 konfigurasi: 
- **deposit pending-va** pada 1 konfigurasi: 
- **deposit pending-ewallet** pada 2 konfigurasi: `div.flex.shrink-0 "Terang3RpRp25.900.000Z" right=342 (viewport 320)`, `div.relative "Z" right=342 (viewport 320)`
- **deposit paid** pada 1 konfigurasi: 
- **deposit expired** pada 1 konfigurasi: 
- **deposit failed** pada 1 konfigurasi: 
- **deposit cancelled** pada 1 konfigurasi: 
- **mutasi saldo** pada 1 konfigurasi: 
- **tiket (list)** pada 1 konfigurasi: 
- **tiket (thread)** pada 2 konfigurasi: `div.flex.shrink-0 "Terang3RpRp25.900.000Z" right=342 (viewport 320)`, `div.relative "Z" right=342 (viewport 320)`
- **pembaruan** pada 2 konfigurasi: `form.flex.h-[38px] right=333 (viewport 320)`, `button.flex.h-7 "Cari" right=328 (viewport 320)`
- **refill** pada 2 konfigurasi: `form.flex.h-[38px] right=333 (viewport 320)`, `button.flex.h-7 "Cari" right=328 (viewport 320)`
- **refund** pada 2 konfigurasi: `form.flex.h-[38px] right=333 (viewport 320)`, `button.flex.h-7 "Cari" right=328 (viewport 320)`

### Input di bawah 16px (iOS zoom saat fokus) (sebelum: 552 halaman)

- **login** pada 12 konfigurasi: `input#_R_4t9av5ubtb_.w-full.rounded-xl font-size 14px`, `input#_R_6t9av5ubtb_.w-full.rounded-xl font-size 14px`
- **signup** pada 12 konfigurasi: `input#_R_4t9av5ubtb_.w-full.rounded-xl font-size 14px`, `input#_R_6t9av5ubtb_.w-full.rounded-xl font-size 14px`, `input#_R_8t9av5ubtb_.w-full.rounded-xl font-size 14px`
- **forgot-password** pada 12 konfigurasi: `input#_R_2t9av5ubtb_.w-full.rounded-xl font-size 14px`
- **services (public)** pada 12 konfigurasi: `input.w-full.rounded-full font-size 14px`, `select.w-full.rounded-full "Semua kategoriInstagram " font-size 14px`
- **blog list** pada 12 konfigurasi: `input.h-10.min-w-0 "Cari artikel" font-size 14px`
- **admin login** pada 12 konfigurasi: `input#_R_5qilfiv5ubtb_.w-full.rounded-xl font-size 14px`, `input#_R_7qilfiv5ubtb_.w-full.rounded-xl font-size 14px`
- **dashboard (Order Baru)** pada 12 konfigurasi: `input#_R_jinpfd6btb_.h-[34px].w-full font-size 10px`, `input#_R_jinpfd6btbH1_.h-[34px].w-full font-size 10px`
- **dashboard + drawer** pada 12 konfigurasi: `input#_R_jinpfd6btb_.h-[34px].w-full font-size 10px`, `input#_R_jinpfd6btbH1_.h-[34px].w-full font-size 10px`
- **dashboard + account menu** pada 12 konfigurasi: `input#_R_jinpfd6btb_.h-[34px].w-full font-size 10px`, `input#_R_jinpfd6btbH1_.h-[34px].w-full font-size 10px`
- **dashboard + notifications** pada 12 konfigurasi: `input#_R_jinpfd6btb_.h-[34px].w-full font-size 10px`, `input#_R_jinpfd6btbH1_.h-[34px].w-full font-size 10px`
- **dashboard tab Cari** pada 12 konfigurasi: `input.h-[34px].w-full "Cari layanan berdasarkan ID atau nama" font-size 10px`
- **dashboard tab Order Massal** pada 12 konfigurasi: `textarea#_r_0_.min-h-[268px].w-full font-size 11px`
- **dashboard + category dropdown** pada 12 konfigurasi: `input.h-8.w-full "Cari Kategori" font-size 10.5px`, `input#_R_jinpfd6btb_.h-[34px].w-full font-size 10px`, `input#_R_jinpfd6btbH1_.h-[34px].w-full font-size 10px`
- **layanan** pada 12 konfigurasi: `input#services-search.h-[34px].w-full font-size 10.5px`
- **pesanan (list)** pada 12 konfigurasi: `input.min-w-0.flex-1 "Cari pesanan berdasarkan ID, layanan, atau link" font-size 10px`
- **tambah saldo** pada 12 konfigurasi: `input#_R_3dbsnpfd6btb_.h-[38px].w-full font-size 11px`
- **tambah saldo + riwayat** pada 12 konfigurasi: `input#_R_3dbsnpfd6btb_.h-[38px].w-full font-size 11px`
- **tiket (list)** pada 12 konfigurasi: `input#_R_1dbsnpfd6btb_.w-full.rounded-xl font-size 10px`, `textarea#_R_1dbsnpfd6btbH2_.w-full.rounded-xl font-size 10px`
- **pembaruan** pada 12 konfigurasi: `input.min-w-0.flex-1 "Cari pembaruan berdasarkan ID atau nama layanan" font-size 10px`
- **refill** pada 12 konfigurasi: `input.min-w-0.flex-1 "Cari refill berdasarkan ID refill, ID pesanan, link, atau nama layanan" font-size 10px`
- **refund** pada 12 konfigurasi: `input.min-w-0.flex-1 "Cari refund berdasarkan ID pesanan" font-size 10px`
- **order massal** pada 12 konfigurasi: `textarea#_R_5dbsnpfd6btb_.min-h-[268px].w-full font-size 11px`
- **pengaturan** pada 12 konfigurasi: `input#_R_d5fknpfd6btb_.h-[34px].w-full font-size 10px`, `input#_R_l5fknpfd6btb_.h-[34px].w-full font-size 10px`, `input#_R_t5fknpfd6btb_.h-[34px].w-full font-size 10px`
- **pengaturan/invoice** pada 12 konfigurasi: `input#_R_6inpfknpfd6btb_.h-[34px].w-full font-size 10px`, `input#_R_ainpfknpfd6btb_.h-[34px].w-full font-size 10px`, `input#_R_einpfknpfd6btb_.h-[34px].w-full font-size 10px`
- **pengaturan/timezone-api** pada 12 konfigurasi: `input#_R_inpfknpfd6btb_.h-[34px].w-full font-size 10px`

### Kontrol tertutup elemen lain (sebelum: 107 halaman)

- **syarat-ketentuan** pada 12 konfigurasi: `a.text-slate-600.hover:text-primary-accent "2. Akun pengguna" is covered by h1.text-3xl.font-extrabold "Syarat & Ketentuan"`, `a.text-slate-600.hover:text-primary-accent "3. Saldo dan cara order" is covered by h1.text-3xl.font-extrabold "Syarat & Ketentuan"`, `a.text-slate-600.hover:text-primary-accent "4. Kewajibanmu sebelum d" is covered by p.mt-2.text-sm "Terakhir diperbarui: 6 N"`
- **kebijakan-refund** pada 12 konfigurasi: `a.text-slate-600.hover:text-primary-accent "2. Refund sebagian (part" is covered by h1.text-3xl.font-extrabold "Kebijakan Refund & Pemba"`, `a.text-slate-600.hover:text-primary-accent "3. Pembatalan yang kamu " is covered by h1.text-3xl.font-extrabold "Kebijakan Refund & Pemba"`, `a.text-slate-600.hover:text-primary-accent "4. Kondisi yang tidak me" is covered by p.mt-2.text-sm "Terakhir diperbarui: 6 N"`
- **kebijakan-privasi** pada 12 konfigurasi: `a.text-slate-600.hover:text-primary-accent "2. Tujuan penggunaan" is covered by h1.text-3xl.font-extrabold "Kebijakan Privasi"`, `a.text-slate-600.hover:text-primary-accent "3. Dasar pemrosesan" is covered by h1.text-3xl.font-extrabold "Kebijakan Privasi"`, `a.text-slate-600.hover:text-primary-accent "4. Penyimpanan data" is covered by p.mt-2.text-sm "Terakhir diperbarui: 6 N"`
- **dashboard + notifications** pada 7 konfigurasi: `a.flex.h-[34px] "Tambah Saldo" is covered by div.border-t.border-slate-200/70 "Lihat semua"`, `a.flex.h-[34px] "Tambah Saldo" is covered by li.animate-shimmer.h-12`, `a.flex.h-[34px] "Tambah Saldo" is covered by ul.space-y-2.p-3`
- **dashboard + category dropdown** pada 12 konfigurasi: `button.flex.h-[39px] "Twitch" is covered by div.flex.h-[67px] "Beranda /Order BaruBuat "`, `button.flex.h-[39px] "Reddit" is covered by div.flex.h-[67px] "Beranda /Order BaruBuat "`, `button.flex.h-[39px] "SEO Backlink" is covered by button.flex.h-10 "RpRp25.900.000"`
- **dashboard tab Cari** pada 10 konfigurasi: `button.flex.h-[39px] "YouTube" is covered by div.flex.h-[67px] "Beranda /Order BaruBuat "`, `button.flex.h-[39px] "TikTok" is covered by div.flex.h-[67px] "Beranda /Order BaruBuat "`, `button.flex.h-[39px] "Twitter" is covered by div.flex.shrink-0 "Terang3RpRp25.900.000Z"`
- **dashboard tab Order Massal** pada 10 konfigurasi: `button.flex.h-[39px] "YouTube" is covered by div.flex.h-[67px] "Beranda /Order BaruBuat "`, `button.flex.h-[39px] "TikTok" is covered by div.flex.h-[67px] "Beranda /Order BaruBuat "`, `button.flex.h-[39px] "Twitter" is covered by div.flex.shrink-0 "Terang3RpRp25.900.000Z"`
- **admin + drawer** pada 10 konfigurasi: `button.flex.h-9 "Buka menu navigasi" is covered by div.flex.shrink-0`, `button.flex.h-8 "Aktifkan mode gelap" is covered by div.flex.shrink-0`, `button.relative.flex "Notifikasi" is covered by div.flex.shrink-0`
- **dashboard + drawer** pada 10 konfigurasi: `button.flex.h-9 "Buka menu navigasi" is covered by div.flex.shrink-0`, `button.flex.h-8 "Aktifkan mode gelap" is covered by div.flex.shrink-0`, `button.relative.flex "Notifikasi, 3 belum dibaca" is covered by div.flex.shrink-0`
- **pengaturan/timezone-api** pada 7 konfigurasi: `button.flex.w-full "Asia/Dubai (UTC+4)" is covered by div.mb-4.flex "API"`, `button.flex.w-full "Europe/London (UTC+0)" is covered by section.border-t.border-slate-200/70 "APIAPI untuk pelanggan b"`, `button.flex.w-full "Europe/Berlin (UTC+1)" is covered by p.max-w-[520px].rounded-xl "API untuk pelanggan belu"`
- **dashboard + account menu** pada 2 konfigurasi: `a.flex.h-[34px] "Pesanan Saya" is covered by div#_R_5j6btb_.absolute.top-full "Menu akun"`
- **admin layanan + pilih baris** pada 3 konfigurasi: `input.h-4.w-4 "Pilih layanan 10" is covered by div.sticky.bottom-4 "Aksi layanan terpilih"`, `button.relative.h-5 "Aktifkan layanan 10" is covered by button.flex.items-center "Nonaktifkan"`, `button.flex.h-8 "Ubah layanan 10" is covered by div.sticky.bottom-4 "Aksi layanan terpilih"`

### Kontrol tertutup elemen lain (sesudah: 1 halaman)

- **admin layanan + pilih baris** pada 1 konfigurasi: `input.h-4.w-4 "Pilih layanan 10" is covered by div.sticky.bottom-[max(16px,env(safe-area-inset-bottom))] "Aksi layanan terpilih"`, `button.relative.h-5 "Aktifkan layanan 10" is covered by button.flex.items-center "Nonaktifkan"`, `button.flex.h-8 "Ubah layanan 10" is covered by button.flex.items-center "Batal"`

## Terlihat salah

### Lapisan fixed / sticky saling menimpa (sebelum: 58 halaman)

- **admin layanan + aksi massal** pada 12 konfigurasi: `header.sticky.top-0 "Beranda /Admin /LayananA" overlaps div.fixed.inset-0 "Aksi massalPilih cakupan" (320x67)`, `header.sticky.top-0 "Beranda /Admin /LayananA" overlaps div.fixed.inset-0 "Aksi massalPilih cakupan" (360x67)`, `header.sticky.top-0 "Beranda /Admin /LayananA" overlaps div.fixed.inset-0 "Aksi massalPilih cakupan" (390x67)`
- **admin layanan + sinkronkan** pada 12 konfigurasi: `header.sticky.top-0 "Beranda /Admin /LayananA" overlaps div.fixed.inset-0 "Sinkronkan dari provider" (320x67)`, `header.sticky.top-0 "Beranda /Admin /LayananA" overlaps div.fixed.inset-0 "Sinkronkan dari provider" (360x67)`, `header.sticky.top-0 "Beranda /Admin /LayananA" overlaps div.fixed.inset-0 "Sinkronkan dari provider" (390x67)`
- **admin layanan + tambah** pada 12 konfigurasi: `header.sticky.top-0 "Beranda /Admin /LayananA" overlaps div.fixed.inset-0 "Tambah layananHarga akhi" (320x67)`, `header.sticky.top-0 "Beranda /Admin /LayananA" overlaps div.fixed.inset-0 "Tambah layananHarga akhi" (360x67)`, `header.sticky.top-0 "Beranda /Admin /LayananA" overlaps div.fixed.inset-0 "Tambah layananHarga akhi" (390x67)`
- **admin + drawer** pada 10 konfigurasi: `aside.fixed.inset-y-0 "JagoanSosmedAdminZAdminz" overlaps header.sticky.top-0 "Beranda /Admin /DasborRi" (288x67)`
- **dashboard + drawer** pada 10 konfigurasi: `aside.fixed.inset-y-0 "JagoanSosmedZAkun Sayazt" overlaps header.sticky.top-0 "Beranda /Order BaruBuat " (288x67)`, `aside.fixed.inset-y-0 "JagoanSosmedZAkun Sayazt" overlaps header.sticky.top-0 "Beranda /Order BaruBuat " (272x67)`
- **admin layanan + pilih baris** pada 2 konfigurasi: `th.sticky.top-0 "ID" overlaps div.sticky.bottom-4 "Aksi layanan terpilih" (45x40)`, `th.sticky.top-0 "Nama" overlaps div.sticky.bottom-4 "Aksi layanan terpilih" (410x40)`, `th.sticky.top-0 "Harga akhir" overlaps div.sticky.bottom-4 "Aksi layanan terpilih" (121x40)`

### Target sentuh < 40px (sebelum: 885 halaman)

- **landing** pada 12 konfigurasi: `a.flex.items-center "JagoanSosmed" 159x32`, `button.flex.h-9 "Aktifkan mode gelap" 36x36`, `button.flex.h-9 "Buka menu" 36x36`
- **landing + menu** pada 9 konfigurasi: `a.flex.items-center "JagoanSosmed" 159x32`, `button.flex.h-9 "Aktifkan mode gelap" 36x36`, `button.flex.h-9 "Tutup menu" 36x36`
- **login** pada 12 konfigurasi: `a.absolute.left-5 "Kembali" 76x20`, `button.absolute.right-3 "Tampilkan password" 24x24`, `input.h-4.w-4 272x20`
- **signup** pada 12 konfigurasi: `a.absolute.left-5 "Kembali" 76x20`, `button.absolute.right-3 "Tampilkan password" 24x24`
- **forgot-password** pada 12 konfigurasi: `a.absolute.left-5 "Kembali" 76x20`
- **services (public)** pada 12 konfigurasi: `a.flex.items-center "JagoanSosmed" 159x32`, `button.flex.h-9 "Aktifkan mode gelap" 36x36`, `button.flex.h-9 "Buka menu" 36x36`
- **blog list** pada 12 konfigurasi: `a.flex.items-center "JagoanSosmed" 159x32`, `button.flex.h-9 "Aktifkan mode gelap" 36x36`, `button.flex.h-9 "Buka menu" 36x36`
- **blog article** pada 12 konfigurasi: `a.flex.items-center "JagoanSosmed" 159x32`, `button.flex.h-9 "Aktifkan mode gelap" 36x36`, `button.flex.h-9 "Buka menu" 36x36`
- **syarat-ketentuan** pada 12 konfigurasi: `a.flex.items-center "JagoanSosmed" 155x32`, `a.text-sm.font-medium "Beranda" 57x20`, `summary.cursor-pointer.text-sm "Daftar isi" 254x20`
- **kebijakan-refund** pada 12 konfigurasi: `a.flex.items-center "JagoanSosmed" 155x32`, `a.text-sm.font-medium "Beranda" 57x20`, `summary.cursor-pointer.text-sm "Daftar isi" 254x20`
- **kebijakan-privasi** pada 12 konfigurasi: `a.flex.items-center "JagoanSosmed" 155x32`, `a.text-sm.font-medium "Beranda" 57x20`, `summary.cursor-pointer.text-sm "Daftar isi" 254x20`
- **admin login** pada 12 konfigurasi: `a.absolute.left-5 "Kembali" 76x20`, `button.absolute.right-3 "Tampilkan password" 24x24`
- **dashboard (Order Baru)** pada 12 konfigurasi: `button.flex.h-9 "Buka menu navigasi" 36x36`, `button.flex.h-8 "Aktifkan mode gelap" 23x32`, `button.relative.flex "Notifikasi, 3 belum dibaca" 32x32`
- **dashboard + drawer** pada 12 konfigurasi: `button.flex.h-9 "Buka menu navigasi" 36x36`, `button.flex.h-8 "Aktifkan mode gelap" 23x32`, `button.relative.flex "Notifikasi, 3 belum dibaca" 32x32`
- **dashboard + account menu** pada 12 konfigurasi: `button.flex.h-9 "Buka menu navigasi" 36x36`, `button.flex.h-8 "Aktifkan mode gelap" 23x32`, `button.relative.flex "Notifikasi, 3 belum dibaca" 32x32`
- **dashboard + notifications** pada 12 konfigurasi: `button.flex.h-9 "Buka menu navigasi" 36x36`, `button.flex.h-8 "Aktifkan mode gelap" 23x32`, `button.relative.flex "Notifikasi, 3 belum dibaca" 32x32`
- **dashboard tab Cari** pada 12 konfigurasi: `button.flex.h-9 "Buka menu navigasi" 36x36`, `button.flex.h-8 "Aktifkan mode gelap" 23x32`, `button.relative.flex "Notifikasi, 3 belum dibaca" 32x32`
- **dashboard tab Order Massal** pada 12 konfigurasi: `button.flex.h-9 "Buka menu navigasi" 36x36`, `button.flex.h-8 "Aktifkan mode gelap" 23x32`, `button.relative.flex "Notifikasi, 3 belum dibaca" 32x32`
- **dashboard + category dropdown** pada 12 konfigurasi: `button.flex.h-9 "Buka menu navigasi" 36x36`, `button.flex.h-8 "Aktifkan mode gelap" 23x32`, `button.relative.flex "Notifikasi, 3 belum dibaca" 32x32`
- **layanan** pada 12 konfigurasi: `button.flex.h-9 "Buka menu navigasi" 36x36`, `button.flex.h-8 "Aktifkan mode gelap" 23x32`, `button.relative.flex "Notifikasi, 3 belum dibaca" 32x32`
- **pesanan (list)** pada 12 konfigurasi: `button.flex.h-9 "Buka menu navigasi" 36x36`, `button.flex.h-8 "Aktifkan mode gelap" 23x32`, `button.relative.flex "Notifikasi, 3 belum dibaca" 32x32`
- **tambah saldo** pada 12 konfigurasi: `button.flex.h-9 "Buka menu navigasi" 36x36`, `button.flex.h-8 "Aktifkan mode gelap" 23x32`, `button.relative.flex "Notifikasi, 3 belum dibaca" 32x32`
- **tambah saldo + riwayat** pada 12 konfigurasi: `button.flex.h-8 "Tutup riwayat pembayaran" 32x32`
- **deposit pending-qris** pada 12 konfigurasi: `button.flex.h-9 "Buka menu navigasi" 36x36`, `button.flex.h-8 "Aktifkan mode gelap" 23x32`, `button.relative.flex "Notifikasi, 3 belum dibaca" 32x32`
- **deposit pending-va** pada 12 konfigurasi: `button.flex.h-9 "Buka menu navigasi" 36x36`, `button.flex.h-8 "Aktifkan mode gelap" 23x32`, `button.relative.flex "Notifikasi, 3 belum dibaca" 32x32`

### Target sentuh < 40px (sesudah: 63 halaman)

- **login** pada 10 konfigurasi: `input.h-4.w-4 272x20`, `input.h-4.w-4 312x20`, `input.h-4.w-4 342x20`
- **admin/orders** pada 10 konfigurasi: `input.h-5.w-5 "Pilih pesanan 71964" 20x20`, `input.h-5.w-5 "Pilih pesanan 71958" 20x20`, `input.h-5.w-5 "Pilih pesanan 71959" 20x20`
- **admin/refills** pada 12 konfigurasi: `input.h-5.w-5 "Pilih refill 315c0570-80bf-4b1a-ac84-62b807e3c1cb" 20x20`
- **admin/blog** pada 12 konfigurasi: `a "Tulis artikel" 115x38`, `a.block.max-w-[320px] "Artikel uji tampilan sel" 320x29`, `a "Tulis artikel" 117x38`
- **admin layanan + pilih baris** pada 10 konfigurasi: `input.mr-2.h-4 "Pilih layanan 1" 16x16`, `input.mr-2.h-4 "Pilih layanan 2" 16x16`, `input.mr-2.h-4 "Pilih layanan 3" 16x16`
- **deposit pending-ewallet** pada 3 konfigurasi: `a.font-medium.text-primary-accent "Hubungi support" 80x15`
- **deposit paid** pada 3 konfigurasi: `a.inline-block.pt-1 "Kembali ke Tambah Saldo" 127x20`
- **deposit pending-va** pada 2 konfigurasi: `a.font-medium.text-primary-accent "Hubungi support" 80x15`
- **dashboard + category dropdown** pada 1 konfigurasi: `input#_R_jinpfd6btbH1_.h-[34px].w-full 762x40`

### Atribut keyboard (inputmode / autocomplete / type) (sebelum: 180 halaman)

- **login** pada 12 konfigurasi: `input#_R_4t9av5ubtb_.w-full.rounded-xl: username without autocapitalize=none`
- **signup** pada 12 konfigurasi: `input#_R_4t9av5ubtb_.w-full.rounded-xl: username without autocapitalize=none`
- **forgot-password** pada 12 konfigurasi: `input#_R_2t9av5ubtb_.w-full.rounded-xl: email field is not type=email`
- **dashboard (Order Baru)** pada 12 konfigurasi: `input#_R_jinpfd6btb_.h-[34px].w-full: link field without autocapitalize=none`
- **dashboard + drawer** pada 12 konfigurasi: `input#_R_jinpfd6btb_.h-[34px].w-full: link field without autocapitalize=none`
- **dashboard + account menu** pada 12 konfigurasi: `input#_R_jinpfd6btb_.h-[34px].w-full: link field without autocapitalize=none`
- **dashboard + notifications** pada 12 konfigurasi: `input#_R_jinpfd6btb_.h-[34px].w-full: link field without autocapitalize=none`
- **dashboard + category dropdown** pada 12 konfigurasi: `input#_R_jinpfd6btb_.h-[34px].w-full: link field without autocapitalize=none`
- **pesanan (list)** pada 12 konfigurasi: `input.min-w-0.flex-1 "Cari pesanan berdasarkan ID, layanan, atau link": link field without autocapitalize=none`
- **refill** pada 12 konfigurasi: `input.min-w-0.flex-1 "Cari refill berdasarkan ID refill, ID pesanan, link, atau nama layanan": link field without autocapitalize=none`
- **admin/users** pada 12 konfigurasi: `input.min-w-0.flex-1 "Cari pengguna berdasarkan username atau email": email field is not type=email`
- **admin/orders** pada 12 konfigurasi: `input.min-w-0.flex-1 "Cari pesanan berdasarkan ID, link, pengguna, atau ID pesanan provider": link field without autocapitalize=none`
- **admin/refills** pada 12 konfigurasi: `input.min-w-0.flex-1 "Cari refill berdasarkan ID, pesanan, pengguna, atau link": link field without autocapitalize=none`
- **admin pengaturan/notifications** pada 12 konfigurasi: `input#_R_56av5uiv9iv5ubtb_.h-[34px].w-full: email field is not type=email`
- **admin pengaturan/operations** pada 12 konfigurasi: `input#_R_3bav5uiv9iv5ubtb_.h-[34px].w-full: password without autocomplete (current-password / new-password)`

## Minor

## Catatan membaca angka

- Angka "sebelum" diambil dengan pemeriksa versi awal; sesudah itu pemeriksa dipertajam untuk menghapus alarm palsu (menu terbuka yang memang menutupi pemicunya, isi `<details>` yang tertutup, item daftar di luar kotak scroll-nya, halaman yang tergulung di bawah header sticky, pasangan dialog/drawer dengan latar redupnya, kolom pencarian bukan field email/link). Sebagian penurunan "kontrol tertutup" dan "lapisan saling menimpa" berasal dari sini, bukan dari perbaikan kode.
- Overflow, input < 16px, dialog/drawer dan tap target memakai pemeriksa yang sama sebelum dan sesudah.
- Sisa "target sentuh < 40px" hampir seluruhnya checkbox pemilih baris tabel admin (16–20px) dan beberapa tautan inline; checkbox tidak bisa diberi area sentuh tambahan lewat CSS tanpa mengubah tampilan, jadi dibiarkan (kontrol sekunder, hanya admin).
- Sisa "kontrol tertutup" di iPad Mini adalah baris tabel paling bawah yang tertutup bilah aksi sticky ("Aksi layanan terpilih") sebelum digulir; ini perilaku bilah sticky, bukan bug.

## Tidak bisa diverifikasi tanpa perangkat asli

- Perilaku zoom iOS saat fokus input sebenarnya (WebKit di Playwright memakai mesin yang sama, tapi bukan iOS Safari dengan keyboard sistemnya).
- Tinggi keyboard virtual dan pergeseran viewport (`visualViewport`) saat keyboard iOS / Android terbuka.
- Bilah alamat Safari / Chrome yang menyusut saat scroll (`100dvh` vs tinggi sebenarnya), notch / Dynamic Island dan home indicator (`safe-area-inset-*`; di sini nilainya 0).
- Rubber-band scroll (overscroll) iOS, momentum scroll dan gestur geser-kembali tepi layar.
- Mode PWA / tambahkan ke layar utama, warna `theme-color` pada bilah status, dan tema gelap otomatis OS.
- Rendering font sistem, `backdrop-filter` pada GPU lama, dan performa nyata di ponsel kelas bawah.
- Pemilih berkas / kamera, menempel (paste) dari papan klip, dan pengelola kata sandi bawaan perangkat.

## Tangkapan layar

Sebelum dan sesudah (hanya halaman yang gagal): `C:\Users\Dikri Firmansyah\Downloads\mobile-qa-screens` — berkas `before-*.png` dan `after-*.png`.
