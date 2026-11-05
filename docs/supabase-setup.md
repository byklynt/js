# Supabase setup

JagoanSosmed runs on Supabase (Postgres + Auth + Storage + Realtime). This file is the checklist to get a project ready.

## 1. Create and link the project

> **Region:** the dev project is in `ap-northeast-2` (Seoul), which is fine for development. **Create the production project in Singapore (`ap-southeast-1`)**: it is the closest region to Indonesian users, and a project's region cannot be changed later (you would have to migrate). Keep the app's hosting region next to the database.

1. Create a project at supabase.com (a separate **dev** project and, later, a **production** project).
2. `npx supabase login`, then `npx supabase link --project-ref <ref>`.
3. Copy `.env.example` to `.env.local` and fill in:

| Variable | Where it comes from | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project settings → API | public |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`) | Project settings → API | public; either name works |
| `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) | Project settings → API | **server only**, bypasses RLS. Never `NEXT_PUBLIC_*` |
| `SUPABASE_DEV_PROJECT_REF` | the dev project ref | the DB integration tests refuse to run against any other project |
| `NEXT_PUBLIC_SITE_URL` | your site origin | used in e-mail links / OAuth redirects |
| `PROVIDER_KEY_ENC_KEY` | `openssl rand -base64 32` | encrypts provider API keys at rest. Keep it: losing it makes stored provider keys unreadable (re-run `npm run bootstrap` with `LIKEO_API_KEY`) |
| `CRON_SECRET` | any long random string | protects `/api/cron/*` |

`SUPABASE_DB_PASSWORD` is only needed in your terminal for CLI commands that connect to the database directly. Never write it to a file.

## 2. Migrations

```
npm run db:push        # applies supabase/migrations/* to the linked project
npm run db:types       # regenerates lib/supabase/database.types.ts
npm run db:lint        # supabase db lint
npm run db:test        # pgTAP tests (works without Docker, through `supabase db query`)
npm run test:db        # concurrency + server-flow tests against the DEV project (cleans up after itself)
npm run test:e2e       # browser e2e (run `npm run build` first)
npm run security:scan  # no secret value in the build output
npm run bootstrap      # default settings, rule texts, Likeo provider row (safe to re-run)
```

Rules: migrations are timestamped SQL files, committed. **Never edit a migration that is already pushed**: add a new one. Never run `db reset`, drop or truncate on a remote project.
With Docker installed you can also use a local stack: `npm run db:start`, `npm run db:reset` (local only), `npm run db:test:docker`.

## 3. Bootstrap and first admin

`npm run bootstrap` (after the migrations) creates the default settings (cancel policy 72 jam / 50%), the platform rule texts and the Likeo provider row; the Likeo key from `LIKEO_API_KEY` is stored encrypted. Exchange rate and markup start as "belum diatur": set them under Admin → Provider before the first catalogue sync.


```
npm run admin:create -- <username> <email>
```

The password is typed at a hidden prompt (or read from `ADMIN_CREATE_PASSWORD`); it is never printed or stored in a file. The script refuses to touch an account that is already an admin. Then sign in at `/admin/login` and enable two-step verification (required for the panel).

## 4. Settings to change in the Supabase dashboard (cannot be done from code)

- **Authentication → Providers → Email**: enable. Set **Confirm email** = ON for production (OFF is fine for dev). Set **Minimum password length = 8** (the app also enforces it).
- **Authentication → URL Configuration**: Site URL = your production origin. Add redirect URLs: `https://<your-domain>/auth/callback` and `http://localhost:3000/auth/callback`.
- **Authentication → Multi-Factor (MFA)**: make sure **TOTP** is enabled.
- **Authentication → Rate limits**: keep the defaults or tighten; the app adds its own limits in the `rate_limits` table.
- **Authentication → SMTP**: configure a real SMTP server before production. The built-in mailer is for testing only (very low hourly limit) and password-reset / confirmation e-mails depend on it.
- **Authentication → Providers → Google** (optional): create an OAuth client in Google Cloud, paste the client id / secret, then set `googleLogin: true` in `lib/features.ts`.
- **Authentication → Sessions**: session lifetime / inactivity timeout are set here. The "Ingat saya" checkbox decides how the browser keeps the cookies: unticked = browser-session cookies (gone when the browser closes), ticked = 30 days (the refresh-token lifetime configured here still applies on top).
- **Database → Backups**: enable daily backups; for production consider **Point-in-Time Recovery** (paid add-on).
- **Storage**: the buckets `avatars` (public) and `ticket-attachments` (private) are created by the migrations. Nothing to do; verify under Storage → Policies.

