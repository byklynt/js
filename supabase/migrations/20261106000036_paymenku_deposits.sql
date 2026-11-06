-- Paymenku payment gateway for top-ups. Adapts the existing deposits flow instead of creating a parallel one:
--  * deposits keeps its statuses (+ 'dibatalkan'), external_id (= the gateway trx_id, UNIQUE) and credit_deposit() (ledger type 'deposit',
--    ref_type 'deposit', ref_id = deposit id: UNIQUE(type, ref_type, ref_id) makes a second credit impossible);
--  * new columns hold the gateway data (channel, what the customer pays, fee, pay_url, payment_info, expiry, sandbox flag, review flag);
--  * paymenku_settle_deposit() is the ONLY gateway path that credits: one transaction, row lock, amount / sandbox / transaction checks, then credit_deposit();
--  * paymenku_mark_deposit() moves a pending deposit to failed / expired / cancelled, and FLAGS a paid deposit the gateway later refunded (no balance change);
--  * run_sanity_check() also compares deposits with the ledger.
-- Late payments (policy): a payment that the gateway confirms AFTER we marked the deposit expired / cancelled / failed is credited ONCE, only after the server
-- re-fetched the transaction from Paymenku and every check passed; the deposit is flagged "needs review" and the credit is logged.

alter table public.deposits
  add column gateway         text check (gateway is null or gateway = 'paymenku'),
  add column channel_code    text,
  add column pay_amount      bigint check (pay_amount is null or pay_amount > 0),
  add column fee_amount      bigint not null default 0 check (fee_amount >= 0),
  add column pay_url         text,
  add column payment_info    jsonb,
  add column gateway_status  text,
  add column expires_at      timestamptz,
  add column paid_at         timestamptz,
  add column is_sandbox      boolean,
  add column needs_review    boolean not null default false,
  add column review_reason   text;

alter table public.deposits drop constraint deposits_status_check;
alter table public.deposits add constraint deposits_status_check check (status in ('menunggu', 'berhasil', 'gagal', 'kedaluwarsa', 'dibatalkan'));
create index deposits_gateway_pending_idx on public.deposits (created_at) where gateway = 'paymenku' and status = 'menunggu';
create index deposits_review_idx on public.deposits (created_at desc) where needs_review;

-- A deposit that was credited needs its ledger entry: the sanity check counts the exceptions.
alter table public.sanity_runs add column deposit_mismatches int not null default 0;

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
  -- what the customer paid is exactly what was quoted; it is the agreed amount plus at most the fee; what reached the merchant is the agreed amount minus at most the fee
  if (d.pay_amount is not null and p_pay_amount <> d.pay_amount)
     or p_pay_amount < d.amount or p_pay_amount - d.amount > p_fee
     or p_received > d.amount or p_received < d.amount - p_fee then
    perform public.internal_fail('amount_mismatch', 'Nominal transaksi tidak cocok dengan deposit.');
  end if;
  if d.status = 'berhasil' then return jsonb_build_object('result', 'duplicate', 'late', false); end if;

  v_was := d.status;
  v_late := v_was <> 'menunggu';
  select c.bonus, c.duplicate into v_bonus, v_dup from public.credit_deposit(p_trx, d.user_id, d.amount, d.method, d.id, p_by) c;
  update public.deposits
     set paid_at = coalesce(p_paid_at, now()), gateway_status = 'paid', fee_amount = p_fee, pay_amount = coalesce(pay_amount, p_pay_amount),
         needs_review = needs_review or v_late,
         review_reason = case when v_late then 'Dibayar setelah deposit berstatus ' || v_was || ': dikreditkan satu kali setelah diverifikasi ke Paymenku.' else review_reason end
   where id = d.id;
  insert into public.audit_logs (admin_id, admin_name, action, target_type, target_id, before, after)
  values (null, 'sistem', case when v_late then 'deposit.paymenku_late_credit' else 'deposit.paymenku_credit' end, 'deposit', d.id::text,
          jsonb_build_object('status', v_was), jsonb_build_object('status', 'berhasil', 'trx', p_trx, 'amount', d.amount, 'payAmount', p_pay_amount, 'fee', p_fee, 'sandbox', p_is_sandbox, 'late', v_late, 'by', p_by));
  if v_late then
    insert into public.admin_alerts (kind, message) values ('deposit_review', 'Deposit ' || public.fmt_rupiah(d.amount) || ' dibayar setelah ' || v_was || ' dan sudah dikreditkan (deposit ' || left(d.id::text, 8) || ').');
  end if;
  return jsonb_build_object('result', case when v_dup then 'duplicate' else 'credited' end, 'late', v_late, 'bonus', coalesce(v_bonus, 0));
end $$;

