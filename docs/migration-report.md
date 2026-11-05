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

- `npm test`: 106 unit tests pass (20 DB tests skipped unless `npm run test:db`). `tsc`: 0 errors. `eslint`: 0 errors (68 warnings, mostly unused imports in tests). `next build`: OK.
- `npm run db:test` (pgTAP, no Docker needed): 119 assertions pass. `npm run test:db`: 20/20. `npm run test:e2e` (Chromium, `next start`, real DB): 9/9, including the smoke test of every admin and user route (empty database, then with data) that fails on any crash text, error overlay, console error, failed request or HTTP >= 400.
- Supabase advisors (security + performance, all levels): 0 warnings; the only INFO is "RLS enabled, no policy" on the 5 intentionally server-only tables.
- `npm run security:scan`: no secret value anywhere in `.next`, and no client file mentions the service-role key.
- EXPLAIN on 60,000 orders / ledger rows / notifications (rolled back): orders by user → `orders_user_created_idx` index scan; ledger by user → `balance_ledger_user_idx`; unread notifications → index-only scan on the partial index. Catalogue with 5,000 services: page / search / categories / sort ≈ 240–290 ms each **including** the round trip to ap-northeast-2. (At 5,000 rows Postgres still chooses a sequential scan for `ILIKE`; the trigram index is there for when the catalogue grows.)
- Test data: every test removes what it creates (rows, Storage objects, audit rows). The project was left with exactly the bootstrap rows (1 provider, 8 rules, 1 settings row) and 0 users.

## Needs your action in the Supabase dashboard

See `docs/supabase-setup.md` §4 (confirm e-mail, URL configuration, SMTP, MFA/TOTP enabled, Google provider, JWT lifetime, backups) and §5 (schedule the cron: nothing calls `/api/cron/sync-orders` yet; no `vercel.json` was added).
Also: `NEXT_PUBLIC_SITE_URL` for production, a real `CRON_SECRET`, and run `npm run admin:create -- <username> <email>` once on each project.

## Known limits / TODO (not hidden)

1. The admin read snapshot (1,500 / 2,000 row windows) is **gone** (`lib/server/admin-snapshot.ts`, `getDb`, `withAdminDb`, `currentSnapshot` deleted). What remains is `lib/server/action-context.ts`: a small working copy used only by admin MUTATION handlers (settings and rules, providers, and the services when a handler edits the catalogue; no orders / users / lists), written back by real queries in `run()`. Known trade-offs of the new lists: the quick filters inside each list view still filter the rows that are loaded (the search box above each list searches the whole table in SQL); the user drawer loads its rows when it opens; the user list computes the "perlu ditinjau" flag only for the users on the page; the stats dataset aggregates the last 180 days in SQL (`stuck` per day is always 0, as before); the dashboard's provider/ledger "discrepancy" check no longer exists (it only compared against the mock provider).
2. Docker/local stack never ran: `db:start`, `db:reset`, `db:test:docker` and `seed:demo` (local-only, refuses non-local URLs) are untested. Migrations were proven by pushing to the dev project and by pgTAP there.
3. The CLI labels the linked project "production" (a Supabase default label). It was treated as the dev project as agreed; use a separate project for production.
4. The e2e does not drive the order/ticket UI forms (that behaviour is covered by the DB tests running the real server code, but not through the browser). Sign-up through the UI was not covered either (accounts were created with the service role): whether it lands on the dashboard or on "check your e-mail" depends on the **Confirm email** setting of the project.
5. Realtime push itself was not asserted in a browser (only that the tables are published and the hook is wired); polling is the fallback.
6. Payment gateway webhook signature is still the placeholder HMAC; nothing is sent by e-mail / Telegram by the app (only Supabase Auth e-mails exist); provider refill status is not read back.
7. "Ingat saya" no longer changes the session lifetime (Supabase Auth settings decide). A backup code cannot raise a session to AAL2 in Supabase MFA, so using one **removes the TOTP factor** and sends the admin through `/admin/setup-2fa` again. Admin session revoke is enforced by the panel; the JWT itself expires within its lifetime (1 h by default).
8. Audit logs of admin actions that are not money (settings, services, tickets) are written right after the action, not inside the same transaction (money actions are audited inside their Postgres function).
9. `lib/dev/demo-seed.ts` stays only as an in-memory fixture for unit tests; no app code imports it. `ADMIN_2FA_ENC_KEY` and `AUTH_SECRET` are no longer used.
