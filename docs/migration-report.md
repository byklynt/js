# Migration report: dev store → Supabase

Branch `feat/supabase`. "Verified" means it was executed against the linked **DEV project** (ref in `SUPABASE_DEV_PROJECT_REF`), not only written.
Docker was not available, so everything was verified against that remote dev project; a local stack (`supabase start`) was never run (see Known limits).

## What is on Supabase now (verified)

| Area | State | Evidence |
| --- | --- | --- |
| Schema, 15 migrations (profiles, providers, catalogue, orders, ledger, refunds, requests, deposits, tickets, notifications, announcements, favorites, API keys, audit, settings, rate limits, admin sessions / backup codes, private helper schema) | applied | `supabase db push`, `db lint`: no schema errors |
| RLS on every table (default deny), column grants, storage buckets + policies | done | pgTAP `01_rls.test.sql`: 44 assertions |
| Money functions: `apply_ledger_entry`, `place_order`, `create_refund_for_order`, `approve_refund`, `reject_refund`, `credit_deposit`, `admin_adjust_balance`, `request_cancel`, `resubmit_failed_order`, `rate_limit_hit`, `verify_balances`, `run_sanity_check` (SECURITY DEFINER, service role only) | done | pgTAP `02_functions.test.sql`: 75 assertions |
| Concurrency / idempotency (real parallel connections, temp users, cleaned up): 2 orders can't overdraw, 5 orders vs balance for 3 → exactly 3, same link → one order, double webhook → one credit, double sync → one refund, refund cap | done | `npm run test:db` |
| Server flows with the real code (mock provider): catalogue (public fields only, search, categories, favorites filter), place order + submit, sync (partial → refund once), user cancel (age rule, 50%, admin approval), failed submit → full refund, payment webhook (signature, replay, wrong amount), tickets + private Storage attachments (signed URLs, internal notes hidden, cross-user access refused), notifications, announcements (audience / schedule / expiry), favorites, language | done | `npm run test:db` (19 tests total) |
| Auth: sign-up, login by **username** (generic error, no enumeration), logout, password reset pages, `/auth/callback`, blocked users rejected; Google OAuth wired behind `features.googleLogin` | done | e2e + live Auth checks |
| Admin MFA (Supabase TOTP, **AAL2 enforced** in `requireAdmin`), backup codes (own hashed table), admin session list/revoke, `npm run admin:create` | done | e2e: password alone does not open the panel, wrong code refused, right code opens it |
| Provider API key stored AES-256-GCM encrypted (`PROVIDER_KEY_ENC_KEY`), never returned to a client | done | bundle scan + e2e response scan |
| Realtime: bell + ticket badge refresh on `notifications` inserts (RLS-protected), polling kept as fallback | wired, publication verified | `supabase_realtime` contains `notifications`, `ticket_messages` |
| Admin panel: every page loads its own data with paginated / aggregated SQL (keyset pagination + "Muat lebih banyak", server-side search, `admin_dashboard`, `admin_stats_dataset`, `admin_services_page`, `admin_shell_stats`); all writes use queries / RPC | done | `npm run test:db` (pagination, search, aggregates) + smoke e2e of every admin and user route |
| Bootstrap (`npm run bootstrap`): settings (cancel 72 jam / 50%), 8 rule texts, Likeo row with encrypted key; rate and markup stored as "belum diatur" | applied to dev | |
| Dev store, `.data`, in-memory TOTP/2FA/sessions/rate limiter/notifier/ledger writer | **removed** | |

### Quality gates (last run)

- `npm test`: 142 unit tests pass (22 DB tests are skipped unless `npm run test:db`). `tsc`: 0 errors. `eslint`: 0 errors (68 warnings, mostly unused imports in tests). `next build`: OK.
- `npm run db:test` (pgTAP, no Docker needed): 121 assertions pass. `npm run test:db`: 22/22 (real database: money functions, concurrency, cron leases, catalogue, order flow, sync read-back of refill / cancel, tickets + Storage, lists / aggregates). `npm run test:e2e` (Chromium, `next start` with PROVIDER_MODE=mock, real dev DB): 18/18 = smoke of every admin and user route (3) + auth / roles / MFA / RLS (6) + user and admin journeys (9).
- Supabase advisors (security + performance, all levels): 0 warnings; the only INFO is "RLS enabled, no policy" on the 5 intentionally server-only tables.
- `npm run security:scan`: no secret value anywhere in `.next`, and no client file mentions the service-role key.
- EXPLAIN on 60,000 orders / ledger rows / notifications (rolled back): orders by user → `orders_user_created_idx` index scan; ledger by user → `balance_ledger_user_idx`; unread notifications → index-only scan on the partial index. Catalogue with 5,000 services: page / search / categories / sort ≈ 240–290 ms each **including** the round trip to ap-northeast-2. (At 5,000 rows Postgres still chooses a sequential scan for `ILIKE`; the trigram index is there for when the catalogue grows.)
- Test data: every test removes what it creates (rows, Storage objects, audit rows). The project was left with exactly the bootstrap rows (1 provider, 8 rules, 1 settings row) and 0 users.

## Scheduling, refill / cancel read-back, journeys (latest round)

