# lib/server - order, refund and balance logic

Everything that moves money runs in **Postgres functions** (`supabase/migrations`, SECURITY DEFINER, service role only). The UI and
server actions never change a balance directly; TypeScript here orchestrates (validation, provider calls) and reads.

| Area | Where it lives |
| --- | --- |
| Balance, ledger (append-only, idempotent per `(type, ref_type, ref_id)`) | `apply_ledger_entry` |
| Place order (validate, rules version, duplicate link, rate limit, debit, insert) | `place_order`, then `orders.ts` submits to the provider AFTER commit |
| Refunds (auto, partial, gagal_kirim, user cancel, manual; capped at charge) | `create_refund_for_order`, `approve_refund`, `reject_refund` |
| Deposits + bonus tiers, webhook idempotency | `credit_deposit` (UNIQUE `external_id`), `deposits.ts` |
| Admin balance adjustment (+ audit in the same transaction) | `admin_adjust_balance` |
| User cancel request, resubmit a failed order | `request_cancel`, `resubmit_failed_order` |
| Sanity job | `verify_balances`, `run_sanity_check` |
| Rate limiting | `rate_limit_hit` (table `rate_limits`) |

TypeScript modules: `orders.ts` (place + submit with 3 attempts), `sync.ts` (cron tick, idempotent refunds), `refunds.ts`, `requests.ts`,
`deposits.ts`, `tickets.ts` (+ Storage), `services.ts` (catalogue via SQL), `rules.ts` (pure rules), `providers/*` (Likeo adapter; the API key is
stored AES-256-GCM encrypted in `providers.api_key_encrypted`), `repo/*` (Supabase queries), `admin-snapshot.ts` (admin read side).

Tests: `supabase/tests/database` (pgTAP, `npm run db:test`), `__tests__/db-*.test.ts` (real database, `npm run test:db`), the rest are pure unit tests (`npm test`).

Not on Supabase yet / placeholders: payment gateway signature (placeholder HMAC), e-mail/Telegram delivery of alerts, provider refill status read-back.
