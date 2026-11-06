-- In-process test cleanup (no CLI, no extra process) + a dev-only switch that keeps it from ever working on production.
--
-- dev_flags: a tiny key/value table, service role only. `allow_test_cleanup = 'true'` is set by hand on the DEV project only
--   (insert into public.dev_flags (key, value) values ('allow_test_cleanup', 'true');). On any other project the table is empty, so
--   test_cleanup() refuses to run. prod_verify() reports any active dev flag, so a production project with the switch on fails the check.
-- test_cleanup(p_marker): removes the data the DB / e2e tests create, in the same order as scripts/db-cleanup-test-data.sql, and returns the
--   number of rows removed per table. Without a marker: everything tagged as test data (users @jagoansosmed-test.invalid, ZT- / zt- fixtures).
--   With a marker (1-12 lower-case letters/digits, e.g. 'rf'): only the fixtures of the suite whose run id starts with that marker.
--   It never touches anything that is not tagged, and (unlike the SQL file) it does not delete recent sync runs / sanity runs.
create table public.dev_flags (
  key     text primary key,
  value   text not null,
  set_at  timestamptz not null default now()
);
alter table public.dev_flags enable row level security;
revoke all on public.dev_flags from public, anon, authenticated;

create or replace function public.test_cleanup(p_marker text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_m text := lower(nullif(btrim(p_marker), ''));
  v_users uuid[]; v_orders text[]; v_refunds text[]; v_deposits text[];
  v_out jsonb := '{}'::jsonb; n bigint;
begin
  if not exists (select 1 from public.dev_flags where key = 'allow_test_cleanup' and value = 'true') then
    raise exception 'test_cleanup is disabled on this project (dev_flags.allow_test_cleanup is not true)' using errcode = 'P0001', hint = 'disabled';
  end if;
  if v_m is not null and v_m !~ '^[a-z0-9]{1,12}$' then
    raise exception 'bad marker' using errcode = 'P0001', hint = 'bad_marker';
  end if;

  select coalesce(array_agg(id), '{}') into v_users from auth.users
   where email like '%@jagoansosmed-test.invalid' and (v_m is null or email like '%\_' || v_m || '%@jagoansosmed-test.invalid');
  select coalesce(array_agg(id::text), '{}') into v_orders from public.orders where user_id = any (v_users);
  select coalesce(array_agg(id::text), '{}') into v_refunds from public.refunds where user_id = any (v_users);
  select coalesce(array_agg(id::text), '{}') into v_deposits from public.deposits where user_id = any (v_users);

  -- the append-only triggers are off only inside this transaction
  alter table public.balance_ledger disable trigger balance_ledger_no_change;
  alter table public.audit_logs disable trigger audit_logs_no_change;

  delete from public.audit_logs where (target_type = 'refund' and target_id = any (v_refunds)) or (target_type = 'order' and target_id = any (v_orders))
     or (target_type = 'deposit' and target_id = any (v_deposits)) or target_id = any (select u::text from unnest(v_users) u) or admin_id = any (v_users);
  get diagnostics n = row_count; v_out := v_out || jsonb_build_object('audit_logs', n);
  delete from public.refunds where user_id = any (v_users);
  get diagnostics n = row_count; v_out := v_out || jsonb_build_object('refunds', n);
  delete from public.refill_requests where user_id = any (v_users);
  get diagnostics n = row_count; v_out := v_out || jsonb_build_object('refill_requests', n);
  delete from public.cancel_requests where user_id = any (v_users);
  get diagnostics n = row_count; v_out := v_out || jsonb_build_object('cancel_requests', n);
  delete from public.orders where user_id = any (v_users);
  get diagnostics n = row_count; v_out := v_out || jsonb_build_object('orders', n);
  delete from public.balance_ledger where user_id = any (v_users);
  get diagnostics n = row_count; v_out := v_out || jsonb_build_object('balance_ledger', n);
  delete from public.deposits where user_id = any (v_users);
  get diagnostics n = row_count; v_out := v_out || jsonb_build_object('deposits', n);
  delete from public.webhook_events where external_id like 'zt-%' and (v_m is null or external_id like '%' || v_m || '%');
  get diagnostics n = row_count; v_out := v_out || jsonb_build_object('webhook_events', n);
  delete from public.rate_limits where exists (select 1 from unnest(v_users) u where key like '%' || u::text || '%')
     or (v_m is null and (key like '%zt\_%' or key like '%tidak\_ada\_%'
         or (key ~ '^ticket(-reply)?:[0-9a-f-]{36}$' and not exists (select 1 from public.profiles p where key like '%' || p.id::text))))
     or (v_m is not null and key like '%zt\_%' and key like '%\_' || v_m || '%');
  get diagnostics n = row_count; v_out := v_out || jsonb_build_object('rate_limits', n);
  delete from public.admin_alerts where message like '%zt\_%' and (v_m is null or message like '%\_' || v_m || '%');
  get diagnostics n = row_count; v_out := v_out || jsonb_build_object('admin_alerts', n);
  delete from auth.users where id = any (v_users);   -- profiles, notifications, tickets cascade
  get diagnostics n = row_count; v_out := v_out || jsonb_build_object('auth_users', n);

  delete from public.announcements where title ilike 'ZT %' and (v_m is null or title ilike 'ZT ' || v_m || '%');
  get diagnostics n = row_count; v_out := v_out || jsonb_build_object('announcements', n);
  delete from public.favorites where service_id like 'ZT-%' and (v_m is null or service_id ilike 'ZT-' || v_m || '%');
  get diagnostics n = row_count; v_out := v_out || jsonb_build_object('favorites', n);
  delete from public.services where id like 'ZT-%' and (v_m is null or id ilike 'ZT-' || v_m || '%');
  get diagnostics n = row_count; v_out := v_out || jsonb_build_object('services', n);
  delete from public.service_categories where id like 'zt-%' and (v_m is null or id like 'zt-cat-' || v_m || '%');
  get diagnostics n = row_count; v_out := v_out || jsonb_build_object('service_categories', n);
  delete from public.providers where slug like 'zt-%' and (v_m is null or slug like 'zt-' || v_m || '%');
  get diagnostics n = row_count; v_out := v_out || jsonb_build_object('providers', n);
  if v_m is null then
    delete from public.service_rules where version = 'zt-rules';
    get diagnostics n = row_count; v_out := v_out || jsonb_build_object('service_rules', n);
  end if;

  alter table public.balance_ledger enable trigger balance_ledger_no_change;
  alter table public.audit_logs enable trigger audit_logs_no_change;
  return v_out;
end $$;

revoke all on function public.test_cleanup(text) from public, anon, authenticated;
grant execute on function public.test_cleanup(text) to service_role;

create or replace function public.prod_verify() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  select jsonb_build_object(
    -- every ordinary / partitioned table in public
    'tables', coalesce((select jsonb_agg(c.relname::text order by c.relname) from pg_class c
                          where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')), '[]'::jsonb),
    'rlsDisabled', coalesce((select jsonb_agg(c.relname::text order by c.relname) from pg_class c
                              where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and not c.relrowsecurity), '[]'::jsonb),
    -- anything in public (tables, views, materialized views) the anon role can read or write, at table or column level
    'anonAccess', coalesce((select jsonb_agg(c.relname::text order by c.relname) from pg_class c
                             where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm')
                               and has_any_column_privilege('anon', c.oid, 'select,insert,update,references')), '[]'::jsonb),
    -- policies that apply to anon (or to everyone)
    'anonPolicies', coalesce((select jsonb_agg(p.tablename || '.' || p.policyname order by p.tablename, p.policyname) from pg_policies p
                               where p.schemaname = 'public' and (p.roles && array['anon', 'public']::name[])), '[]'::jsonb),
    -- money integrity: constraints, indexes and triggers that must exist
    'integrity', (select jsonb_object_agg(x.name,
                    (exists (select 1 from pg_constraint k where k.conname = x.name and k.connamespace = 'public'::regnamespace)
                     or exists (select 1 from pg_indexes i where i.schemaname = 'public' and i.indexname = x.name)
                     or exists (select 1 from pg_trigger t where t.tgname = x.name and not t.tgisinternal)))
                    from (values ('balance_ledger_idempotent'), ('balance_ledger_math'), ('balance_ledger_no_change'), ('balance_ledger_no_truncate'),
                                 ('orders_refund_le_charge'), ('refunds_one_per_reason_idx'), ('profiles_balance_check'), ('orders_quantity_check'),
                                 ('cancel_requests_open_idx'), ('refill_requests_open_idx')) as x(name)),
    'present', jsonb_build_object('cron_leases', to_regclass('public.cron_leases') is not null, 'rate_limits', to_regclass('public.rate_limits') is not null,
                                  'service_completion_stats', to_regclass('public.service_completion_stats') is not null),
    'buckets', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'public', b.public, 'sizeLimit', b.file_size_limit) order by b.id) from storage.buckets b), '[]'::jsonb),
    'realtime', coalesce((select jsonb_agg(t.tablename::text order by t.tablename) from pg_publication_tables t
                           where t.pubname = 'supabase_realtime' and t.schemaname = 'public'), '[]'::jsonb),
    -- dev-only switches that must NOT be on in production (e.g. allow_test_cleanup)
    'devFlags', coalesce((select jsonb_agg(f.key order by f.key) from public.dev_flags f where f.value = 'true'), '[]'::jsonb),
    -- leftovers of tests, simulators and demos
    'testRows', jsonb_build_object(
      'testUsers', (select count(*) from auth.users where email like '%@jagoansosmed-test.invalid' or email like '%@test.local'),
      'ztServices', (select count(*) from public.services where id like 'ZT-%'),
      'ztCategories', (select count(*) from public.service_categories where id like 'zt-%'),
      'ztProviders', (select count(*) from public.providers where slug like 'zt-%'),
      'ztAnnouncements', (select count(*) from public.announcements where title like 'ZT %'),
      'mockOrders', (select count(*) from public.orders where provider_order_id like 'MK-%'),
      'testRules', (select count(*) from public.service_rules where version = 'zt-rules'))
  ) into r;
  return r;
end $$;
