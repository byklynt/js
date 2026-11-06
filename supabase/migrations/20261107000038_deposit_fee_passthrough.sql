-- Fee pass-through for Paymenku top-ups ("Teruskan biaya ke pelanggan").
-- When the admin turns it on, a deposit on a channel where Paymenku bills the MERCHANT is created with pay_amount = the gross total (base + the channel fee,
-- grossed up so the merchant nets at least the base amount) and fee_amount = total - base. The credited balance (and the deposit bonus) always come from
-- deposits.amount, the BASE amount. Deposits created before the switch keep fee_passthrough = false and are settled by the old rules, unchanged.
--
--  * deposits.fee_passthrough marks the deposits whose fee the app added;
--  * paymenku_settle_deposit(): for those deposits the amount the gateway reports must equal the STORED pay_amount exactly and what reaches the merchant must
--    be at least the base amount (Rp 1 of rounding tolerance); every other rule is unchanged (trx id, sandbox / live, single credit, late payment);
--  * paymenku_flag_deposit(): a payment that does not match (for example the customer paid only the base amount) is never credited; the deposit is flagged
--    "Perlu dicek" with a reason and the admins get an alert (idempotent: the same reason is flagged once);
--  * prod_verify_payments() also reports the new column and function.

alter table public.deposits add column fee_passthrough boolean not null default false;

