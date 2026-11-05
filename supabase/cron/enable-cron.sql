-- Scheduled jobs for JagoanSosmed on Supabase (pg_cron + pg_net). IDEMPOTENT: run it as often as you like; jobs are upserted by name.
-- Do not run this file by hand with real values: use `npm run cron:enable -- https://your-app.example` (it stores the app URL and CRON_SECRET in
-- Supabase Vault first, then runs this file). Secrets are NEVER in this file, in cron.job, or in a URL: they are read from Vault at call time.
--
--   jago-sync-orders    every 2 minutes   POST /api/cron/sync-orders    (order status, refunds, refill and cancel read-back)
--   jago-sanity         daily 03:00 WIB   POST /api/cron/sanity         (ledger vs balances, refund mismatches, stuck orders)
--   jago-stats-refresh  every 30 minutes  POST /api/cron/stats-refresh  (provider balance + housekeeping)

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create schema if not exists private;

create or replace function private.cron_call(p_path text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare base text; sec text; request_id bigint;
begin
  select decrypted_secret into base from vault.decrypted_secrets where name = 'jago_app_url';
  select decrypted_secret into sec from vault.decrypted_secrets where name = 'jago_cron_secret';
  if base is null or sec is null then
    raise exception 'Cron belum dikonfigurasi: jago_app_url / jago_cron_secret tidak ada di Vault (jalankan npm run cron:enable).';
  end if;
  if base !~ '^https://' then raise exception 'jago_app_url harus HTTPS.'; end if;
  -- pg_net is asynchronous: the HTTP result is in net._http_response (see docs/supabase-setup.md).
  select net.http_post(
    url := rtrim(base, '/') || p_path,
    headers := jsonb_build_object('Authorization', 'Bearer ' || sec, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000) into request_id;
  return request_id;
end $$;
revoke all on function private.cron_call(text) from public, anon, authenticated;

select cron.schedule('jago-sync-orders',   '*/2 * * * *', $$select private.cron_call('/api/cron/sync-orders')$$);
select cron.schedule('jago-sanity',        '0 20 * * *',  $$select private.cron_call('/api/cron/sanity')$$);
select cron.schedule('jago-stats-refresh', '*/30 * * * *', $$select private.cron_call('/api/cron/stats-refresh')$$);
