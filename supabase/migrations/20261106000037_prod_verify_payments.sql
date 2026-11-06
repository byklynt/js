-- prod_verify_payments(): read-only report for `npm run prod:verify` (service role only): the Paymenku columns, the credit / mark functions and who may run them,
-- and the one thing that must never exist on production: a SANDBOX deposit that was credited.
create or replace function public.prod_verify_payments() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  return jsonb_build_object(
    'columns', coalesce((select jsonb_agg(c.column_name::text order by c.column_name) from information_schema.columns c
                          where c.table_schema = 'public' and c.table_name = 'deposits'
                            and c.column_name in ('gateway', 'channel_code', 'pay_amount', 'fee_amount', 'pay_url', 'payment_info', 'gateway_status', 'expires_at', 'paid_at', 'is_sandbox', 'needs_review', 'review_reason')), '[]'::jsonb),
    'functions', coalesce((select jsonb_object_agg(p.proname, jsonb_build_object('anon', has_function_privilege('anon', p.oid, 'execute'), 'authenticated', has_function_privilege('authenticated', p.oid, 'execute'), 'service', has_function_privilege('service_role', p.oid, 'execute')))
                             from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('paymenku_settle_deposit', 'paymenku_mark_deposit', 'credit_deposit')), '{}'::jsonb),
    'statusAllowsCancelled', coalesce((select pg_get_constraintdef(k.oid) like '%dibatalkan%' from pg_constraint k where k.conname = 'deposits_status_check' and k.conrelid = 'public.deposits'::regclass), false),
    'externalIdUnique', exists (select 1 from pg_indexes i where i.schemaname = 'public' and i.tablename = 'deposits' and i.indexdef ilike '%unique%' and i.indexdef ilike '%external_id%'),
    'sandboxCredited', (select count(*) from public.deposits where gateway = 'paymenku' and is_sandbox and status = 'berhasil'),
    'needsReview', (select count(*) from public.deposits where needs_review),
    'pendingGateway', (select count(*) from public.deposits where gateway = 'paymenku' and status = 'menunggu')
  );
end $$;
revoke all on function public.prod_verify_payments() from public, anon, authenticated;
grant execute on function public.prod_verify_payments() to service_role;