create or replace function public.paymenku_settle_deposit(
  p_deposit uuid, p_trx text, p_pay_amount bigint, p_fee bigint, p_received bigint, p_paid_at timestamptz,
  p_is_sandbox boolean, p_expect_sandbox boolean, p_by text default 'paymenku'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d public.deposits; v_was text; v_late boolean; v_bonus bigint; v_dup boolean;
begin
  select * into d from public.deposits where id = p_deposit for update;
  if not found then perform public.internal_fail('no_deposit', 'Deposit tidak ditemukan.'); end if;
  if d.gateway is distinct from 'paymenku' then perform public.internal_fail('not_gateway', 'Deposit ini bukan deposit Paymenku.'); end if;
  -- a sandbox transaction must never credit a live deposit and the other way round
  if d.is_sandbox is distinct from p_is_sandbox or p_expect_sandbox is distinct from p_is_sandbox then
    perform public.internal_fail('sandbox_mismatch', 'Mode sandbox / live transaksi tidak cocok dengan deposit.');
  end if;
  if d.external_id is not null and d.external_id <> p_trx then perform public.internal_fail('trx_mismatch', 'ID transaksi tidak cocok dengan deposit ini.'); end if;
  if p_pay_amount is null or p_fee is null or p_received is null or p_fee < 0 then perform public.internal_fail('amount_mismatch', 'Nominal transaksi tidak valid.'); end if;
  if d.fee_passthrough then
    -- we added the fee: the customer paid exactly the stored total, and at least the base amount reached the merchant (Rp 1 for rounding)
    if d.pay_amount is null or p_pay_amount <> d.pay_amount or p_pay_amount < d.amount or p_received < d.amount - 1 or p_received > p_pay_amount then
      perform public.internal_fail('amount_mismatch', 'Nominal transaksi tidak cocok dengan deposit.');
    end if;
  elsif (d.pay_amount is not null and p_pay_amount <> d.pay_amount)
     or p_pay_amount < d.amount or p_pay_amount - d.amount > p_fee
     or p_received > d.amount or p_received < d.amount - p_fee then
    -- what the customer paid is exactly what was quoted; it is the agreed amount plus at most the fee; what reached the merchant is the agreed amount minus at most the fee
    perform public.internal_fail('amount_mismatch', 'Nominal transaksi tidak cocok dengan deposit.');
  end if;
  if d.status = 'berhasil' then return jsonb_build_object('result', 'duplicate', 'late', false); end if;

  v_was := d.status;
  v_late := v_was <> 'menunggu';
  -- the balance (and the bonus tier) come from the BASE amount, never from what the customer paid
  select c.bonus, c.duplicate into v_bonus, v_dup from public.credit_deposit(p_trx, d.user_id, d.amount, d.method, d.id, p_by) c;
  update public.deposits
     set paid_at = coalesce(p_paid_at, now()), gateway_status = 'paid', fee_amount = case when d.fee_passthrough then fee_amount else p_fee end,
         pay_amount = coalesce(pay_amount, p_pay_amount),
         needs_review = needs_review or v_late,
         review_reason = case when v_late then 'Dibayar setelah deposit berstatus ' || v_was || ': dikreditkan satu kali setelah diverifikasi ke Paymenku.' else review_reason end
   where id = d.id;
  insert into public.audit_logs (admin_id, admin_name, action, target_type, target_id, before, after)
  values (null, 'sistem', case when v_late then 'deposit.paymenku_late_credit' else 'deposit.paymenku_credit' end, 'deposit', d.id::text,
          jsonb_build_object('status', v_was), jsonb_build_object('status', 'berhasil', 'trx', p_trx, 'amount', d.amount, 'payAmount', p_pay_amount, 'fee', p_fee, 'feePassthrough', d.fee_passthrough, 'sandbox', p_is_sandbox, 'late', v_late, 'by', p_by));
  if v_late then
    insert into public.admin_alerts (kind, message) values ('deposit_review', 'Deposit ' || public.fmt_rupiah(d.amount) || ' dibayar setelah ' || v_was || ' dan sudah dikreditkan (deposit ' || left(d.id::text, 8) || ').');
  end if;
  return jsonb_build_object('result', case when v_dup then 'duplicate' else 'credited' end, 'late', v_late, 'bonus', coalesce(v_bonus, 0));
end $$;

-- A payment that does not match its deposit is never credited: flag it so an admin looks at it ("Perlu dicek"). Idempotent per reason.
create or replace function public.paymenku_flag_deposit(p_deposit uuid, p_reason text, p_by text default 'paymenku') returns jsonb
language plpgsql security definer set search_path = public as $$
declare d public.deposits; v_reason text := left(coalesce(nullif(trim(p_reason), ''), 'Pembayaran tidak cocok dengan deposit.'), 300);
begin
  select * into d from public.deposits where id = p_deposit for update;
  if not found then perform public.internal_fail('no_deposit', 'Deposit tidak ditemukan.'); end if;
  if d.gateway is distinct from 'paymenku' then perform public.internal_fail('not_gateway', 'Deposit ini bukan deposit Paymenku.'); end if;
  if d.status = 'berhasil' or (d.needs_review and d.review_reason = v_reason) then return jsonb_build_object('result', 'unchanged'); end if;
  update public.deposits set needs_review = true, review_reason = v_reason where id = d.id;
  insert into public.admin_alerts (kind, message) values ('deposit_review', 'Deposit ' || public.fmt_rupiah(d.amount) || ' perlu dicek (deposit ' || left(d.id::text, 8) || '): ' || v_reason);
  insert into public.audit_logs (admin_id, admin_name, action, target_type, target_id, before, after)
  values (null, 'sistem', 'deposit.paymenku_flag', 'deposit', d.id::text, jsonb_build_object('needsReview', d.needs_review), jsonb_build_object('needsReview', true, 'reason', v_reason, 'by', p_by));
  return jsonb_build_object('result', 'flagged');
end $$;

revoke all on function public.paymenku_settle_deposit(uuid, text, bigint, bigint, bigint, timestamptz, boolean, boolean, text),
  public.paymenku_flag_deposit(uuid, text, text) from public, anon, authenticated;
grant execute on function public.paymenku_settle_deposit(uuid, text, bigint, bigint, bigint, timestamptz, boolean, boolean, text),
  public.paymenku_flag_deposit(uuid, text, text) to service_role;

create or replace function public.prod_verify_payments() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  return jsonb_build_object(
    'columns', coalesce((select jsonb_agg(c.column_name::text order by c.column_name) from information_schema.columns c
                          where c.table_schema = 'public' and c.table_name = 'deposits'
                            and c.column_name in ('gateway', 'channel_code', 'pay_amount', 'fee_amount', 'fee_passthrough', 'pay_url', 'payment_info', 'gateway_status', 'expires_at', 'paid_at', 'is_sandbox', 'needs_review', 'review_reason')), '[]'::jsonb),
    'functions', coalesce((select jsonb_object_agg(p.proname, jsonb_build_object('anon', has_function_privilege('anon', p.oid, 'execute'), 'authenticated', has_function_privilege('authenticated', p.oid, 'execute'), 'service', has_function_privilege('service_role', p.oid, 'execute')))
                             from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('paymenku_settle_deposit', 'paymenku_mark_deposit', 'paymenku_flag_deposit', 'credit_deposit')), '{}'::jsonb),
    'statusAllowsCancelled', coalesce((select pg_get_constraintdef(k.oid) like '%dibatalkan%' from pg_constraint k where k.conname = 'deposits_status_check' and k.conrelid = 'public.deposits'::regclass), false),
    'externalIdUnique', exists (select 1 from pg_indexes i where i.schemaname = 'public' and i.tablename = 'deposits' and i.indexdef ilike '%unique%' and i.indexdef ilike '%external_id%'),
    'sandboxCredited', (select count(*) from public.deposits where gateway = 'paymenku' and is_sandbox and status = 'berhasil'),
    'needsReview', (select count(*) from public.deposits where needs_review),
    'pendingGateway', (select count(*) from public.deposits where gateway = 'paymenku' and status = 'menunggu')
  );
end $$;
revoke all on function public.prod_verify_payments() from public, anon, authenticated;
grant execute on function public.prod_verify_payments() to service_role;
