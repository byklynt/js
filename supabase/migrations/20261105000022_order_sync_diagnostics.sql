-- Per-order diagnostics for the provider sync: what the provider last said (raw text) and the last error (submit or sync), so "why is this order stuck" has an answer in the row.
alter table public.orders add column provider_status text, add column sync_error text;
-- The sync picks orders least-recently-synced first (never-synced first), so old stuck orders cannot starve new ones when the batch limit is reached.
create index orders_sync_queue_idx on public.orders (last_synced_at nulls first, id) where provider_order_id <> '' and status in ('menunggu', 'diproses', 'berjalan');
