# Migration report: dev store → Supabase

Branch `feat/supabase`. Status is updated at the end of every step. "Verified" means it was executed against the linked DEV project (ref in `SUPABASE_DEV_PROJECT_REF`), not just written.

## Real (on Supabase, verified)

| Area | State | How it was verified |
| --- | --- | --- |
| Schema (profiles, providers, categories, services, rules, orders, ledger, refunds, requests, deposits, tickets, notifications, announcements, favorites, api keys, audit, settings, rate limits, ...) | Migrations 1–9 applied to the dev project | `db push`, `db lint` = no schema errors |
| RLS on every table, column-level grants, storage buckets/policies | Done | `supabase/tests/database/01_rls.test.sql`: 44 assertions pass |
| Money functions: `apply_ledger_entry`, `place_order`, `create_refund_for_order`, `approve_refund`, `reject_refund`, `credit_deposit`, `admin_adjust_balance`, `rate_limit_hit`, `run_sanity_check` | Done, service-role only | `02_functions.test.sql`: 75 assertions pass |
| Concurrency / idempotency: two orders cannot overdraw, 5 parallel orders vs balance for 3 → exactly 3, same link → one order, double webhook → one credit, double sync → one refund, refund cap | Done | `npm run test:db` (7 tests, real parallel connections, temp users, cleaned up) |
| Auth: sign-up, username/email login (generic error), logout, password reset, `/auth/callback`, blocked users rejected | Done | live checks (see below) |
| Admin MFA (Supabase TOTP, AAL2 enforced in `requireAdmin`), backup codes (own hashed table), admin session list/revoke | Done | live check against Auth: wrong code rejected, right code → aal2, fresh login → aal1/next aal2 |
| Rate limits (login, sign-up, reset, 2FA, orders) | In Postgres (`rate_limits`) | pgTAP + concurrency tests |
| First admin | `npm run admin:create` | script written; run it once on your side |

## Still on the old dev store (NOT yet migrated)

These still read/write `lib/admin-db.ts` / `.data/dev-store.json` and therefore **do not work for Supabase accounts yet**: ordering and order history, services catalogue, providers + sync cron, refunds/deposits/webhook, tickets, notifications, announcements, favorites, admin pages and stats, settings. They are steps 4–7 of the plan. Until they are ported, signed-in Supabase users see empty data and cannot order.

## Needs your action in the Supabase dashboard

See `docs/supabase-setup.md` §4 (email confirmation, URL configuration, SMTP, Google provider, MFA, JWT lifetime, backups) and §5 (cron).

## Known limits / TODO

- "Ingat saya" no longer changes the session lifetime (governed by Supabase Auth settings).
- A backup code cannot raise a session to AAL2 in Supabase MFA, so using one **removes the TOTP factor** and sends the admin through `/admin/setup-2fa` again.
- Admin session revoke is enforced by the panel (see setup doc §6), not by Auth.
- Payment gateway webhook signature verification is still the placeholder HMAC.
- No e-mail is sent by the app itself (notifications by e-mail/Telegram); only Supabase Auth e-mails exist.
- `supabase test db` needs Docker; `npm run db:test` runs the same pgTAP files through `supabase db query` without Docker.
