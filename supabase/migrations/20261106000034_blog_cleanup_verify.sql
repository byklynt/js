-- test_cleanup also removes the blog fixtures of the tests (posts / categories / tags with slug zt-..., images named zt-... in blog-images).
-- prod_verify_blog(): read-only report for npm run prod:verify (service role only): the blog tables, their policies, the storage policies of "blog-images".
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

  -- blog fixtures (slug zt-<marker>...) and the test images they uploaded (name zt-<marker>...)
  delete from public.blog_posts where slug like 'zt-%' and (v_m is null or slug like 'zt-' || v_m || '%');
  get diagnostics n = row_count; v_out := v_out || jsonb_build_object('blog_posts', n);
  delete from public.blog_categories where slug like 'zt-%' and (v_m is null or slug like 'zt-' || v_m || '%');
  get diagnostics n = row_count; v_out := v_out || jsonb_build_object('blog_categories', n);
  delete from public.blog_tags where slug like 'zt-%' and (v_m is null or slug like 'zt-' || v_m || '%');
  get diagnostics n = row_count; v_out := v_out || jsonb_build_object('blog_tags', n);
  delete from storage.objects where bucket_id = 'blog-images' and name like 'zt-%' and (v_m is null or name like 'zt-' || v_m || '%');
  get diagnostics n = row_count; v_out := v_out || jsonb_build_object('blog_images', n);

  alter table public.balance_ledger enable trigger balance_ledger_no_change;
  alter table public.audit_logs enable trigger audit_logs_no_change;
  return v_out;
end $$;


revoke all on function public.test_cleanup(text) from public, anon, authenticated;
grant execute on function public.test_cleanup(text) to service_role;

create or replace function public.prod_verify_blog() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  return jsonb_build_object(
    'tables', coalesce((select jsonb_object_agg(c.relname::text, c.relrowsecurity) from pg_class c
                         where c.relnamespace = 'public'::regnamespace and c.relname in ('blog_posts', 'blog_categories', 'blog_tags', 'blog_post_tags')), '{}'::jsonb),
    'draftPosts', (select count(*) from public.blog_posts where not public.blog_post_is_public(status, published_at)),
    'anonWriteGrants', coalesce((select jsonb_agg(c.relname::text || ':' || p.priv) from pg_class c cross join (values ('insert'), ('update'), ('delete')) p(priv)
                                  where c.relnamespace = 'public'::regnamespace and c.relname in ('blog_posts', 'blog_categories', 'blog_tags', 'blog_post_tags')
                                    and has_table_privilege('anon', c.oid, p.priv)), '[]'::jsonb),
    'bucket', (select jsonb_build_object('public', b.public, 'sizeLimit', b.file_size_limit, 'mimeTypes', b.allowed_mime_types) from storage.buckets b where b.id = 'blog-images'),
    'storagePolicies', coalesce((select jsonb_agg(jsonb_build_object('name', p.policyname, 'cmd', p.cmd, 'roles', p.roles, 'admin', coalesce(p.qual, '') || coalesce(p.with_check, '') like '%is_admin%') order by p.policyname)
                                  from pg_policies p where p.schemaname = 'storage' and p.tablename = 'objects' and (coalesce(p.qual, '') || coalesce(p.with_check, '')) like '%blog-images%'), '[]'::jsonb)
  );
end $$;

revoke all on function public.prod_verify_blog() from public, anon, authenticated;
grant execute on function public.prod_verify_blog() to service_role;
