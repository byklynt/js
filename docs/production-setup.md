# Production setup (checklist bertahap)

Dokumen ini adalah urutan kerja untuk membawa JagoanSosmed ke production. **Tidak ada langkah di sini yang dijalankan otomatis**; semuanya kamu jalankan sendiri, di terminalmu, dengan sengaja.

Aturan yang berlaku di seluruh dokumen:

- **Secret production hanya hidup di session terminal dan di hosting.** Jangan tulis ke `.env.local`, jangan commit, jangan tempel ke chat. Semua skrip production di bawah **tidak membaca `.env.local`**, supaya secret DEV tidak pernah bocor ke production.
- **Jangan pernah memakai ulang secret DEV.** Semua secret production dibuat baru (langkah 2).
- Semua perintah memakai `REF` = *project ref* production (20 huruf kecil, mis. `abcdefghijklmnopqrst`). Ketik **tanpa tanda kurung**.
- Skrip tes, simulator, cleanup dan screenshot **hanya bisa berjalan terhadap project DEV** (`SUPABASE_DEV_PROJECT_REF`). Skrip production butuh `REF` dan menolak project DEV.
- Migrasi hanya maju (forward-only). Tidak ada `db reset` atau perintah destruktif untuk production.

## 0. Persiapan

1. Buat project Supabase **production** di region yang dekat pengguna (disarankan Singapore, `ap-southeast-1`; DEV memakai ap-northeast-2). Simpan **database password** di password manager.
2. Login CLI: `npx supabase login` (atau set `SUPABASE_ACCESS_TOKEN` di session saja).
3. Pastikan `SUPABASE_DEV_PROJECT_REF` terisi (di `.env.local`); skrip memakainya untuk menolak DEV.
4. Siapkan satu jendela terminal khusus production. Semua variabel di bawah di-set **di jendela itu** dan hilang saat ditutup.

Mengisi variabel session tanpa menaruhnya di riwayat perintah:

```powershell
# PowerShell
$env:SUPABASE_DB_PASSWORD = Read-Host 'Password database production'
$env:SUPABASE_SECRET_KEY  = Read-Host 'Secret key (service role) production'
$env:NEXT_PUBLIC_SUPABASE_URL = 'https://REF.supabase.co'      # ganti REF
$env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = Read-Host 'Publishable key production'
```

