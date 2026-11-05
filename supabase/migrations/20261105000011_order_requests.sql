-- User cancel request, resubmit of a failed order, and the order status transition used by the sync.
-- Same conventions as migration 7: SECURITY DEFINER, search_path pinned, service_role only, errors P0001 + hint.

-- A USER-requested ("forced") cancellation. Not automatic: it creates a cancel request plus a waiting refund (reason
-- user_cancel) for the admin queue, with the numbers needed to decide. Approving applies the policy (approve_refund).
create or replace function public.request_cancel(p_user uuid, p_order bigint)
returns table (request_id uuid, refund_id uuid, calculated_refund bigint)
language plpgsql security definer set search_path = public as $$
declare o public.orders; svc public.services; v_min_age int; v_percent int; v_age numeric; v_cr uuid; v_rf record; v_calc bigint;
begin
  select * into o from public.orders where id = p_order and user_id = p_user for update;
  if not found then perform public.internal_fail('no_order', 'Pesanan tidak ditemukan.'); end if;
  select * into svc from public.services where id = o.service_id;
  if not coalesce(svc.cancel, false) then perform public.internal_fail('not_eligible', 'Layanan ini tidak mendukung pembatalan.'); end if;
  if o.status not in ('menunggu', 'diproses', 'berjalan') then
    perform public.internal_fail('not_eligible', 'Pesanan yang sudah selesai tidak bisa dibatalkan.');
  end if;
  if exists (select 1 from public.cancel_requests c where c.order_id = o.id and c.status in ('menunggu', 'berjalan')) then
    perform public.internal_fail('not_eligible', 'Permintaan pembatalan sebelumnya masih diproses.');
  end if;
  v_min_age := coalesce((select (data #>> '{cancelPolicy,minAgeHours}')::int from public.site_settings), 72);
  v_percent := coalesce((select (data #>> '{cancelPolicy,refundPercent}')::int from public.site_settings), 50);
  v_age := extract(epoch from (now() - o.created_at)) / 3600;
  if v_age < v_min_age then perform public.internal_fail('not_eligible', 'Pembatalan belum bisa diajukan.'); end if;

  v_calc := greatest(0, least((o.charge * least(greatest(o.remains, 0), o.quantity) * v_percent) / (o.quantity::bigint * 100), o.charge - o.refunded_amount));
  insert into public.cancel_requests (order_id, user_id, status, age_hours, remains_at_request, calculated_refund, policy_percent)
  values (o.id, p_user, 'menunggu', floor(v_age)::int, o.remains, v_calc, v_percent) returning id into v_cr;

  select * into v_rf from public.create_refund_for_order(o.id, 'user_cancel', v_calc, 'user_request', p_user::text,
    format('Pembatalan oleh pengguna: usia %s jam, sisa %s dari %s.', floor(v_age)::int, o.remains, o.quantity), false, v_percent, v_cr);
  if v_rf.refund_id is null then
    perform public.internal_fail('nothing_to_refund', 'Tidak ada bagian yang belum terkirim untuk dibatalkan.');
  end if;
  perform public.internal_audit(null, 'order.cancel_request', 'order', o.id::text, null,
    jsonb_build_object('requestId', v_cr, 'calculatedRefund', v_calc, 'policyPercent', v_percent));
  request_id := v_cr; refund_id := v_rf.refund_id; calculated_refund := v_calc;
  return next;
end $$;

-- Admin sends a gagal_kirim order again: the earlier refund is reversed and the user is charged again, in ONE transaction.
create or replace function public.resubmit_failed_order(p_order bigint, p_admin uuid) returns bigint
language plpgsql security definer set search_path = public as $$
declare o public.orders; r public.refunds; v_led record;
begin
  perform public.internal_require_admin(p_admin);
  select * into o from public.orders where id = p_order for update;
  if not found then perform public.internal_fail('no_order', 'Pesanan tidak ditemukan.'); end if;
  if o.status <> 'gagal_kirim' then perform public.internal_fail('bad_status', 'Hanya pesanan gagal kirim yang bisa dikirim ulang.'); end if;
  select * into r from public.refunds where order_id = o.id and reason = 'gagal_kirim' and status = 'selesai' and not reversed for update;
  if found then
    select * into v_led from public.apply_ledger_entry(o.user_id, 'order', -r.amount, 'resubmit', o.id || ':' || o.submit_attempts || ':' || r.id,
      'Kirim ulang pesanan #' || o.id, p_admin::text);
    update public.refunds set reversed = true where id = r.id;
    update public.orders set refunded_amount = greatest(0, refunded_amount - r.amount) where id = o.id;
  end if;
  update public.orders set status = 'menunggu', submit_attempts = 0, needs_manual_check = false where id = o.id;
  perform public.internal_audit(p_admin, 'order.resubmit', 'order', o.id::text, jsonb_build_object('status', 'gagal_kirim'), jsonb_build_object('status', 'menunggu'));
  return o.id;
end $$;

revoke all on function public.request_cancel(uuid, bigint), public.resubmit_failed_order(bigint, uuid) from public, anon, authenticated;
grant execute on function public.request_cancel(uuid, bigint), public.resubmit_failed_order(bigint, uuid) to service_role;