## 5. Scheduling the jobs

Three endpoints do the scheduled work. All of them require `Authorization: Bearer <CRON_SECRET>` (compared in constant time; 401 otherwise, 503 if `CRON_SECRET` is not set), run under a **lease** (`cron_leases`: two overlapping runs never both work; the second answers `202 skipped`, and a crashed run frees itself when the lease expires), and stop themselves before 50 s (the next tick continues). The secret is only ever sent in the header, never in a URL or a log line. **No Vercel Cron is used.**

| Endpoint | Schedule | What it does |
| --- | --- | --- |
| `POST /api/cron/sync-orders` | every 2 minutes | order status, automatic refunds, refill and cancel read-back, low-balance policy, provider alerts |
| `POST /api/cron/sanity` | daily 03:00 WIB | ledger vs balances, refund mismatches, stuck orders (`run_sanity_check`) |
| `POST /api/cron/stats-refresh` | every 30 minutes | provider balance refresh + housekeeping (expired rate-limit counters, sync runs older than 30 days). The dashboard and stats are live SQL aggregates, so there is no materialized view to refresh |

### Local (development)

```
npm run dev       # terminal 1
npm run dev:cron  # terminal 2: calls the endpoints on http://localhost:3000 every 2 minutes
```

`CRON_SECRET` comes from `.env.local`; `CRON_INTERVAL_SECONDS` (default 120) and `CRON_BASE_URL` (default `http://localhost:3000`; only localhost or HTTPS is accepted) are optional. One log line per call; Ctrl+C stops it cleanly.

### Production A (default): Supabase pg_cron + pg_net + Vault

