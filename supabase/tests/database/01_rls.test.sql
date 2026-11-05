-- RLS / privilege tests (pgTAP). Run: npm run db:test  (needs local Supabase: npm run db:start)
begin;
select * from no_plan();

-- ---------------------------------------------------------------------------------------------------------------
-- Fixtures (as postgres, bypasses RLS). u1 / u2 are normal users, ad is an admin.
-- ---------------------------------------------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id) values
  ('00000000-0000-0000-0000-0000000000a1', 'u1@test.local', '{"username":"user_one"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000a2', 'u2@test.local', '{"username":"user_two"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000ad', 'ad@test.local', '{"username":"admin_one"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');

update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000ad';
update public.profiles set balance = 5000 where id = '00000000-0000-0000-0000-0000000000a1';

insert into public.providers (id, name, slug, api_key_encrypted) values
  ('00000000-0000-0000-0000-0000000000b1', 'Prov', 'prov', 'ENCRYPTED-SECRET');
insert into public.service_categories (id, label, platform) values ('cat', 'Cat', 'instagram');
insert into public.services (id, provider_id, provider_service_id, category_id, name, platform, provider_price, price_per_1000, active) values
  ('S1', '00000000-0000-0000-0000-0000000000b1', '1', 'cat', 'Visible', 'instagram', 800, 1000, true),
  ('S2', '00000000-0000-0000-0000-0000000000b1', '2', 'cat', 'Hidden', 'instagram', 800, 1000, false);

insert into public.orders (id, user_id, service_id, provider_id, link, quantity, charge) values
  (1, '00000000-0000-0000-0000-0000000000a1', 'S1', '00000000-0000-0000-0000-0000000000b1', 'https://x.test/a', 1000, 1000),
  (2, '00000000-0000-0000-0000-0000000000a2', 'S1', '00000000-0000-0000-0000-0000000000b1', 'https://x.test/b', 1000, 1000);
insert into public.balance_ledger (user_id, type, amount, balance_before, balance_after, ref_type, ref_id) values
  ('00000000-0000-0000-0000-0000000000a1', 'deposit', 5000, 0, 5000, 'deposit', 'd1'),
  ('00000000-0000-0000-0000-0000000000a2', 'deposit', 3000, 0, 3000, 'deposit', 'd2');
insert into public.tickets (id, user_id, title) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', 'T1'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a2', 'T2');
insert into public.ticket_messages (ticket_id, sender, body, is_internal) values
  ('00000000-0000-0000-0000-0000000000c1', 'user', 'hello', false),
  ('00000000-0000-0000-0000-0000000000c1', 'support', 'internal note', true),
  ('00000000-0000-0000-0000-0000000000c2', 'user', 'other', false);
insert into public.notifications (user_id, type, title) values
  ('00000000-0000-0000-0000-0000000000a1', 'sistem', 'n1'),
  ('00000000-0000-0000-0000-0000000000a2', 'sistem', 'n2');
insert into public.announcements (title, body, audience) values ('All', 'b', 'semua'), ('Resellers', 'b', 'reseller');
insert into public.audit_logs (admin_name, action, target_type, target_id) values ('admin_one', 'x', 'user', '1');
insert into public.site_settings (data) values ('{"secret":"s"}');

-- ---------------------------------------------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------------------------------------------
select is((select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity), 0, 'RLS is enabled on every public table');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prosecdef and not coalesce(p.proconfig::text ilike '%search_path%', false)),
          0, 'every SECURITY DEFINER function pins search_path');
select is((select role from public.profiles where username = 'user_one'), 'user', 'trigger created the profile with role user');

select throws_ok($$ insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id)
  values (gen_random_uuid(), 'dup@test.local', '{"username":"USER_ONE"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000') $$,
  '23505', null, 'duplicate username (case-insensitive) is rejected');
select throws_ok($$ insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id)
  values (gen_random_uuid(), 'bad@test.local', '{"username":"a"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000') $$,
  '22023', null, 'invalid username is rejected');
select lives_ok($$ insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id)
  values (gen_random_uuid(), 'meta@test.local', '{"username":"meta_user","role":"admin","balance":99999}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000') $$,
  'signup with role/balance in metadata still succeeds');
select is((select role || ':' || balance from public.profiles where username = 'meta_user'), 'user:0', 'metadata cannot set role or balance');

select throws_ok($$ update public.balance_ledger set note = 'x' $$, 'P0001', 'balance_ledger is append-only', 'ledger UPDATE blocked even for postgres');
select throws_ok($$ delete from public.balance_ledger $$, 'P0001', 'balance_ledger is append-only', 'ledger DELETE blocked even for postgres');
select throws_ok($$ insert into public.balance_ledger (user_id, type, amount, balance_before, balance_after, ref_type, ref_id)
  values ('00000000-0000-0000-0000-0000000000a1', 'deposit', 1, 5000, 5001, 'deposit', 'd1') $$,
  '23505', null, 'same (type, ref_type, ref_id) cannot post twice');