```bash
# bash / zsh
read -rs SUPABASE_DB_PASSWORD && export SUPABASE_DB_PASSWORD
read -rs SUPABASE_SECRET_KEY && export SUPABASE_SECRET_KEY
export NEXT_PUBLIC_SUPABASE_URL="https://REF.supabase.co"      # ganti REF
read -rs NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

## 1. Migrasi database

```bash
npm run db:push:prod -- REF
```

Skrip ini:

1. menolak ref yang salah ketik, ref yang sama dengan project DEV, dan password yang tidak ada di session;
2. menampilkan **nama, ref dan region** project target;
3. menautkan salinan sementara folder `supabase/` ke project itu (link DEV di repo ini tidak berubah);
4. memastikan tautan sementara tepat ke ref yang diketik, lalu menjalankan `db push --dry-run --remote=REF` (CLI v3 memilih stack LOKAL kalau `--remote` tidak ada). Jika keluaran CLI menyebut "local stack", ref lain, atau baris `Target:` tidak terbaca, skrip **berhenti** sebelum menerapkan apa pun;
5. menampilkan **daftar migrasi yang tertunda**;
6. baru menerapkan setelah kamu **mengetik ulang ref** project. Salah ketik = batal, tidak ada yang diterapkan.

Tambahkan `--dry-run` untuk berhenti setelah langkah 5. Periksa bahwa region dan nama project adalah yang kamu maksud sebelum mengetik konfirmasi.

Setelah selesai, pastikan semua migrasi terpasang (Dashboard → Database → Migrations) dan jalankan langkah 3.

## 2. Buat secret production BARU

Jalankan di terminal, salin hasilnya langsung ke password manager dan ke hosting. Jangan simpan ke file.

| Secret | Fungsi | Satu baris untuk membuatnya |
| --- | --- | --- |
| `CRON_SECRET` | melindungi `/api/cron/*` (Bearer) | `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
| `PROVIDER_KEY_ENC_KEY` | mengenkripsi API key provider di tabel `providers` (AES-256-GCM, 32 byte base64) | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `PAYMENT_WEBHOOK_SECRET` | tanda tangan webhook pembayaran (isi **hanya** saat payment gateway diaktifkan) | `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
| `ADMIN_2FA_ENC_KEY` | **tidak dipakai lagi.** 2FA admin memakai Supabase MFA (TOTP). | Tidak perlu dibuat. Cek sendiri: `git grep -n "ADMIN_2FA_ENC_KEY" -- lib app scripts` hanya menemukan definisi `getEncKey()`; semua pemanggil `encryptSecret`/`decryptSecret` memakai `PROVIDER_KEY_ENC_KEY` secara eksplisit. Jangan diisi di production kecuali kode baru memerlukannya; kalau perlu, buat baru dengan perintah `PROVIDER_KEY_ENC_KEY` di atas. |

Tips (PowerShell): tambahkan `| Set-Clipboard` di ujung perintah agar hasilnya tidak tampil di layar.

**Catatan penting:** kalau `PROVIDER_KEY_ENC_KEY` hilang atau berubah, API key provider yang tersimpan tidak bisa didekripsi lagi (jalankan ulang `bootstrap` dengan key baru). Simpan cadangannya di password manager.

## 3. Verifikasi hasil migrasi (hanya baca)

```bash
npm run prod:verify -- REF
```

Butuh di session: `NEXT_PUBLIC_SUPABASE_URL` (persis `https://REF.supabase.co`), `SUPABASE_SECRET_KEY`, dan (disarankan) `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` untuk probe anon. Tidak membaca file dan tidak menulis apa pun. Tabel hasil memeriksa:

- semua tabel `public` memakai RLS, dan **role anon tidak punya akses ke tabel/view mana pun** (juga diuji lewat REST dengan kunci anon);
- tidak ada policy untuk `anon`/`public`;
- batasan uang ada: `balance_ledger_idempotent` (unik `type, ref_type, ref_id`), `balance_ledger_math`, trigger append-only ledger, `orders_refund_le_charge`, `refunds_one_per_reason_idx`, saldo tidak negatif, indeks permintaan refill/batal terbuka;
- tabel `cron_leases` dan `rate_limits` ada;
- bucket `ticket-attachments` **privat**, `avatars` ada, tidak ada bucket publik lain;
- Realtime aktif untuk `notifications` dan `ticket_messages`;
- **tidak ada baris uji/demo**: akun `@jagoansosmed-test.invalid`, layanan `ZT-`, pesanan `MK-` (pesanan mock), dll.

Semua baris harus **LULUS**. Exit code 1 bila ada yang gagal. Ulangi setelah setiap perubahan besar.

## 4. Storage dan Realtime

Dibuat oleh migrasi; yang perlu kamu pastikan:

- **Storage**: Dashboard → Storage: `ticket-attachments` bertanda *Private*, `avatars` *Public*. Policy (SQL editor):
  ```sql
  select policyname, cmd, roles from pg_policies where schemaname = 'storage' and tablename = 'objects' order by policyname;
  ```
  Harus ada policy baca/tulis per folder pengguna untuk `avatars` dan `ticket-attachments`. `prod:verify` memeriksa status privat/publik bucket.
- **Realtime** untuk lonceng notifikasi dan balasan tiket:
  ```sql
  select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public';
  ```
  Harus berisi `notifications` dan `ticket_messages`. Bila belum:
  ```sql
  alter publication supabase_realtime add table public.notifications, public.ticket_messages;
  ```

## 5. Pengaturan Auth

Semua bisa diatur di **Dashboard → Authentication**, atau lewat Management API (butuh `SUPABASE_ACCESS_TOKEN` di session). Contoh API (ganti nilai; nama field mengikuti Management API Supabase, kalau ada yang ditolak, atur lewat dashboard):

```bash
curl -X PATCH "https://api.supabase.com/v1/projects/REF/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{
    "site_url": "https://app.contoh.id",
    "uri_allow_list": "https://app.contoh.id/auth/callback",
    "mailer_autoconfirm": false,
    "password_min_length": 8,
    "password_hibp_enabled": true,
    "mfa_totp_enroll_enabled": true,
    "mfa_totp_verify_enabled": true,
    "smtp_host": "smtp.contoh.id", "smtp_port": "587", "smtp_user": "apikey",
    "smtp_pass": "<rahasia-smtp>", "smtp_admin_email": "no-reply@contoh.id", "smtp_sender_name": "JagoanSosmed",
    "rate_limit_email_sent": 30, "rate_limit_sign_in_sign_ups": 30, "rate_limit_otp": 30, "rate_limit_verify": 30
  }'
```

Checklist (Dashboard):

- [ ] **URL Configuration**: Site URL = origin production (HTTPS). Redirect URLs: `https://DOMAIN/auth/callback` (dipakai konfirmasi email, reset password, Google). Hapus `http://localhost:*` di production.
- [ ] **Providers → Email**: aktif; **Confirm email = ON**.
- [ ] **SMTP khusus** (Authentication → SMTP Settings): isi server sendiri. Mailer bawaan Supabase hanya untuk uji dan sangat terbatas; tanpa SMTP, konfirmasi dan reset password gagal.
- [ ] **Password**: panjang minimum **8** (sama dengan validasi aplikasi; naikkan keduanya bila mau lebih ketat) dan **Leaked password protection** (HIBP) **ON** (butuh paket Pro).
- [ ] **Multi-Factor**: **TOTP** *enroll* dan *verify* aktif (dipakai admin).
- [ ] **Rate limits**: sesuaikan batas email terkirim, sign-in/sign-up, OTP, dan verifikasi. Aplikasi menambah batasnya sendiri (tabel `rate_limits`: pendaftaran per IP, login per IP dan username).
- [ ] **Sessions**: masa berlaku sesi sesuai kebutuhan ("Ingat saya" = cookie 30 hari).
- [ ] **Providers → Google**: biarkan nonaktif sampai `features.googleLogin` dinyalakan.

## 6. Environment variable di hosting

Atur di platform hosting **sebelum build** (`NEXT_PUBLIC_*` ikut tertanam saat build).

| Variabel | Rahasia? | Nilai |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | tidak | `https://REF.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | tidak (publik by design) | publishable key production |
| `SUPABASE_SECRET_KEY` | **YA** (melewati RLS, hanya server) | secret key / service role production |
| `NEXT_PUBLIC_SITE_URL` | tidak | origin production, mis. `https://app.contoh.id` |
| `CRON_SECRET` | **YA** | dari langkah 2 |
| `PROVIDER_KEY_ENC_KEY` | **YA** | dari langkah 2 |
| `PROVIDER_MODE` | tidak | `live` |
| `PROVIDER_LIVE_APPROVED_REF` | tidak (tetapi menentukan) | **`REF` production**. Tanpa ini aplikasi **tidak pernah** memanggil provider asli: build production di project yang belum disetujui berstatus *off* (tidak ada data palsu, tidak ada belanja). |
| `PROVIDER_CUSTOM_COMMENTS` | tidak | **`1`** untuk membuka pesanan Custom Comments ke provider asli. Format `comments` (dipisah baris baru, tanpa `quantity`) sudah **terverifikasi** di Likeo pada 2026-11-06 dengan satu order nyata (10 komentar, status Completed). Boleh diaktifkan di production bersama `PROVIDER_MODE=live` dan `PROVIDER_LIVE_APPROVED_REF` = ref production. Tanpa ini layanan Custom Comments tampil "Belum tersedia untuk dipesan". Belum terverifikasi: wajib unik atau tidak, batas panjang, order sangat besar, cancel/refill untuk layanan ini. |
| `LIKEO_API_URL` | tidak | `https://likeo.net/api/v2` (atau sesuai akunmu) |
| `LIKEO_API_KEY` | **YA** | hanya perlu untuk `bootstrap` (langkah 8); setelah itu kunci tersimpan terenkripsi di database. Boleh dikosongkan di hosting. |
| `PAYMENT_WEBHOOK_SECRET` | **YA** | hanya saat payment gateway aktif |

**Jangan** diatur di hosting: `SUPABASE_DB_PASSWORD`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY` (duplikat; pakai satu nama), `SUPABASE_DEV_PROJECT_REF`, `ADMIN_CREATE_PASSWORD`, `RUN_DB_TESTS`, `RUN_E2E`, `CRON_BASE_URL`, `CRON_INTERVAL_SECONDS`, `ADMIN_2FA_ENC_KEY`.

## 7. Deploy aplikasi

Build dan deploy dari branch yang sudah lulus `typecheck`, `lint`, tes dan `next build`. Setelah deploy pertama, buka `https://DOMAIN/login` dan `https://DOMAIN/status` (harus tampil tanpa error). Di **/admin/providers** pastikan mode tertulis **live** (bukan mock/off); bila ada peringatan soal `PROVIDER_LIVE_APPROVED_REF`, perbaiki di hosting.

