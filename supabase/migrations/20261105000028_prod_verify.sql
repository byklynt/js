-- Read-only security / hygiene report used by `npm run prod:verify` (service role only). It changes nothing.
-- Returns one jsonb document; the script turns it into a pass/fail table.
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

revoke all on function public.prod_verify() from public, anon, authenticated;
grant execute on function public.prod_verify() to service_role;
