-- Moderation: an admin can cancel an order for a policy violation WITHOUT a refund.
-- * orders.cancelled_by gets the value 'admin'; orders.violation_reason keeps the picked reason (+ note).
-- * admin_cancel_order_violation(): one transaction: cancel, close pending cancel requests and waiting refunds, notify the user
--   (generic text), audit. It creates NO ledger entry, so the ledger stays equal to the balances.
-- * create_refund_for_order(): an AUTOMATIC refund is never created for such an order (the sync cannot repay it when the provider
--   later reports Canceled). Manual refunds by an admin still work.
-- * run_sanity_check() and admin_dashboard(): such an order is not a "refund mismatch" (nothing is owed).
alter table public.orders drop constraint orders_cancelled_by_check;
alter table public.orders add constraint orders_cancelled_by_check check (cancelled_by in ('user', 'provider', 'admin'));
alter table public.orders add column violation_reason text;

create or replace function public.create_refund_for_order(
  p_order bigint, p_reason text, p_amount bigint default null, p_source text default 'auto', p_by text default 'system',
  p_note text default null, p_settle boolean default true, p_policy_percent int default null, p_cancel_request uuid default null
) returns table (refund_id uuid, amount bigint, status text, created boolean)
language plpgsql security definer set search_path = public as $$
declare o public.orders; prof public.profiles; existing public.refunds; r public.refunds; v_amount bigint; v_remaining bigint; v_rem bigint; v_percent int;
begin
  if p_reason not in ('dibatalkan', 'sebagian', 'gagal_kirim', 'manual', 'user_cancel') then perform public.internal_fail('bad_reason', 'Alasan refund tidak valid.'); end if;
  if p_source not in ('auto', 'admin', 'user_request') then perform public.internal_fail('bad_source', 'Sumber refund tidak valid.'); end if;

  select * into o from public.orders where id = p_order for update;               -- serialises concurrent refunds of one order
  if not found then perform public.internal_fail('no_order', 'Pesanan tidak ditemukan.'); end if;
  select * into prof from public.profiles where id = o.user_id;
  v_remaining := o.charge - o.refunded_amount;

  if p_reason <> 'manual' then
    select * into existing from public.refunds f
     where f.order_id = o.id and f.reason = p_reason and not f.reversed and f.status <> 'ditolak';
    if found then
      refund_id := existing.id; amount := existing.amount; status := existing.status; created := false; return next; return;
    end if;
  end if;

  -- An order an admin cancelled for a policy violation never gets an AUTOMATIC refund (the sync must not repay it when the provider
  -- later reports Canceled). An admin can still refund explicitly (manual / approve).
  if p_source = 'auto' and o.cancelled_by = 'admin' then
    refund_id := null; amount := 0; status := null; created := false; return next; return;
  end if;

  -- A cancellation the USER asked for never gets the automatic 100% refund: it goes through approve_refund + the policy.
  if p_source = 'auto' and p_reason = 'dibatalkan' and o.cancelled_by = 'user' then
    refund_id := null; amount := 0; status := null; created := false; return next; return;
  end if;

  v_rem := least(greatest(o.remains, 0), o.quantity);
  v_percent := coalesce(p_policy_percent, (select (data #>> '{cancelPolicy,refundPercent}')::int from public.site_settings), 50);
  if p_amount is not null then
    v_amount := p_amount;
    if v_amount <= 0 then perform public.internal_fail('bad_amount', 'Nominal refund harus lebih dari nol.'); end if;
    if v_amount > v_remaining then
      perform public.internal_fail('refund_exceeds_charge', 'Refund melebihi sisa yang bisa dikembalikan (' || public.fmt_rupiah(v_remaining) || ').');
    end if;
  else
    v_amount := case p_reason
      when 'dibatalkan' then o.charge
      when 'gagal_kirim' then o.charge
      when 'sebagian' then (o.charge * v_rem) / o.quantity                        -- bigint division floors
      when 'user_cancel' then (o.charge * v_rem * v_percent) / (o.quantity::bigint * 100)
      else null end;
    if v_amount is null then perform public.internal_fail('bad_amount', 'Nominal refund wajib diisi untuk refund manual.'); end if;
    -- What an earlier (e.g. manual) refund already paid out counts toward what the order owes: owed - refunded so far, never a second full refund.
    if p_reason in ('dibatalkan', 'sebagian', 'gagal_kirim') then v_amount := v_amount - o.refunded_amount; end if;
    v_amount := least(v_amount, v_remaining);
    if v_amount <= 0 then refund_id := null; amount := 0; status := null; created := false; return next; return; end if;
  end if;

  if p_reason = 'manual' then
    if length(btrim(coalesce(p_note, ''))) < 10 then perform public.internal_fail('note_too_short', 'Alasan minimal 10 karakter.'); end if;
    if exists (select 1 from public.refunds f where f.order_id = o.id and f.reason = 'manual' and f.status = 'menunggu') then
      perform public.internal_fail('refund_pending', 'Masih ada refund manual yang menunggu untuk pesanan ini.');
    end if;
  end if;

  begin
    insert into public.refunds (order_id, user_id, amount, reason, source, status, note, policy_percent, cancel_request_id)
    values (o.id, o.user_id, v_amount, p_reason, p_source, 'menunggu', p_note,
            case when p_reason = 'user_cancel' then v_percent end, p_cancel_request)
    returning * into r;
  exception when unique_violation then
    select * into existing from public.refunds f where f.order_id = o.id and f.reason = p_reason and not f.reversed and f.status <> 'ditolak';
    refund_id := existing.id; amount := existing.amount; status := existing.status; created := false; return next; return;
  end;

  -- Auto refunds of users under review wait for an admin; everything else settles now when asked to.
  if p_settle and not (p_source = 'auto' and prof.manual_approval) then
    r := public.internal_settle_refund(r.id, p_by);
    if p_source = 'auto' then
      perform public.internal_audit(null, 'refund.auto', 'refund', r.id::text, null, jsonb_build_object('orderId', o.id, 'amount', v_amount, 'reason', p_reason));
    end if;
  elsif p_source = 'auto' then
    perform public.internal_audit(null, 'refund.auto_held', 'refund', r.id::text, null, jsonb_build_object('orderId', o.id, 'amount', v_amount));
  end if;

  refund_id := r.id; amount := r.amount; status := r.status; created := true;
  return next;
end $$;

create or replace function public.run_sanity_check() returns public.sanity_runs
language plpgsql security definer set search_path = public as $$
declare r public.sanity_runs; v_bal int; v_ref int; v_stuck int; v_hours int;
begin
  select count(*) into v_bal from public.verify_balances();
  -- Orders in a refundable final status whose refunded amount differs from the calculated refund (user-cancel orders excluded).
  select count(*) into v_ref from public.orders o
   where not o.needs_manual_check and (
        (o.status in ('dibatalkan', 'gagal_kirim') and coalesce(o.cancelled_by, '') not in ('user', 'admin') and o.refunded_amount <> o.charge)
     or (o.status = 'sebagian' and o.refunded_amount <> least(o.charge, (o.charge * least(greatest(o.remains, 0), o.quantity)) / o.quantity)));
  v_hours := coalesce((select (data #>> '{operations,stuckHours}')::int from public.site_settings), 24);
  select count(*) into v_stuck from public.orders where status in ('menunggu', 'diproses', 'berjalan') and created_at < now() - make_interval(hours => v_hours);
  insert into public.sanity_runs (balance_mismatches, refund_mismatches, discrepancies, stuck)
  values (v_bal, v_ref, v_bal + v_ref, v_stuck) returning * into r;
  return r;
end $$;

create or replace function public.admin_dashboard(p_tz text default 'Asia/Jakarta') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  today date := (now() at time zone p_tz)::date;
  stuck_hours int := coalesce((select (data #>> '{operations,stuckHours}')::int from public.site_settings), 24);
  min_margin numeric := coalesce((select (data #>> '{pricing,minMarginPercent}')::numeric from public.site_settings), 5);
  risk_ratio numeric := coalesce((select (data #>> '{risk,ratioPercent}')::numeric from public.site_settings), 50);
  risk_min int := coalesce((select (data #>> '{risk,minOrders}')::int from public.site_settings), 5);
  hari jsonb; s7 jsonb; s30 jsonb; plat jsonb;
begin
  select jsonb_agg(jsonb_build_object('label', lpad((b * 2)::text, 2, '0') || '.00',
      'value', coalesce((select sum(amount) from public.deposits d where d.status = 'berhasil' and (d.created_at at time zone p_tz)::date = today
                          and extract(hour from d.created_at at time zone p_tz) >= b * 2 and extract(hour from d.created_at at time zone p_tz) < b * 2 + 2), 0),
      'profit', coalesce((select sum(o.charge - public.effective_provider_cost(o.status, o.provider_cost, o.quantity, o.remains) - o.refunded_amount) from public.orders o
                          where (o.created_at at time zone p_tz)::date = today and extract(hour from o.created_at at time zone p_tz) >= b * 2 and extract(hour from o.created_at at time zone p_tz) < b * 2 + 2), 0)) order by b)
    into hari from generate_series(0, 11) b;
  select jsonb_agg(jsonb_build_object('label', extract(day from dd)::int || '/' || extract(month from dd)::int,
      'value', coalesce((select sum(amount) from public.deposits d where d.status = 'berhasil' and (d.created_at at time zone p_tz)::date = dd), 0),
      'profit', coalesce((select sum(o.charge - public.effective_provider_cost(o.status, o.provider_cost, o.quantity, o.remains) - o.refunded_amount) from public.orders o where (o.created_at at time zone p_tz)::date = dd), 0)) order by dd)
    into s7 from generate_series(today - 6, today, interval '1 day') dd;
  select jsonb_agg(jsonb_build_object('label', extract(day from dd)::int || '/' || extract(month from dd)::int,
      'value', coalesce((select sum(amount) from public.deposits d where d.status = 'berhasil' and (d.created_at at time zone p_tz)::date = dd), 0),
      'profit', coalesce((select sum(o.charge - public.effective_provider_cost(o.status, o.provider_cost, o.quantity, o.remains) - o.refunded_amount) from public.orders o where (o.created_at at time zone p_tz)::date = dd), 0)) order by dd)
    into s30 from generate_series(today - 29, today, interval '1 day') dd;
  select jsonb_build_object(
    'hari', coalesce((select jsonb_agg(jsonb_build_object('platform', platform, 'value', c) order by c desc) from (select s.platform, count(*) c from public.orders o join public.services s on s.id = o.service_id where (o.created_at at time zone p_tz)::date = today group by 1) x), '[]'::jsonb),
    '7', coalesce((select jsonb_agg(jsonb_build_object('platform', platform, 'value', c) order by c desc) from (select s.platform, count(*) c from public.orders o join public.services s on s.id = o.service_id where (o.created_at at time zone p_tz)::date >= today - 6 group by 1) x), '[]'::jsonb),
    '30', coalesce((select jsonb_agg(jsonb_build_object('platform', platform, 'value', c) order by c desc) from (select s.platform, count(*) c from public.orders o join public.services s on s.id = o.service_id where (o.created_at at time zone p_tz)::date >= today - 29 group by 1) x), '[]'::jsonb))
    into plat;

  return jsonb_build_object(
    'revenueToday', coalesce((select sum(amount) from public.deposits where status = 'berhasil' and (created_at at time zone p_tz)::date = today), 0),
    'ordersToday', (select count(*) from public.orders where (created_at at time zone p_tz)::date = today),
    'newUsers', (select count(*) from public.profiles where role <> 'admin' and (created_at at time zone p_tz)::date = today),
    'pendingTickets', (select count(*) from public.tickets where status = 'menunggu'),
    'pendingDeposits', (select count(*) from public.deposits where status = 'menunggu'),
    'financeRevenue', coalesce((select sum(charge) from public.orders where (created_at at time zone p_tz)::date = today), 0),
    'financeCost', coalesce((select sum(public.effective_provider_cost(status, provider_cost, quantity, remains)) from public.orders where (created_at at time zone p_tz)::date = today), 0),
    'financeRefunds', coalesce((select sum(amount) from public.refunds where status = 'selesai' and not reversed and (processed_at at time zone p_tz)::date = today), 0),
    'seriesHari', hari, 'series7', s7, 'series30', s30, 'platforms', plat,
    'stuck', (select count(*) from public.orders where status in ('menunggu', 'diproses', 'berjalan') and created_at < now() - make_interval(hours => stuck_hours)),
    'stuckNoProvider', (select count(*) from public.orders where status in ('menunggu', 'diproses', 'berjalan') and created_at < now() - make_interval(hours => stuck_hours) and provider_order_id = ''),
    'thinMargin', (select count(*) from public.services where active and price_per_1000 > 0 and round(((price_per_1000 - provider_price)::numeric * 100 / price_per_1000), 1) < min_margin),
    'flaggedUsers', (select count(*) from (
        select o.user_id, count(*) as n,
               count(*) filter (where o.status in ('dibatalkan', 'sebagian')) + coalesce((select count(*) from public.refunds r where r.user_id = o.user_id and r.source = 'user_request'), 0) as probs
          from public.orders o group by o.user_id) x where x.n >= risk_min and round(x.probs * 100.0 / x.n, 1) > risk_ratio),
    'refundMismatches', (select count(*) from public.orders o where not o.needs_manual_check and (
        (o.status in ('dibatalkan', 'gagal_kirim') and coalesce(o.cancelled_by, '') not in ('user', 'admin') and o.refunded_amount <> o.charge)
     or (o.status = 'sebagian' and o.refunded_amount <> least(o.charge, (o.charge * least(greatest(o.remains, 0), o.quantity)) / o.quantity)))),
    'failedOrders', coalesce((select jsonb_agg(jsonb_build_object('id', o.id::text, 'username', p.username, 'charge', o.charge)) from (
        select * from public.orders where status = 'gagal_kirim' order by id desc limit 20) o join public.profiles p on p.id = o.user_id), '[]'::jsonb),
    'activeByProvider', coalesce((select jsonb_agg(distinct provider_id) from public.orders where status in ('menunggu', 'diproses', 'berjalan')), '[]'::jsonb),
    'importedServices', (select count(*) from public.services where imported)
  );
end $$;

create or replace function public.admin_cancel_order_violation(p_order bigint, p_admin uuid, p_reason text, p_note text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare o public.orders; v_reason text := btrim(coalesce(p_reason, '')); v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  perform public.internal_require_admin(p_admin);
  if length(v_reason) < 3 or length(v_reason) > 100 then perform public.internal_fail('bad_reason', 'Pilih alasan pembatalan.'); end if;
  if v_note is not null and length(v_note) > 300 then perform public.internal_fail('bad_note', 'Catatan maksimal 300 karakter.'); end if;
  select * into o from public.orders where id = p_order for update;
  if not found then perform public.internal_fail('no_order', 'Pesanan tidak ditemukan.'); end if;
  if o.status not in ('menunggu', 'diproses', 'berjalan') then
    perform public.internal_fail('not_cancellable', 'Pesanan sudah selesai atau dibatalkan, jadi tidak bisa dibatalkan karena pelanggaran.');
  end if;

  update public.orders set status = 'dibatalkan', cancelled_by = 'admin', violation_reason = v_reason, held = false,
         needs_manual_check = false, completed_at = now() where id = o.id;
  -- Whatever the user had asked for on this order is moot now.
  update public.refunds set status = 'ditolak', reject_reason = 'Pesanan dibatalkan karena pelanggaran ketentuan layanan.', processed_at = now()
   where order_id = o.id and status = 'menunggu';
  update public.cancel_requests set status = 'ditolak', reject_reason = 'Pesanan dibatalkan karena pelanggaran ketentuan layanan.'
   where order_id = o.id and status in ('menunggu', 'berjalan');

  perform public.internal_notify(o.user_id, 'pesanan', 'Pesanan #' || o.id || ' dibatalkan',
    'Pesananmu dibatalkan karena melanggar ketentuan layanan.', '/dashboard/orders?search=' || o.id, 'order:' || o.id || ':violation');
  perform public.internal_audit(p_admin, 'order.cancel_violation', 'order', o.id::text,
    jsonb_build_object('status', o.status),
    jsonb_build_object('status', 'dibatalkan', 'cancelledBy', 'admin', 'reason', v_reason, 'note', v_note, 'refund', 0, 'charge', o.charge));
  return o.id;
end $$;

revoke all on function public.admin_cancel_order_violation(bigint, uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_cancel_order_violation(bigint, uuid, text, text) to service_role;
