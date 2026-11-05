-- Per-user dashboard numbers in one indexed query, plus a lint fix for resubmit_failed_order (unused variable).

create or replace function public.user_stats(p_user uuid)
returns table (balance bigint, total_orders bigint, total_spent bigint, rank text)
language sql stable security definer set search_path = public as $$
  select p.balance,
         (select count(*) from public.orders o where o.user_id = p.id),
         coalesce((select sum(o.charge) from public.orders o where o.user_id = p.id), 0)::bigint,
         p.rank
    from public.profiles p where p.id = p_user;
$$;
revoke all on function public.user_stats(uuid) from public, anon, authenticated;
grant execute on function public.user_stats(uuid) to service_role;

create or replace function public.resubmit_failed_order(p_order bigint, p_admin uuid) returns bigint
language plpgsql security definer set search_path = public as $$
declare o public.orders; r public.refunds;
begin
  perform public.internal_require_admin(p_admin);
  select * into o from public.orders where id = p_order for update;
  if not found then perform public.internal_fail('no_order', 'Pesanan tidak ditemukan.'); end if;
  if o.status <> 'gagal_kirim' then perform public.internal_fail('bad_status', 'Hanya pesanan gagal kirim yang bisa dikirim ulang.'); end if;
  select * into r from public.refunds where order_id = o.id and reason = 'gagal_kirim' and status = 'selesai' and not reversed for update;
  if found then
    perform public.apply_ledger_entry(o.user_id, 'order', -r.amount, 'resubmit', o.id || ':' || o.submit_attempts || ':' || r.id,
      'Kirim ulang pesanan #' || o.id, p_admin::text);
    update public.refunds set reversed = true where id = r.id;
    update public.orders set refunded_amount = greatest(0, refunded_amount - r.amount) where id = o.id;
  end if;
  update public.orders set status = 'menunggu', submit_attempts = 0, needs_manual_check = false where id = o.id;
  perform public.internal_audit(p_admin, 'order.resubmit', 'order', o.id::text, jsonb_build_object('status', 'gagal_kirim'), jsonb_build_object('status', 'menunggu'));
  return o.id;
end $$;
