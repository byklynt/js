-- Fix of 20261106000034: Supabase refuses DELETE on storage.objects from SQL, which made test_cleanup() fail. Storage objects of the tests are removed with the Storage API instead.
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

  -- blog fixtures (slug zt-<marker>...). Test images in the blog-images bucket are removed through the Storage API (scripts/lib/test-cleanup.mjs): SQL deletes on storage tables are blocked.
  delete from public.blog_posts where slug like 'zt-%' and (v_m is null or slug like 'zt-' || v_m || '%');
  get diagnostics n = row_count; v_out := v_out || jsonb_build_object('blog_posts', n);
  delete from public.blog_categories where slug like 'zt-%' and (v_m is null or slug like 'zt-' || v_m || '%');
  get diagnostics n = row_count; v_out := v_out || jsonb_build_object('blog_categories', n);
  delete from public.blog_tags where slug like 'zt-%' and (v_m is null or slug like 'zt-' || v_m || '%');
  get diagnostics n = row_count; v_out := v_out || jsonb_build_object('blog_tags', n);

  alter table public.balance_ledger enable trigger balance_ledger_no_change;
  alter table public.audit_logs enable trigger audit_logs_no_change;
  return v_out;
end $$;


revoke all on function public.test_cleanup(text) from public, anon, authenticated;
grant execute on function public.test_cleanup(text) to service_role;