create or replace function public.paymenku_mark_deposit(p_deposit uuid, p_gateway_status text, p_by text default 'paymenku') returns jsonb
language plpgsql security definer set search_path = public as $$
declare d public.deposits; v_to text;
begin
  select * into d from public.deposits where id = p_deposit for update;
  if not found then perform public.internal_fail('no_deposit', 'Deposit tidak ditemukan.'); end if;
  if d.gateway is distinct from 'paymenku' then perform public.internal_fail('not_gateway', 'Deposit ini bukan deposit Paymenku.'); end if;

  -- a paid deposit the gateway later refunded: never touch the balance, flag it for an admin
  if d.status = 'berhasil' then
    if p_gateway_status = 'refunded' and not d.needs_review then
      update public.deposits set needs_review = true, gateway_status = 'refunded', review_reason = 'Paymenku melaporkan refund setelah saldo dikreditkan. Tinjau manual: saldo tidak diubah otomatis.' where id = d.id;
      insert into public.admin_alerts (kind, message) values ('deposit_review', 'Deposit ' || public.fmt_rupiah(d.amount) || ' di-refund di Paymenku setelah dikreditkan (deposit ' || left(d.id::text, 8) || '). Tinjau manual.');
      insert into public.audit_logs (admin_id, admin_name, action, target_type, target_id, before, after)
      values (null, 'sistem', 'deposit.paymenku_refund_flag', 'deposit', d.id::text, jsonb_build_object('status', 'berhasil'), jsonb_build_object('gatewayStatus', 'refunded', 'by', p_by));
      return jsonb_build_object('result', 'flagged');
    end if;
    return jsonb_build_object('result', 'unchanged');
  end if;

  v_to := case p_gateway_status when 'expired' then 'kedaluwarsa' when 'failed' then 'gagal' when 'cancelled' then 'dibatalkan' else null end;
  if v_to is null or d.status <> 'menunggu' then
    update public.deposits set gateway_status = coalesce(p_gateway_status, gateway_status) where id = d.id and gateway_status is distinct from p_gateway_status;
    return jsonb_build_object('result', 'unchanged');
  end if;
  update public.deposits set status = v_to, gateway_status = p_gateway_status where id = d.id;
  insert into public.audit_logs (admin_id, admin_name, action, target_type, target_id, before, after)
  values (null, 'sistem', 'deposit.paymenku_' || v_to, 'deposit', d.id::text, jsonb_build_object('status', 'menunggu'), jsonb_build_object('status', v_to, 'gatewayStatus', p_gateway_status, 'by', p_by));
  perform public.internal_notify(d.user_id, 'deposit', 'Deposit ' || public.fmt_rupiah(d.amount) || ' ' || v_to,
    case v_to when 'kedaluwarsa' then 'Batas waktu pembayaran habis. Buat deposit baru bila masih ingin menambah saldo.'
              when 'dibatalkan' then 'Deposit dibatalkan.' else 'Pembayaran gagal. Buat deposit baru atau hubungi support.' end,
    '/dashboard/add-funds', 'deposit:' || d.id || ':' || v_to);
  return jsonb_build_object('result', 'changed', 'status', v_to);
end $$;

-- Sanity: deposits against the ledger (credited deposits need exactly one ledger entry of their amount; every deposit ledger entry needs a credited deposit).
create or replace function public.run_sanity_check() returns public.sanity_runs
language plpgsql security definer set search_path = public as $$
declare r public.sanity_runs; v_bal int; v_ref int; v_stuck int; v_hours int; v_dep int;
begin
  select count(*) into v_bal from public.verify_balances();
  select count(*) into v_ref from public.orders o
   where not o.needs_manual_check and (
        (o.status in ('dibatalkan', 'gagal_kirim') and coalesce(o.cancelled_by, '') <> 'user' and o.refunded_amount <> o.charge)
     or (o.status = 'sebagian' and o.refunded_amount <> least(o.charge, (o.charge * least(greatest(o.remains, 0), o.quantity)) / o.quantity)));
  v_hours := coalesce((select (data #>> '{operations,stuckHours}')::int from public.site_settings), 24);
  select count(*) into v_stuck from public.orders where status in ('menunggu', 'diproses', 'berjalan') and created_at < now() - make_interval(hours => v_hours);
  select (select count(*) from public.deposits d where d.status = 'berhasil'
            and not exists (select 1 from public.balance_ledger l where l.type = 'deposit' and l.ref_type = 'deposit' and l.ref_id = d.id::text and l.amount = d.amount))
       + (select count(*) from public.balance_ledger l where l.type = 'deposit' and l.ref_type = 'deposit'
            and not exists (select 1 from public.deposits d where d.id::text = l.ref_id and d.status = 'berhasil'))
    into v_dep;
  insert into public.sanity_runs (balance_mismatches, refund_mismatches, deposit_mismatches, discrepancies, stuck)
  values (v_bal, v_ref, v_dep, v_bal + v_ref + v_dep, v_stuck) returning * into r;
  return r;
end $$;

revoke all on function public.paymenku_settle_deposit(uuid, text, bigint, bigint, bigint, timestamptz, boolean, boolean, text),
  public.paymenku_mark_deposit(uuid, text, text) from public, anon, authenticated;
grant execute on function public.paymenku_settle_deposit(uuid, text, bigint, bigint, bigint, timestamptz, boolean, boolean, text),
  public.paymenku_mark_deposit(uuid, text, text) to service_role;
