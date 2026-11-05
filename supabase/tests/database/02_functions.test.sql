-- Money functions (pgTAP): ledger, place_order, refunds, deposits, admin adjust, rate limit, sanity.
-- Everything runs in one transaction that is rolled back. Concurrency is tested separately (lib/server/__tests__/db-concurrency.test.ts).
begin;
select * from no_plan();

-- fixtures ------------------------------------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id) values
  ('00000000-0000-0000-0000-0000000000a1', 'u1@test.local', '{"username":"user_one"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000a2', 'u2@test.local', '{"username":"user_two"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000ad', 'ad@test.local', '{"username":"admin_one"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000ad';

insert into public.providers (id, name, slug) values ('00000000-0000-0000-0000-0000000000b1', 'Prov', 'prov-t');
insert into public.service_categories (id, label, platform) values ('cat-t', 'Cat', 'instagram');
insert into public.services (id, provider_id, provider_service_id, category_id, name, platform, provider_price, price_per_1000, min, max, active) values
  ('T1', '00000000-0000-0000-0000-0000000000b1', '1', 'cat-t', 'Svc', 'instagram', 1000, 1500, 100, 100000, true),
  ('T2', '00000000-0000-0000-0000-0000000000b1', '2', 'cat-t', 'Off', 'instagram', 1000, 1500, 100, 100000, false);
insert into public.service_rules (platform, label, title, bullets, version) values
  ('instagram', 'Instagram', 'Rules', '{a}', 'v1'), ('other', 'Lain', 'Rules', '{a}', 'v1')
  on conflict (platform) do update set version = 'v1';
insert into public.site_settings (id, data) values (true, '{"limits":{"ordersPerMinute":3},"cancelPolicy":{"minAgeHours":72,"refundPercent":50},"payments":{"bonusTiers":[{"min":100000,"percent":5},{"min":500000,"percent":10}]},"notifications":{"largeDepositAmount":1000000}}')
  on conflict (id) do update set data = excluded.data;
create temp table ctx (k text primary key, v text);

-- apply_ledger_entry ---------------------------------------------------------------------------------------------
insert into ctx select 'led1', new_balance::text from public.apply_ledger_entry('00000000-0000-0000-0000-0000000000a1', 'deposit', 10000, 'test', 'r1', 'x', 't');
select is((select v from ctx where k = 'led1'), '10000', 'credit returns the new balance');
select is((select new_balance from public.apply_ledger_entry('00000000-0000-0000-0000-0000000000a1', 'deposit', 10000, 'test', 'r1', 'x', 't')), 10000::bigint, 'replay returns the existing result');
select is((select duplicate from public.apply_ledger_entry('00000000-0000-0000-0000-0000000000a1', 'deposit', 10000, 'test', 'r1', 'x', 't')), true, 'replay is flagged duplicate');
select is((select balance from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'), 10000::bigint, 'replay did not change the balance');
select throws_ok($$ select * from public.apply_ledger_entry('00000000-0000-0000-0000-0000000000a1', 'order', -10001, 'test', 'r2', 'x', 't') $$, 'P0001', 'Saldo tidak cukup.', 'overdraw is rejected');
select throws_ok($$ select * from public.apply_ledger_entry('00000000-0000-0000-0000-0000000000a2', 'deposit', 10000, 'test', 'r1', 'x', 't') $$, 'P0001', 'Referensi transaksi sudah dipakai pengguna lain.', 'a replay of another user''s reference is rejected');
select throws_ok($$ select * from public.apply_ledger_entry('00000000-0000-0000-0000-0000000000a1', 'order', 0, 'test', 'r3', 'x', 't') $$, 'P0001', 'Nominal tidak valid.', 'zero amount is rejected');
select throws_ok($$ select * from public.apply_ledger_entry(gen_random_uuid(), 'deposit', 5, 'test', 'r4', 'x', 't') $$, 'P0001', 'Pengguna tidak ditemukan.', 'unknown user is rejected');
select is((select balance from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'), 10000::bigint, 'rejected calls left the balance alone');

-- credit_deposit ---------------------------------------------------------------------------------------------------
insert into ctx select 'dep1', deposit_id::text from public.credit_deposit('EXT-1', '00000000-0000-0000-0000-0000000000a2', 200000, 'qris');
select is((select balance from public.profiles where id = '00000000-0000-0000-0000-0000000000a2'), 210000::bigint, '200.000 deposit + 5% tier bonus = 210.000');
select is((select bonus from public.deposits where id = (select v::uuid from ctx where k = 'dep1')), 10000::bigint, 'bonus stored on the deposit');
select is((select duplicate from public.credit_deposit('EXT-1', '00000000-0000-0000-0000-0000000000a2', 200000, 'qris')), true, 'same external_id again is a duplicate');
select is((select balance from public.profiles where id = '00000000-0000-0000-0000-0000000000a2'), 210000::bigint, 'duplicate webhook credits nothing');
select is((select count(*)::int from public.balance_ledger where ref_id = (select v from ctx where k = 'dep1') and ref_type like 'deposit%'), 2, 'exactly one deposit + one bonus ledger row');
select throws_ok($$ select * from public.credit_deposit('EXT-1', '00000000-0000-0000-0000-0000000000a2', 999, 'qris') $$, 'P0001', 'Nominal tidak cocok dengan deposit.', 'amount mismatch on a known external_id');
select throws_ok($$ select * from public.credit_deposit('EXT-1', '00000000-0000-0000-0000-0000000000a1', 200000, 'qris') $$, 'P0001', 'Pengguna tidak cocok dengan deposit.', 'wrong user on a known external_id');
select is((select bonus from public.credit_deposit('EXT-2', '00000000-0000-0000-0000-0000000000a2', 99999, 'qris')), 0::bigint, 'below the first tier: no bonus');
select is((select bonus from public.credit_deposit('EXT-3', '00000000-0000-0000-0000-0000000000a2', 500000, 'qris')), 50000::bigint, 'highest tier reached wins (10%)');
select is((select count(*)::int from public.admin_alerts where kind = 'large_deposit'), 0, 'no large-deposit alert below the threshold');
select is((select count(*)::int from public.notifications where user_id = '00000000-0000-0000-0000-0000000000a2' and type = 'deposit'), 3, 'one notification per credited deposit');

-- place_order -----------------------------------------------------------------------------------------------------
insert into ctx select 'o1', order_id::text from public.place_order('00000000-0000-0000-0000-0000000000a1', 'T1', 'https://x.test/a', 1000, 'v1');
select is((select charge from public.orders where id = (select v::bigint from ctx where k = 'o1')), 1500::bigint, 'charge = ceil(1500 * 1000 / 1000)');
select is((select provider_cost from public.orders where id = (select v::bigint from ctx where k = 'o1')), 1000::bigint, 'provider cost is stored');
select is((select balance from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'), 8500::bigint, 'balance debited');
select is((select count(*)::int from public.balance_ledger where type = 'order' and ref_id = (select v from ctx where k = 'o1') and amount = -1500), 1, 'ledger row for the order');
select is((select accepted_rules_version from public.orders where id = (select v::bigint from ctx where k = 'o1')), 'v1', 'order carries the accepted rules version');
select throws_ok($$ select * from public.place_order('00000000-0000-0000-0000-0000000000a1', 'T1', 'HTTPS://X.TEST/a/', 1000) $$, 'P0001', null, 'same link (case / trailing slash) while active is a duplicate');
select throws_ok($$ select * from public.place_order('00000000-0000-0000-0000-0000000000a1', 'T1', 'https://x.test/b', 50) $$, 'P0001', 'Jumlah harus antara 100 dan 100.000.', 'below min');
select throws_ok($$ select * from public.place_order('00000000-0000-0000-0000-0000000000a1', 'T1', 'not a link', 1000) $$, 'P0001', 'Tautan tidak valid.', 'bad link');
select throws_ok($$ select * from public.place_order('00000000-0000-0000-0000-0000000000a1', 'T2', 'https://x.test/b', 1000) $$, 'P0001', 'Layanan tidak tersedia.', 'inactive service');
select throws_ok($$ select * from public.place_order('00000000-0000-0000-0000-0000000000a1', 'T1', 'https://x.test/b', 1000, 'old') $$, 'P0001', 'Ketentuan order berubah. Baca ulang sebelum memesan.', 'stale rules version');
select is((select balance from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'), 8500::bigint, 'rejected orders did not charge');
select lives_ok($$ select * from public.place_order('00000000-0000-0000-0000-0000000000a1', 'T1', 'https://x.test/b', 1000) $$, 'second order on another link');
select lives_ok($$ select * from public.place_order('00000000-0000-0000-0000-0000000000a1', 'T1', 'https://x.test/c', 1000) $$, 'third order within the minute');
select throws_ok($$ select * from public.place_order('00000000-0000-0000-0000-0000000000a1', 'T1', 'https://x.test/d', 1000) $$, 'P0001', null, 'fourth order in a minute is rate limited (limit 3)');
select is((select balance from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'), 5500::bigint, 'three orders charged, the limited one did not');

-- refunds ---------------------------------------------------------------------------------------------------------
-- partial: floor(charge * remains / quantity)
update public.orders set status = 'sebagian', remains = 250 where id = (select v::bigint from ctx where k = 'o1');
insert into ctx select 'rf1', refund_id::text from public.create_refund_for_order((select v::bigint from ctx where k = 'o1'), 'sebagian');
select is((select amount from public.refunds where id = (select v::uuid from ctx where k = 'rf1')), 375::bigint, 'partial refund = floor(1500 * 250 / 1000)');
select is((select refunded_amount from public.orders where id = (select v::bigint from ctx where k = 'o1')), 375::bigint, 'order.refunded_amount updated');
select is((select balance from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'), 5875::bigint, 'refund credited');
select is((select created from public.create_refund_for_order((select v::bigint from ctx where k = 'o1'), 'sebagian')), false, 'second sync: no new refund');
select is((select refunded_amount from public.orders where id = (select v::bigint from ctx where k = 'o1')), 375::bigint, 'second sync credits nothing');
select is((select count(*)::int from public.refunds where order_id = (select v::bigint from ctx where k = 'o1')), 1, 'exactly one refund row per (order, reason)');
select throws_ok($$ select * from public.create_refund_for_order((select v::bigint from ctx where k = 'o1'), 'manual', 5000, 'admin', 'x', 'alasan cukup panjang') $$, 'P0001', null, 'manual refund above charge - refunded is rejected');

-- failed submit = full charge
insert into ctx select 'o2', order_id::text from public.place_order('00000000-0000-0000-0000-0000000000a2', 'T1', 'https://x.test/z', 1000);
update public.orders set status = 'gagal_kirim' where id = (select v::bigint from ctx where k = 'o2');
select is((select amount from public.create_refund_for_order((select v::bigint from ctx where k = 'o2'), 'gagal_kirim')), 1500::bigint, 'gagal_kirim refunds the full charge');
select is((select balance from public.profiles where id = '00000000-0000-0000-0000-0000000000a2'), 859999::bigint, 'balance restored after gagal_kirim (credits 859999, order -1500, refund +1500)');

-- rounding: charge 1001 / quantity 3 / remains 1 -> floor(333.67) = 333 (inserted directly: fixture)
insert into public.orders (id, user_id, service_id, provider_id, link, quantity, charge, remains, status)
  values (900001, '00000000-0000-0000-0000-0000000000a2', 'T1', '00000000-0000-0000-0000-0000000000b1', 'https://x.test/r', 3, 1001, 1, 'sebagian');
select is((select amount from public.create_refund_for_order(900001, 'sebagian')), 333::bigint, 'partial refund always rounds DOWN');

-- user cancel: floor(charge * remains * 50 / (quantity * 100)); only after approval; order becomes dibatalkan
insert into public.orders (id, user_id, service_id, provider_id, link, quantity, charge, remains, status)
  values (900002, '00000000-0000-0000-0000-0000000000a2', 'T1', '00000000-0000-0000-0000-0000000000b1', 'https://x.test/u', 1000, 1000, 600, 'berjalan');
insert into ctx select 'rf3', refund_id::text from public.create_refund_for_order(900002, 'user_cancel', null, 'user_request', 'user', 'minta batal', false);
select is((select status from public.refunds where id = (select v::uuid from ctx where k = 'rf3')), 'menunggu', 'user cancel waits for approval');
select is((select amount from public.refunds where id = (select v::uuid from ctx where k = 'rf3')), 300::bigint, 'user cancel = floor(1000 * 600 * 50% / 1000) = 300');
select throws_ok($$ select * from public.approve_refund((select v::uuid from ctx where k = 'rf3'), '00000000-0000-0000-0000-0000000000a1') $$, 'P0001', 'Hanya admin yang boleh melakukan ini.', 'a non-admin cannot approve');
select is((select status from public.approve_refund((select v::uuid from ctx where k = 'rf3'), '00000000-0000-0000-0000-0000000000ad')), 'selesai', 'admin approves');
select is((select status || ':' || cancelled_by || ':' || cancel_policy_percent from public.orders where id = 900002), 'dibatalkan:user:50', 'order cancelled by user with the policy percent');
select is((select refunded_amount from public.orders where id = 900002), 300::bigint, 'approved amount credited once');
select is((select duplicate from public.approve_refund((select v::uuid from ctx where k = 'rf3'), '00000000-0000-0000-0000-0000000000ad')), true, 'approving twice is a no-op');
select is((select created from public.create_refund_for_order(900002, 'dibatalkan')), false, 'a user-cancelled order never gets the automatic 100% refund');

-- reject
insert into public.orders (id, user_id, service_id, provider_id, link, quantity, charge, remains, status)
  values (900003, '00000000-0000-0000-0000-0000000000a2', 'T1', '00000000-0000-0000-0000-0000000000b1', 'https://x.test/v', 1000, 1000, 1000, 'berjalan');
insert into ctx select 'rf4', refund_id::text from public.create_refund_for_order(900003, 'manual', 500, 'admin', 'x', 'alasan manual cukup', false);
select throws_ok($$ select * from public.reject_refund((select v::uuid from ctx where k = 'rf4'), '00000000-0000-0000-0000-0000000000ad', 'x') $$, 'P0001', 'Alasan penolakan wajib diisi.', 'reject needs a reason');
select is((select status from public.reject_refund((select v::uuid from ctx where k = 'rf4'), '00000000-0000-0000-0000-0000000000ad', 'tidak memenuhi syarat')), 'ditolak', 'reject works');
select throws_ok($$ select * from public.approve_refund((select v::uuid from ctx where k = 'rf4'), '00000000-0000-0000-0000-0000000000ad') $$, 'P0001', 'Refund ini sudah ditolak.', 'a rejected refund cannot be approved');

-- admin_adjust_balance --------------------------------------------------------------------------------------------
select throws_ok($$ select public.admin_adjust_balance('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 1000, 'alasan ok') $$, 'P0001', 'Hanya admin yang boleh melakukan ini.', 'non-admin cannot adjust');
select throws_ok($$ select public.admin_adjust_balance('00000000-0000-0000-0000-0000000000ad', '00000000-0000-0000-0000-0000000000a1', 1000, 'x') $$, 'P0001', 'Alasan minimal 5 karakter.', 'reason required');
select throws_ok($$ select public.admin_adjust_balance('00000000-0000-0000-0000-0000000000ad', '00000000-0000-0000-0000-0000000000a1', 100000001, 'alasan ok') $$, 'P0001', null, 'amount capped at 100 million');
insert into ctx select 'adj', public.admin_adjust_balance('00000000-0000-0000-0000-0000000000ad', '00000000-0000-0000-0000-0000000000a1', 2000, 'koreksi manual')::text;
select is((select v from ctx where k = 'adj'), '7875', 'adjustment returns the new balance (5875 + 2000)');
select is((select count(*)::int from public.audit_logs where action = 'user.balance.adjust' and target_id = '00000000-0000-0000-0000-0000000000a1'), 1, 'audit log written in the same transaction');
select throws_ok($$ select public.admin_adjust_balance('00000000-0000-0000-0000-0000000000ad', '00000000-0000-0000-0000-0000000000a1', -999999, 'potong terlalu besar') $$, 'P0001', 'Saldo tidak cukup.', 'adjustment cannot make the balance negative');
select is((select count(*)::int from public.audit_logs where action = 'user.balance.adjust'), 1, 'failed adjustment left no audit row');

-- rate_limit_hit --------------------------------------------------------------------------------------------------
select is((select allowed from public.rate_limit_hit('t:k', 2, 60)), true, 'hit 1 allowed');
select is((select allowed from public.rate_limit_hit('t:k', 2, 60)), true, 'hit 2 allowed');
select is((select allowed from public.rate_limit_hit('t:k', 2, 60)), false, 'hit 3 blocked');
select ok((select retry_after from public.rate_limit_hit('t:k', 2, 60)) between 1 and 60, 'retry_after within the window');
select lives_ok($$ select public.rate_limit_reset('t:k') $$, 'reset works');
select is((select allowed from public.rate_limit_hit('t:k', 2, 60)), true, 'allowed again after reset');

-- sanity ----------------------------------------------------------------------------------------------------------
select is((select count(*)::int from public.verify_balances()), 0, 'stored balances equal the ledger sums');
select is((select balance_mismatches from public.run_sanity_check()), 0, 'sanity run: no balance mismatches');

-- API roles cannot call money functions ----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$ select * from public.apply_ledger_entry('00000000-0000-0000-0000-0000000000a1', 'deposit', 999999, 'x', 'y') $$, '42501', null, 'authenticated cannot call apply_ledger_entry');
select throws_ok($$ select * from public.place_order('00000000-0000-0000-0000-0000000000a1', 'T1', 'https://x.test/q', 1000) $$, '42501', null, 'authenticated cannot call place_order');
select throws_ok($$ select public.admin_adjust_balance('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 1000, 'alasan ok') $$, '42501', null, 'authenticated cannot call admin_adjust_balance');
reset role;
set local role anon;
select throws_ok($$ select * from public.credit_deposit('E', '00000000-0000-0000-0000-0000000000a1', 1000, 'x') $$, '42501', null, 'anon cannot call credit_deposit');
reset role;

select * from finish();
rollback;
