-- What the PROVIDER says about a cancellation we forwarded after an admin approved a user cancel (read back by the sync job).
alter table public.cancel_requests add column provider_state text check (provider_state in ('diminta', 'dikonfirmasi', 'ditolak', 'gagal'));
create index cancel_requests_provider_state_idx on public.cancel_requests (provider_state) where provider_state = 'diminta';
-- refill requests the sync still has to read back
create index refill_requests_open_provider_idx on public.refill_requests (status) where status in ('menunggu', 'berjalan') and provider_request_id is not null;