Needs the app to have a **public HTTPS URL** (Supabase's servers call it). The secrets are stored in Supabase Vault and read at call time; they are not in the job text, in `cron.job`, or in a URL.

```
npm run cron:enable -- https://your-app.example            # dry run: prints the SQL with the secret redacted, sends nothing
npm run cron:enable -- https://your-app.example --confirm  # runs it against the LINKED project
npm run cron:disable -- --confirm                          # unschedules every jago-* job (add --purge to delete the Vault secrets too)
```

`cron:enable` is idempotent (Vault secrets are created or updated, jobs are upserted by name from `supabase/cron/enable-cron.sql`). It reads `CRON_SECRET` from `.env.local`, writes the generated SQL to a temporary owner-only file that is deleted right after, and never prints the secret. **Do not run it until the app is deployed and `CRON_SECRET` is set on the server too.**

Verify (SQL editor):

```sql
select jobid, jobname, schedule, active from cron.job where jobname like 'jago-%';
select j.jobname, d.status, d.return_message, d.start_time, d.end_time
  from cron.job_run_details d join cron.job j using (jobid)
 where j.jobname like 'jago-%' order by d.start_time desc limit 20;
-- pg_net is asynchronous: the HTTP result of each call
select id, status_code, left(content::text, 200) as body, error_msg, created
  from net._http_response order by created desc limit 20;
select name, locked_until, last_started, last_finished from public.cron_leases;   -- is a run in progress?
```

What failures look like: `cron.job_run_details.status = 'failed'` with "Cron belum dikonfigurasi" (the Vault secrets are missing: run `cron:enable` again); `net._http_response.status_code = 401` (the Vault `jago_cron_secret` differs from `CRON_SECRET` on the server), `503` (`CRON_SECRET` not set on the server), `202` (a previous run was still going: normal, harmless), timeouts or `error_msg` (the app is unreachable). The admin dashboard also shows "Sinkronisasi terakhir" per provider and a red **Sinkronisasi terhenti** chip after 10 minutes without a successful run.

Pause one job: `select cron.alter_job((select jobid from cron.job where jobname = 'jago-sync-orders'), active := false);` (use `true` to resume). Pause everything: `npm run cron:disable -- --confirm`.

### Production B: a plain crontab (VPS) or cron-job.org

HTTPS only, and the secret in the header, never in the URL.

```
# /etc/cron.d/jagoansosmed   (CRON_SECRET lives in a root-only file, e.g. /etc/jagoansosmed.cron.env containing CRON_SECRET=...)
*/2 * * * *  root  . /etc/jagoansosmed.cron.env && curl -fsS -m 60 -X POST -H "Authorization: Bearer $CRON_SECRET" https://your-app.example/api/cron/sync-orders   >/dev/null
0 20 * * *   root  . /etc/jagoansosmed.cron.env && curl -fsS -m 60 -X POST -H "Authorization: Bearer $CRON_SECRET" https://your-app.example/api/cron/sanity        >/dev/null
*/30 * * * * root  . /etc/jagoansosmed.cron.env && curl -fsS -m 60 -X POST -H "Authorization: Bearer $CRON_SECRET" https://your-app.example/api/cron/stats-refresh >/dev/null
```

cron-job.org: create three jobs with method POST, the URLs above (HTTPS), a custom request header `Authorization: Bearer <CRON_SECRET>`, timeout 60 s, schedule every 2 minutes / daily / every 30 minutes, and turn on failure notifications. Overlapping calls are safe (lease).

## 6. Admin sessions ("Cabut sesi")

Supabase cannot revoke a single other session of a user from the server. The panel therefore tracks admin sessions in `admin_sessions` and checks them on every admin request: a revoked session loses the panel at once, but its JWT only expires with the access-token lifetime (1 hour by default). Shorten the JWT expiry in Authentication → Sessions if that matters to you.

### Diagnosis sinkronisasi status pesanan

- `npm run provider:status -- <id pesanan>` (hanya baca): mencetak baris pesanan, jawaban mentah `status` dari provider, hasil parse, dan status internal hasil pemetaan.
- Kolom `orders.provider_status` (teks mentah terakhir dari provider) dan `orders.sync_error` (kesalahan terakhir, mis. penolakan saat add atau status tak dikenal) tampil di panel admin.
- Admin > Pesanan: indikator "Sinkronisasi terakhir" dan menu "Sinkronkan sekarang" per pesanan.
- Status tak dikenal dicatat (`sync.unknown_status`) dan pesanan tidak diubah.
- Sinkronisasi hanya berjalan bila ada penjadwal: `npm run dev:cron` (dev) atau pg_cron / crontab (produksi, lihat bagian 5). Tanpa penjadwal, pesanan live tidak pernah berubah status.

### Simulator provider (hanya dev, mode mock)

- `npm run dev:simulate -- <id pesanan> <partial|canceled|failed|completed|refill> [remains]` memaksa provider MOCK menjawab status itu untuk pesanan tersebut pada sinkronisasi berikutnya (`partial` wajib `remains`). `npm run dev:simulate -- --clear` menghapus semua.
- Menolak berjalan bila `NEXT_PUBLIC_SUPABASE_URL` tidak cocok dengan `SUPABASE_DEV_PROJECT_REF`, bila `PROVIDER_MODE` bukan `mock`, atau bila pesanan bukan pesanan mock (`MK-...`). Tidak ada UI dan tidak ada route.
- Cara kerja: CLI menulis `.mock-provider.json` (git-ignored, berlaku 6 jam); hanya adapter mock yang membacanya.
- Tes uang: `npm run test:db` menjalankan `refund-flows.test.ts` (21 skenario dengan saldo eksak); e2e `refund-sim.test.ts` menjalankan alur lewat browser.
- Aturan refund otomatis (migrasi 23): jumlah = yang masih terutang dikurangi refund yang sudah dibayar (termasuk refund manual), jadi tidak pernah dua kali. Provider "Failed" diperlakukan seperti "Canceled" (status `dibatalkan`, refund penuh). Sisa pesanan dari provider di luar 0..jumlah pesanan ditolak dan dicatat (`sync.invalid_remains`).

## Estimasi pengerjaan (terukur)

Setiap layanan mencatat berapa lama pesanan nyata selesai. Dari 3 pesanan selesai (batas bisa diubah di Admin > Pengaturan > Operasional), estimasi tampil di halaman Layanan dan form order; sebelum itu pengguna melihat "Belum ada estimasi".

- **Durasi** = `completed_at` - `provider_accepted_at` (atau `created_at` bila waktu diterima provider tidak ada). `completed_at` dicatat sekali, saat transisi pertama ke `selesai` di `applyState` (dipakai cron dan "Sinkronkan sekarang"); trigger database menjaganya tidak bergeser.
- **Ketelitian**: status disinkronkan tiap sekitar 2 menit, jadi durasi akurat dalam kisaran itu. Itu sebabnya angka ditampilkan dengan "±" dan dibulatkan ke menit (ke 5 menit mulai 1 jam).
- **Tidak dihitung**: pesanan partial, dibatalkan/gagal, dibatalkan karena pelanggaran, pesanan dengan `sync_error` sebelum selesai, status yang diubah manual oleh admin, sinkronisasi macet (sinkron berhasil terakhir lebih dari 3x interval, yaitu 6 menit, sebelum selesai), waktu selesai perkiraan (backfill), dan pesanan yang kemudian diajukan refill.
- **Statistik** (`service_completion_stats`): median, p25, p75 dari N pesanan terakhir (N = 20, bisa diubah) per layanan dan per ukuran jumlah (kecil <= 1.000, sedang <= 10.000, besar di atasnya). Median dipilih agar satu pesanan lambat tidak memengaruhi angka. Dihitung ulang di SQL saat pesanan selesai, saat refill diajukan, dan oleh cron `stats-refresh` untuk baris yang basi. Hanya agregat yang bisa dibaca pengguna.
- **Tampilan**: 3-4 sampel "± 7 menit"; 5 sampel atau lebih rentang p25-p75 ("5 - 12 menit"). Dari 5 sampel dan bila ukuran jumlah itu punya minimal 3 sampel, estimasi ukuran jumlah dipakai (form order mengikuti jumlah yang diketik).
- **Admin**: Admin > Layanan menampilkan jumlah sampel dan estimasi per layanan; estimasi manual (mis. "5 - 15 menit") tampil sampai data terukur mencapai batas minimum; "Reset statistik" melupakan data lama (dicatat di log audit).
- **Provider**: respons `services` Likeo hanya berisi `service, name, type, rate, min, max, dripfeed, refill, cancel, category`. Tidak ada kolom rata-rata waktu, jadi tidak ada fallback "Perkiraan penyedia". Kolom `services.avg_time` yang lama tetap kosong.
- **Alat**: `node scripts/estimate-screenshots.mjs --before <url> --after <url>` membandingkan screenshot halaman terkait antara build sebelum dan sesudah fitur.

## Tautan komunitas (Saluran WhatsApp, Saluran Telegram, Bot Telegram)

- Diatur admin di **Pengaturan Situs > Umum > Tautan Komunitas**; tersimpan di `site_settings.data.community`. Kosong = nonaktif.
- **Validasi** (`lib/community-links.ts`, dijalankan di server saat menyimpan dan sekali lagi saat dirender): hanya `https`, host harus persis `wa.me` / `whatsapp.com` / `chat.whatsapp.com` (WhatsApp) atau `t.me` / `telegram.me` (Telegram), tanpa nama pengguna/password (termasuk `https://t.me@evil.com`), tanpa port, tanpa spasi, dan harus berisi path ke saluran/bot. `javascript:`, `data:`, `http:` dan host mirip (`wa.me.evil.com`) ditolak dengan pesan berbahasa Indonesia.
- **Audit**: aksi `settings.community` menyimpan nilai lama dan baru.
- **Pembacaan sisi pengguna** (`lib/server/community.ts`): `use cache` dengan tag `community-links`, disegarkan paling lama tiap menit dan langsung saat admin menyimpan (`updateTag` setelah baris tersimpan).
- **Tampil**: grup sidebar "Tautan lainnya" (sebelum Pengaturan, seperti desain lama; tanpa Aplikasi Mobile), kolom "Komunitas" di footer landing, dan baris footer dasbor dan halaman hukum. Tiap tautan hanya muncul bila diisi, dibuka di tab baru dengan `rel="noopener noreferrer"`. Tidak ada `href="#"`: `lib/community-links.test.ts` gagal bila ada item menu tanpa href atau berhref `#`.
- **Alat**: `node scripts/community-screenshots.mjs --before <url> --after <url>` membandingkan screenshot (terang/gelap, desktop/mobile) sidebar, footer landing, dan pengaturan admin.