-- ---------------------------------------------------------------------------------------------------------------
-- Anonymous
-- ---------------------------------------------------------------------------------------------------------------
set local role anon;
select throws_ok($$ select * from public.profiles $$, '42501', null, 'anon cannot read profiles');
select throws_ok($$ select * from public.orders $$, '42501', null, 'anon cannot read orders');
select throws_ok($$ select * from public.services $$, '42501', null, 'anon cannot read services');
reset role;

-- ---------------------------------------------------------------------------------------------------------------
-- user_one
-- ---------------------------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*)::int from public.profiles), 1, 'user sees only their own profile');
select is((select count(*)::int from public.orders), 1, 'user sees only their own orders');
select is((select count(*)::int from public.orders where id = 2), 0, 'user cannot read another user''s order by id');
select is((select count(*)::int from public.balance_ledger), 1, 'user sees only their own ledger');
select is((select count(*)::int from public.notifications), 1, 'user sees only their own notifications');
select is((select count(*)::int from public.tickets), 1, 'user sees only their own tickets');
select is((select count(*)::int from public.ticket_messages), 1, 'user does not see internal notes or other tickets'' messages');
select is((select count(*)::int from public.announcements), 1, 'reseller-only announcement is hidden from a normal user');

select throws_ok($$ update public.profiles set balance = 999999 where id = '00000000-0000-0000-0000-0000000000a1' $$, '42501', null, 'user cannot set own balance');
select throws_ok($$ update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000a1' $$, '42501', null, 'user cannot promote themselves');
select throws_ok($$ update public.profiles set status = 'aktif', flagged = false where id = '00000000-0000-0000-0000-0000000000a1' $$, '42501', null, 'user cannot change status / flagged');
select lives_ok($$ update public.profiles set language = 'en' where id = '00000000-0000-0000-0000-0000000000a1' $$, 'user can change language');
select is((with u as (update public.profiles set language = 'en' where id = '00000000-0000-0000-0000-0000000000a2' returning 1) select count(*)::int from u),
          0, 'user cannot modify another user''s profile');

select throws_ok($$ insert into public.balance_ledger (user_id, type, amount, balance_before, balance_after, ref_type, ref_id)
  values ('00000000-0000-0000-0000-0000000000a1', 'deposit', 100, 5000, 5100, 'x', 'y') $$, '42501', null, 'user cannot insert ledger rows');
select throws_ok($$ update public.orders set status = 'selesai' where id = 1 $$, '42501', null, 'user cannot change order status');
select throws_ok($$ insert into public.orders (user_id, service_id, provider_id, link, quantity, charge)
  values ('00000000-0000-0000-0000-0000000000a1', 'S1', '00000000-0000-0000-0000-0000000000b1', 'https://x.test/z', 1000, 0) $$, '42501', null, 'user cannot create orders directly (free orders)');
select throws_ok($$ insert into public.refunds (order_id, user_id, amount, reason, source)
  values (1, '00000000-0000-0000-0000-0000000000a1', 1000, 'manual', 'admin') $$, '42501', null, 'user cannot create refunds');
select throws_ok($$ insert into public.tickets (user_id, title) values ('00000000-0000-0000-0000-0000000000a1', 'x') $$, '42501', null, 'tickets are created only via the server function');

select is((select count(*)::int from public.services), 1, 'user sees only active services');
select throws_ok($$ select provider_price from public.services $$, '42501', null, 'user cannot read provider cost');
select throws_ok($$ select markup_value from public.services $$, '42501', null, 'user cannot read markup');
select throws_ok($$ select * from public.audit_logs $$, '42501', null, 'user cannot read audit_logs');
select throws_ok($$ select * from public.site_settings $$, '42501', null, 'user cannot read site_settings');
select is((select count(*)::int from public.providers), 0, 'user sees no provider rows');
select throws_ok($$ select api_key_encrypted from public.providers $$, '42501', null, 'provider key is never selectable');

reset role;

-- ---------------------------------------------------------------------------------------------------------------
-- admin
-- ---------------------------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ad","role":"authenticated"}', true);
set local role authenticated;
select ok((select count(*) from public.audit_logs) >= 1, 'admin can read audit_logs');
select is((select count(*)::int from public.providers), 1, 'admin can read providers');
select throws_ok($$ select api_key_encrypted from public.providers $$, '42501', null, 'even admin cannot select the encrypted key through the API');
select ok((select count(*) from public.profiles) >= 3, 'admin can read all profiles');
select throws_ok($$ update public.profiles set balance = 1 where id = '00000000-0000-0000-0000-0000000000a1' $$, '42501', null, 'admin writes also go through server functions only');
reset role;

select * from finish();
rollback;
