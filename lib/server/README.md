# lib/server — order, refund and balance logic

Everything that moves money lives here. The UI never changes a balance directly.

**Status:** runs on the in-memory mock store (`lib/admin-db.ts`). `schema.sql` is the Postgres version of the same rules (one function = one transaction). Provider keys are only read in `provider-client.ts` and never returned to the client.

## Files

| File | Job |
| --- | --- |
| `rules.ts` | Pure rules: provider status mapping, refund math, stuck detection, cancel/refill eligibility, bonus tier |
| `tx.ts` | `withTransaction` (snapshot + in-place rollback) and `ServiceError` |
| `ledger.ts` | `applyLedgerEntry` (the only balance writer) and `reconcileBalances` |
| `refunds.ts` | `autoRefundForOrder`, `createManualRefund`, `approveRefund`, `rejectRefund`, mismatch check |
| `orders.ts` | `placeOrder`, `submitToProvider` (3 tries, backoff), `resubmitFailedOrder` |
| `sync.ts` | `syncOrders` (cron tick), provider failure alert, low-balance auto-disable, stuck orders |
| `requests.ts` | User cancel and refill requests |
| `deposits.ts` | `creditDeposit` (shared by webhook and admin confirm), webhook handler |
| `metrics.ts` | Dashboard numbers: profit, sync health, reconciliation, sanity job |
| `provider-client.ts` | Provider API boundary (mock today) |

## Order lifecycle

1. **Place** (`placeOrder`): validate service, min/max, link, balance. In one transaction: debit the ledger (`type=order`, `ref=order id`) and create the order as `menunggu`. Not enough balance means nothing is created.
2. **Submit**: call the provider. Up to 3 attempts with 0.5s and 1s backoff. Success stores the provider order ID. Three failures set `gagal_kirim` and trigger an automatic full refund, and the user gets a notification.
3. **Sync** (`/api/cron/sync-orders`, every 2 minutes): read provider status for every active order and map it (`Pending` to `menunggu`, `Processing` to `diproses`, `In progress` to `berjalan`, `Completed` to `selesai`, `Partial` to `sebagian`, `Canceled` to `dibatalkan`). Update `start_count` and `remains`.
4. **Final**: `selesai` pays nothing. `dibatalkan` and `sebagian` create an automatic refund.

## Refund rules

- `dibatalkan` and `gagal_kirim`: refund the **full charge**.
- `sebagian`: `floor(charge * remains / quantity)`. Always rounded down, never above the charge.
- `selesai`: no refund.
- Automatic refunds are keyed on `(order, reason)`. Syncing twice, or approving twice, credits **once**.
- The ledger entry for a refund is keyed on the refund ID, so even a retried transaction cannot credit twice.
- A refund can never take `refunded_amount` above `charge` (manual ones included). The check runs inside the transaction.
- Manual and user-requested refunds wait as `menunggu` until an admin approves (`approveRefund`, password re-entry) or rejects (`rejectRefund`, reason required, user is notified).
- A `gagal_kirim` order that an admin sends again reverses its refund and charges the user again, in one transaction.

## Cancel and refill

- **Cancel**: only for services with cancel enabled and orders that are not finished, and not while an earlier request is open. The provider decides; the next sync turns the result into a refund (cancelled) or a rejection with a reason.
- **Refill**: refill-enabled service, status `selesai`, inside the service's refill window (default 30 days), once per 24 hours per order, and not while an earlier refill is `menunggu` or `berjalan`.

## Deposits

`creditDeposit` credits the amount (`type=deposit`) and the tier bonus (`type=bonus`) through the ledger, and marks the deposit `berhasil`. The gateway transaction ID is unique, a repeated webhook is acknowledged and ignored, and the admin "konfirmasi manual" button uses the same function.

## Real versus placeholder

| Piece | State |
| --- | --- |
| Ledger, refund, order, sync, deposit logic, rules, tests | Real code, runs on the mock store |
| Postgres functions (`schema.sql`) | Written for `apply_ledger_entry`, `settle_refund`, the ledger triggers and the mismatch view. `place_order` and the rest are marked TODO |
| Provider API calls | **TODO**: `createMockProviderClient` simulates the provider |
| Payment gateway signature | **TODO**: placeholder HMAC-SHA256 in `verifyWebhookSignature` |
| Cron scheduling | **TODO**: the route exists and is protected by `CRON_SECRET`, but nothing calls it yet |
| User login | **TODO**: `getCurrentUser()` returns a fixed mock user |

## Environment

- `CRON_SECRET`: required by `/api/cron/sync-orders` (`Authorization: Bearer ...`). Without it the route answers 503.
- `PAYMENT_WEBHOOK_SECRET`: required by `/api/webhooks/payment`. Without it every call is rejected.

## Tests

`npx vitest run` runs `lib/server/__tests__/logic.test.ts` (refund rounding, full cancel refund, double sync, refund over charge, insufficient balance, `gagal_kirim` refund and resubmit, refill window and 24h rule, duplicate webhook, ledger reconciliation, rollback).