| Area | State | Evidence |
| --- | --- | --- |
| `/api/cron/sync-orders`, `/api/cron/sanity`, `/api/cron/stats-refresh`: Bearer `CRON_SECRET` (constant time, 401 / 503), lease per job (`cron_leases`, atomic, self-expiring), max run time 50 s, batch limits | done | unit tests (Bearer, overlap, expiry) + DB concurrency test (6 parallel acquires -> 1 winner) + e2e (401 without the secret) |
| Local scheduler `npm run dev:cron` (every `CRON_INTERVAL_SECONDS`, default 120) | done | run by hand |
| Production A: pg_cron + pg_net + Vault (`supabase/cron/enable-cron.sql`, `npm run cron:enable -- <https-url>` / `cron:disable`) | **written and unit-tested (SQL generation, URL and escaping rules), NOT run against any project** | dry run prints the SQL with the secret redacted; `--confirm` is required to send. Needs your confirmation and a public HTTPS URL |
| Production B: crontab / cron-job.org (HTTPS, header only) | documented | `docs/supabase-setup.md` section 5 |
| Admin: "Sinkronisasi terakhir" per provider (last SUCCESSFUL run) and the red "Sinkronisasi terhenti" chip after 10 minutes without one | done | unit tests for `isSyncStalled` / `syncHealth` |
| Refill status read back from the provider (`refill_status`), forwarded cancellations read back (`cancel_requests.provider_state`), user notified, confirmed provider cancel refunds through the existing idempotent function | done, with the mock | adapter + mock tests, DB sync test; API assumptions listed in `lib/server/providers/README.md` (the standard API has no cancel-status call: it is derived from the order status) |
| UI journeys in the browser: signup, username login, "Ingat saya", order form (mock provider), ticket + attachment + reply, notification badge, language switcher, admin balance adjustment, admin refund approval, cross-user access, non-admin blocked, cron endpoints | done | `e2e/flows.test.ts` |
| MFA backup code: Indonesian explanation + explicit confirmation BEFORE the factor is removed; then back to the password step | done | e2e |
| "Ingat saya" works: unticked = browser-session cookies, ticked = 30 days | done | e2e reads the cookie lifetimes |

Real bugs found by these tests and fixed: the re-authentication for money actions signed out **every** session of the admin (global sign-out on the throw-away client); "Ingat saya" had no effect (the library's 400-day default stayed); `admin_services_page` ignored its filters for imported services (a stray `or true`); the refill status mapping lost a regex escape.

## Needs your action in the Supabase dashboard

See `docs/supabase-setup.md` §4 (confirm e-mail, URL configuration, SMTP, MFA/TOTP enabled, Google provider, JWT lifetime, backups) and §5 (schedule the cron: nothing calls `/api/cron/sync-orders` yet; no `vercel.json` was added).
Also: `NEXT_PUBLIC_SITE_URL` for production, a real `CRON_SECRET`, and run `npm run admin:create -- <username> <email>` once on each project.

## Known limits / TODO (not hidden)

1. The admin read snapshot (1,500 / 2,000 row windows) is **gone** (`lib/server/admin-snapshot.ts`, `getDb`, `withAdminDb`, `currentSnapshot` deleted). What remains is `lib/server/action-context.ts`: a small working copy used only by admin MUTATION handlers (settings and rules, providers, and the services when a handler edits the catalogue; no orders / users / lists), written back by real queries in `run()`. Known trade-offs of the new lists: the quick filters inside each list view still filter the rows that are loaded (the search box above each list searches the whole table in SQL); the user drawer loads its rows when it opens; the user list computes the "perlu ditinjau" flag only for the users on the page; the stats dataset aggregates the last 180 days in SQL (`stuck` per day is always 0, as before); the dashboard's provider/ledger "discrepancy" check no longer exists (it only compared against the mock provider).
2. Docker/local stack never ran: `db:start`, `db:reset`, `db:test:docker` and `seed:demo` (local-only, refuses non-local URLs) are untested. Migrations were proven by pushing to the dev project and by pgTAP there.
3. The CLI labels the linked project "production" (a Supabase default label). It was treated as the dev project as agreed; use a separate project for production.
4. The e2e does not drive the order/ticket UI forms (that behaviour is covered by the DB tests running the real server code, but not through the browser). Sign-up through the UI was not covered either (accounts were created with the service role): whether it lands on the dashboard or on "check your e-mail" depends on the **Confirm email** setting of the project.
5. Realtime push itself was not asserted in a browser (only that the tables are published and the hook is wired); polling is the fallback.
6. Payment gateway webhook signature is still the placeholder HMAC; nothing is sent by e-mail / Telegram by the app (only Supabase Auth e-mails exist). The refill / cancel read-back has only been exercised against the mock and fake HTTP responses: the real Likeo response shapes are assumptions (list in `lib/server/providers/README.md`).
7. "Ingat saya" is a cookie lifetime (session vs 30 days); the Supabase Auth session settings still apply on top. A backup code cannot raise a session to AAL2 in Supabase MFA, so using one **removes the TOTP factor** (and ends the session): the admin sees an explanation first, confirms, signs in again with the password, and is sent through `/admin/setup-2fa`. Admin session revoke is enforced by the panel; the JWT itself expires within its lifetime (1 h by default).
8. Audit logs of admin actions that are not money (settings, services, tickets) are written right after the action, not inside the same transaction (money actions are audited inside their Postgres function).
9. `lib/dev/demo-seed.ts` stays only as an in-memory fixture for unit tests; no app code imports it. `ADMIN_2FA_ENC_KEY` and `AUTH_SECRET` are no longer used.

10. The dev project is in `ap-northeast-2`; create the production project in **Singapore (`ap-southeast-1`)** (documented in `docs/supabase-setup.md`). The pg_cron jobs have not been enabled anywhere yet.
