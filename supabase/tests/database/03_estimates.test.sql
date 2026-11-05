-- Measured delivery-time estimates (pgTAP): stats follow only the first clean completion, exclusions, completed_at guard, RLS.
begin;
select * from no_plan();

insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id) values
  ('00000000-0000-0000-0000-0000000000e1', 'e1@test.local', '{"username":"est_one"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000e2', 'e2@test.local', '{"username":"est_two"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
insert into public.providers (id, name, slug, api_key_encrypted) values ('00000000-0000-0000-0000-0000000000f1', 'EstProv', 'est-prov', 'X');
insert into public.service_categories (id, label, platform) values ('estcat', 'EstCat', 'instagram');
insert into public.services (id, provider_id, provider_service_id, category_id, name, platform, provider_price, price_per_1000, active, imported) values
  ('ES1', '00000000-0000-0000-0000-0000000000f1', '1', 'estcat', 'Est service', 'instagram', 800, 1000, true, true);

-- Five orders, active, accepted 5 / 7 / 6 / 25 / 4 minutes before "now" (the completion). Each starts as 'berjalan'.
insert into public.orders (id, user_id, service_id, provider_id, link, quantity, charge, status, provider_accepted_at, created_at)
select 100 + g, '00000000-0000-0000-0000-0000000000e1', 'ES1', '00000000-0000-0000-0000-0000000000f1', 'https://x.test/e' || g, 1000, 0, 'berjalan',
       now() - make_interval(secs => (array[300, 420, 360, 1500, 240])[g]), now() - make_interval(secs => (array[300, 420, 360, 1500, 240])[g] + 5)
  from generate_series(1, 5) g;

-- Structure and privileges
select is((select relrowsecurity from pg_class where oid = 'public.service_completion_stats'::regclass), true, 'RLS is on for the stats table');
select is((select count(*)::int from information_schema.table_privileges where table_name = 'service_completion_stats' and grantee = 'authenticated' and privilege_type <> 'SELECT'), 0, 'authenticated can only SELECT the stats');
select is((select has_function_privilege('authenticated', 'public.recompute_service_completion_stats(text)', 'execute')), false, 'users cannot run the recompute');
select is((select has_function_privilege('authenticated', 'public.reset_service_completion_stats(text, uuid)', 'execute')), false, 'users cannot reset the stats');
select is((select has_column_privilege('authenticated', 'public.services', 'estimate_override', 'select')), false, 'the manual text is not readable by users');

-- A completion the sync did NOT mark as clean does not touch the stats (manual status / sync problem / stalled): completion_counts stays false.
update public.orders set status = 'selesai', completed_at = now() where id = 101;
select is((select count(*)::int from public.service_completion_stats where service_id = 'ES1'), 0, 'a completion that is not marked as counted creates no stats');
update public.orders set status = 'berjalan' where id = 101;

-- Clean completions (completion_counts true) recompute the stats on the FIRST transition only.
update public.orders set status = 'selesai', completed_at = now(), completion_counts = true where id in (101, 102, 103);
select is((select sample_count from public.service_completion_stats where service_id = 'ES1'), 3, 'three clean completions -> 3 samples');
select is((select median_seconds from public.service_completion_stats where service_id = 'ES1'), 360, 'median of 300 / 420 / 360 is 360 s');
select is((select p25_seconds from public.service_completion_stats where service_id = 'ES1'), 330, 'p25 is 330 s');
select is((select p75_seconds from public.service_completion_stats where service_id = 'ES1'), 390, 'p75 is 390 s');
select is((select (buckets #>> '{small,n}')::int from public.service_completion_stats where service_id = 'ES1'), 3, 'the quantity bucket small has the 3 samples');

-- Idempotent: more updates of finished orders change nothing.
update public.service_completion_stats set updated_at = '2000-01-01' where service_id = 'ES1';
update public.orders set remains = 0, last_synced_at = now() where id in (101, 102, 103);
select is((select updated_at from public.service_completion_stats where service_id = 'ES1'), '2000-01-01'::timestamptz, 'repeated updates of finished orders do not recompute');

-- completed_at never moves once an order is selesai.
select is((select completed_at = (select completed_at from public.orders where id = 102) from public.orders where id = 102), true, 'completed_at is set');
update public.orders set completed_at = '2001-01-01' where id = 102;
select isnt((select completed_at from public.orders where id = 102), '2001-01-01'::timestamptz, 'completed_at cannot be moved after the first transition');

-- Partial / canceled / failed (never selesai) do not count; a refill taken later removes an order from the sample.
update public.orders set status = 'sebagian', completed_at = now(), completion_counts = true where id = 104;
update public.orders set status = 'dibatalkan', completed_at = now(), completion_counts = true, cancelled_by = 'provider' where id = 105;
select is((select sample_count from public.service_completion_stats where service_id = 'ES1'), 3, 'partial and canceled orders are not counted');
insert into public.refill_requests (order_id, user_id, status) values (101, '00000000-0000-0000-0000-0000000000e1', 'menunggu');
select is((select sample_count from public.service_completion_stats where service_id = 'ES1'), 2, 'a refill requested later takes the order out of the sample');

-- RLS: a user reads the aggregate, but not another user's order (and so no order-level duration).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.service_completion_stats where service_id = 'ES1'), 1, 'a user can read the aggregate');
select is((select count(*)::int from public.orders where service_id = 'ES1'), 0, 'a user cannot read order-level data of other users');
select throws_ok($$ update public.service_completion_stats set median_seconds = 1 $$, '42501', null, 'a user cannot write the stats');
reset role;

select * from finish();
rollback;
