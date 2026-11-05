-- create_refund_for_order: an automatic refund (dibatalkan / sebagian / gagal_kirim) pays only what is STILL owed.
-- Before: a manual refund of exactly the owed amount followed by the sync's automatic refund paid it twice (the cap was only charge).
-- Now: amount = owed - orders.refunded_amount (0 -> nothing created). Same signature, grants are kept by CREATE OR REPLACE.

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
