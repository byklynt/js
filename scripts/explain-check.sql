-- Index verification: loads synthetic volume INSIDE a transaction, EXPLAINs the hot queries, and ALWAYS rolls back (it ends in an exception
-- whose message is the report). Run: npx supabase db query --remote --file scripts/explain-check.sql --yes
begin;
do $$
declare plans text := ''; r record; u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); u3 uuid := gen_random_uuid(); prov uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id)
  select x, 'ex_' || x || '@jagoansosmed-test.invalid', jsonb_build_object('username', 'ex_' || substr(x::text, 1, 8)), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'
    from unnest(array[u1, u2, u3]) x;
  insert into public.providers (id, name, slug) values (prov, 'EX', 'ex-' || substr(prov::text, 1, 8));
  insert into public.service_categories (id, label, platform) select 'ex-cat-' || g, 'Kategori ' || g, 'instagram' from generate_series(1, 40) g;
  insert into public.services (id, provider_id, provider_service_id, category_id, name, platform, provider_price, price_per_1000, active, imported)
    select 'EX' || g, prov, g::text, 'ex-cat-' || (1 + g % 40), 'Instagram ' || (case when g % 3 = 0 then 'Likes' when g % 3 = 1 then 'Followers' else 'Views' end) || ' Premium ' || g, 'instagram', 500, 600 + g % 900, true, true
    from generate_series(1, 5000) g;
  insert into public.orders (user_id, service_id, provider_id, link, quantity, charge, status, created_at)
    select (array[u1, u2, u3])[1 + g % 3], 'EX' || (1 + g % 5000), prov, 'https://x.test/' || g, 100, 700, (array['menunggu','selesai','berjalan','selesai'])[1 + g % 4], now() - (g || ' seconds')::interval
    from generate_series(1, 60000) g;
  insert into public.balance_ledger (user_id, type, amount, balance_before, balance_after, ref_type, ref_id)
    select (array[u1, u2, u3])[1 + g % 3], 'deposit', 1, 0, 1, 'ex', g::text from generate_series(1, 60000) g;
  insert into public.notifications (user_id, type, title, read_at, created_at)
    select (array[u1, u2, u3])[1 + g % 3], 'sistem', 't' || g, case when g % 50 = 0 then null else now() end, now() - (g || ' seconds')::interval from generate_series(1, 60000) g;
  analyze public.orders; analyze public.balance_ledger; analyze public.notifications; analyze public.services;

  for r in execute format($q$explain (analyze, costs off, timing off, summary off) select id, status from public.orders where user_id = %L order by created_at desc limit 20$q$, u1) loop plans := plans || E'\n' || r."QUERY PLAN"; end loop;
  plans := plans || E'\n----';
  for r in execute format($q$explain (analyze, costs off, timing off, summary off) select * from public.balance_ledger where user_id = %L order by created_at desc limit 50$q$, u1) loop plans := plans || E'\n' || r."QUERY PLAN"; end loop;
  plans := plans || E'\n----';
  for r in execute format($q$explain (analyze, costs off, timing off, summary off) select count(*) from public.notifications where user_id = %L and read_at is null$q$, u1) loop plans := plans || E'\n' || r."QUERY PLAN"; end loop;
  plans := plans || E'\n----';
  for r in execute $q$explain (analyze, costs off, timing off, summary off) select id from public.services where name ilike '%premium 49%'$q$ loop plans := plans || E'\n' || r."QUERY PLAN"; end loop;
  plans := plans || E'\n----';
  for r in execute $q$explain (analyze, costs off, timing off, summary off) select * from public.catalogue_page('ex-cat-7', null, null, 'id-asc', null, null, null, null, 0, 20)$q$ loop plans := plans || E'\n' || r."QUERY PLAN"; end loop;
  plans := plans || E'\n----';
  for r in execute $q$explain (analyze, costs off, timing off, summary off) select * from public.catalogue_page(null, null, 'premium likes 12', 'termurah', null, null, null, null, 0, 20)$q$ loop plans := plans || E'\n' || r."QUERY PLAN"; end loop;
  raise exception E'EXPLAIN-REPORT%', plans;
end $$;
rollback;
