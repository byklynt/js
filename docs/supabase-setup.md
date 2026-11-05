# Supabase setup

JagoanSosmed runs on Supabase (Postgres + Auth + Storage + Realtime). This file is the checklist to get a project ready.

## 1. Create and link the project

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
| `PROVIDER_KEY_ENC_KEY` | `openssl rand -base64 32` | encrypts provider API keys at rest |
| `CRON_SECRET` | any long random string | protects `/api/cron/*` |

`SUPABASE_DB_PASSWORD` is only needed in your terminal for CLI commands that connect to the database directly. Never write it to a file.

## 2. Migrations

```
npm run db:push        # applies supabase/migrations/* to the linked project
npm run db:types       # regenerates lib/supabase/database.types.ts
npm run db:lint        # supabase db lint
npm run db:test        # pgTAP tests (works without Docker, through `supabase db query`)
npm run test:db        # concurrency / idempotency tests against the DEV project
```

Rules: migrations are timestamped SQL files, committed. **Never edit a migration that is already pushed**: add a new one. Never run `db reset`, drop or truncate on a remote project.
With Docker installed you can also use a local stack: `npm run db:start`, `npm run db:reset` (local only), `npm run db:test:docker`.

## 3. First admin

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
- **Authentication → Sessions**: session lifetime / inactivity timeout are set here. The "Ingat saya" checkbox does not change the cookie lifetime.
- **Database → Backups**: enable daily backups; for production consider **Point-in-Time Recovery** (paid add-on).
- **Storage**: the buckets `avatars` (public) and `ticket-attachments` (private) are created by the migrations. Nothing to do; verify under Storage → Policies.

## 5. Cron

`/api/cron/sync-orders` syncs provider order statuses (every 2 minutes) and must be called with `Authorization: Bearer $CRON_SECRET`.

- **Vercel Cron**: add to `vercel.json`: `{ "crons": [{ "path": "/api/cron/sync-orders", "schedule": "*/2 * * * *" }] }` and set `CRON_SECRET` in the Vercel project (Vercel sends it as the bearer token).
- **pg_cron + pg_net** (alternative): enable both extensions, then
  `select cron.schedule('sync-orders', '*/2 * * * *', $$ select net.http_get('https://<your-domain>/api/cron/sync-orders', headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')) $$);`
  Keep the secret out of version control (set it in the SQL editor, not in a migration).

The daily sanity check is `select public.run_sanity_check();` (ledger sum vs balances, refund mismatches, stuck orders).

## 6. Admin sessions ("Cabut sesi")

Supabase cannot revoke a single other session of a user from the server. The panel therefore tracks admin sessions in `admin_sessions` and checks them on every admin request: a revoked session loses the panel at once, but its JWT only expires with the access-token lifetime (1 hour by default). Shorten the JWT expiry in Authentication → Sessions if that matters to you.