## 8. Bootstrap data awal (provider dan pengaturan)

Di jendela terminal production (variabel session dari langkah 0, ditambah):

```powershell
$env:PROVIDER_KEY_ENC_KEY = Read-Host 'PROVIDER_KEY_ENC_KEY production'
$env:LIKEO_API_KEY = Read-Host 'API key Likeo'
$env:LIKEO_API_URL = 'https://likeo.net/api/v2'
npm run bootstrap -- --project-ref REF
```

Membuat (tanpa menimpa yang sudah ada): `site_settings`, `service_rules`, dan baris provider Likeo dengan kunci **terenkripsi**. Mode production tidak membaca `.env.local` dan tidak pernah membuat provider mock.

## 9. Admin pertama

Masih di jendela yang sama:

```bash
npm run admin:create -- NAMAADMIN email@contoh.id --project-ref REF
```

Password diketik di prompt tersembunyi (minimal 12 karakter), tidak dicetak, tidak disimpan. (Alternatif: `ADMIN_CREATE_PASSWORD` di session saja.) Lalu masuk di `https://DOMAIN/admin/login`, **aktifkan verifikasi dua langkah** (wajib untuk admin) dan simpan kode cadangan.

Di panel admin sebelum membuka pendaftaran: **Provider** (uji koneksi, segarkan saldo), **kurs dan markup**, **sinkron layanan dari provider**, **metode pembayaran**, **tautan komunitas**, dan alamat kontak di `lib/site-config.ts`.

