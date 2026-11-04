# Provider: Likeo (https://likeo.net/id)

Likeo is the first real provider in JagoanSosmed. This folder holds the adapter, a mock, and the catalogue sync.
Everything here is **server only**. The API key is read from the environment and never reaches the browser.

## Setup

1. Log in to your Likeo account and open the **API** page. Copy your **API key** (and the API URL if it differs from the default below).
2. Put these in `.env.local` (see `.env.example`):

   | Variable | Meaning |
   | --- | --- |
   | `PROVIDER_MODE` | `mock` (default): fake deterministic data, no key needed. `live`: real calls to Likeo. |
   | `LIKEO_API_URL` | Default `https://likeo.net/api/v2`. |
   | `LIKEO_API_KEY` | Your key. In `live` mode a missing key stops every call with a clear message. |

3. Restart `npm run dev` after changing `.env.local`.
4. `/admin/providers` shows a **MODE MOCK** or **MODE LIVE** chip on the Likeo card. Use **Tes koneksi** (calls `balance`).

## First live test (one tiny order)

1. `PROVIDER_MODE=live`, then **Tes koneksi**. Expect "Terhubung (live, ... ms). Saldo ...". If it fails, the message says why (key, URL, timeout).
2. `/admin/services` > **Sinkronkan dari provider** > check the preview > **Terapkan**.
3. Set **Kurs & markup** on the Likeo card first (kurs is a manual number for now).
4. Pick the cheapest imported service, order the minimum quantity with a link you control. Watch it in `/dashboard/orders`; the status sync (`/api/cron/sync-orders`, every 2 minutes) updates it.
5. Keep your Likeo balance small while testing. A wrong link cannot be refunded.

## What is where

| File | Job |
| --- | --- |
| `types.ts` | `ProviderAdapter` interface (`getServices`, `getBalance`, `createOrder`, `getOrderStatus`, `getOrdersStatus`, `requestRefill`, `requestCancel`) |
| `likeo.ts` | HTTP adapter: form POST, 15s timeout, read retries, zod validation, status mapping, Indonesian errors |
| `mock.ts` | Deterministic fake Likeo (16 services incl. unsupported types, orders that finish by themselves) |
| `config.ts` | Env reading, key masking, redaction |
| `client.ts` | Bridges the adapter to the order/sync code; routes Likeo to the adapter, the three demo providers to the old mock |
| `catalog.ts` | Normalising, Rupiah pricing, the diff preview, applying it, what users see |
| `balance.ts` | Balance cached for 60 seconds, "Tes koneksi" |

## Behaviour worth knowing

- **`add` is never retried.** A timeout, dropped connection, 5xx or unreadable answer is *ambiguous*: the order may exist at Likeo. The order becomes `gagal_kirim` with a "perlu dicek manual" flag and is **not** refunded. An admin looks at the Likeo panel, then chooses in `/admin/orders` > "Cek manual di provider": "Tidak ada di provider" (full refund) or "Ada di provider" (enter the Likeo order id; the sync takes over).
- A clear `{"error": ...}` answer (for example no balance) is a definite rejection: 3 attempts as before, then `gagal_kirim` and an automatic full refund.
- **Read calls** (`services`, `status`, `balance`) retry up to 2 times (0.5s, 1.5s) on network errors, timeouts and 5xx.
- **Status mapping** (case-insensitive): Pending = menunggu; Processing / In progress = berjalan; Completed = selesai; Partial = sebagian (uses `remains`, refund = floor(charge x remains / quantity)); Canceled / Cancelled = dibatalkan (full refund); Fail / Failed / Error = failed, full refund. Unknown text keeps the old status and writes `sync.unknown_status` to the activity log.
- Status sync asks up to 100 order ids per call.
- **Pricing**: Likeo's rate is per 1000 in the provider currency. Cost in Rupiah = `ceil(rate x kurs)` (stored as `providerPrice`, and per order as `providerCost`). Selling price = cost x (1 + markup), rounded **up** to the "pembulatan" step. New services take the category markup, else the provider markup, else the default. Services under the minimum margin are flagged in the preview and on `/admin/services`.
- **Sync**: only services of type `Default` are imported; `Package`, `Custom Comments`, `Subscription`, ... are listed as "tidak didukung". A service Likeo drops becomes nonaktif (never deleted) and comes back when listed again. "Terapkan" is locked to the previewed diff (fingerprint): if the catalogue or the kurs changed in between, you must preview again.
- Imported services appear in the user's order form and Layanan page (`CatalogBoundary` in the dashboard layout). The bundled demo services stay.
- The key is never logged, never in error messages (redacted), never in `PublicProvider`; the card shows the last 4 characters only.

## Verified vs assumed

I could **not** read Likeo's API documentation. Everything below marked "assumed" follows the common SMM-panel (PerfectPanel-style) API v2 convention and must be checked against the real docs.

**Verified by tests (mocked fetch), not against Likeo itself**
- Request shape: POST, `application/x-www-form-urlencoded`, `key` + `action`, `service/link/quantity` for `add`, `order` / `orders` for status, `order` for refill, `orders` for cancel.
- Parsing, error handling, status mapping, remains math, no retry on `add`, retries on reads, key never in logs/messages/client files, price maths, margin flag, removed services, unsupported types.

**Assumed (please confirm with the Likeo docs)**
- The API URL `https://likeo.net/api/v2` and that the key goes in the `key` field.
- Response shapes: `services` = list of `{service, name, type, category, rate, min, max, refill, cancel}`; `add` = `{order}`; `status` = `{charge, start_count, status, remains, currency}` (single) and an object keyed by order id (batch, `orders=1,2,3`); `balance` = `{balance, currency}`; `refill` = `{refill}`; `cancel` = list of `{order, cancel}`.
- Errors arrive as `{"error": "..."}` (HTTP 200 or 4xx). The Indonesian mapping covers the usual English messages; anything else is shown shortened.
- `rate` is per 1000 and in a currency that matches `Kurs` (default USD). If Likeo bills in another currency, change the currency in the code (`settings.pricing.currency`) and the kurs.
- Whether `cancel` and `refill` actions are enabled per service and per account; the `refill`/`cancel` flags from `services` are trusted.
- The service `type` text for normal services is `Default`.
- The maximum batch of 100 order ids for `status`.
- The statuses listed above are the only ones Likeo uses (anything else is logged and ignored).

**Not done / placeholders**
- Kurs is a manual setting (`TODO: fetch automatically`).
- There is no database: imported services, pricing and the provider switch live in the dev store file (`.data/dev-store.json`); orders still live in memory like the rest of the mock data.
- The status sync has to be called by a scheduler (`/api/cron/sync-orders`); locally use "Sinkronkan" in the admin or call it with `CRON_SECRET`.
- Provider-side refill status is not read back (the existing request flow keeps its simple lifecycle).
- Payment gateway: untouched.

Send the real API docs and I will adjust the adapter (paths, field names, error texts, currency).