## 10. Aktifkan penjadwal (pg_cron)

Aktifkan ekstensi `pg_cron` dan `pg_net` (Dashboard → Database → Extensions). Lalu, dengan `CRON_SECRET` yang **sama** dengan di hosting dan `SUPABASE_DB_PASSWORD` di session:

```bash
npm run cron:enable -- https://DOMAIN --project-ref REF            # dry run: SQL dicetak, secret disamarkan
npm run cron:enable -- https://DOMAIN --project-ref REF --confirm  # menjalankan ke project production
```

Periksa (SQL editor): `select jobname, schedule, active from cron.job;` dan setelah beberapa menit `select status, start_time from cron.job_run_details order by start_time desc limit 5;`. Dasbor admin menampilkan "Sinkronisasi terakhir" yang segar. Menghentikan: `npm run cron:disable -- --project-ref REF --confirm` (tambah `--purge` untuk menghapus secret dari Vault). Alternatif tanpa pg_cron: crontab atau cron-job.org (lihat `docs/supabase-setup.md` bagian 5).

## 11. Backup dan PITR

- Dashboard → **Database → Backups**: pastikan backup harian aktif (paket berbayar). Untuk keuangan, aktifkan **Point-in-Time Recovery** (add-on berbayar).
- Uji pemulihan sekali ke project sementara (restore dari backup) sebelum peluncuran.
- Cadangan logis manual (password dari session): `npx supabase db dump --db-url "postgresql://postgres.REF:$SUPABASE_DB_PASSWORD@<host-pooler>:5432/postgres" -f cadangan.sql` (host pooler ada di Dashboard → Connect). Simpan file di tempat terenkripsi, jangan di repo.
- Ledger bersifat append-only dan tidak boleh diedit manual; koreksi lewat penyesuaian saldo admin.

## 12. Smoke test setelah deploy

Urutan singkat; semuanya harus berhasil.

1. `npm run prod:verify -- REF` → semua **LULUS**.
2. Penjadwal terlindungi: tanpa token harus 401, dengan token 200.
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" -X POST https://DOMAIN/api/cron/sync-orders
   curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Authorization: Bearer $CRON_SECRET" https://DOMAIN/api/cron/sync-orders
   ```
3. Halaman publik: `/`, `/services`, `/syarat-ketentuan`, `/kebijakan-refund`, `/kebijakan-privasi`, `/status` tampil; footer berisi tautan hukum.
4. Daftar akun uji dengan email asli → email konfirmasi tiba (SMTP) → masuk → dasbor tampil. Cek bahwa `profiles.terms_version` terisi.
5. Admin: masuk dengan TOTP, buka Dasbor, Provider (saldo nyata, mode **live**), Layanan, Pesanan.
6. Satu pesanan kecil sungguhan (layanan termurah, jumlah minimum): saldo terpotong sekali, `provider_order_id` terisi (bukan `MK-...`), status berubah lewat sinkronisasi dalam beberapa menit, "Sinkronisasi terakhir" di Pesanan terisi.
7. Pembatalan/refund: pantau satu refund (otomatis atau manual) dan pastikan baris Mutasi Saldo benar.
8. Notifikasi realtime: balas satu tiket dari admin; lonceng pengguna menyala tanpa memuat ulang.
9. Setelah selesai, bersihkan akun dan pesanan uji lewat panel admin (jangan hapus ledger), lalu jalankan lagi `npm run prod:verify -- REF` dan periksa baris "tidak ada baris uji / demo" (akun uji dengan domain asli tidak terdeteksi otomatis: pastikan sendiri).
