-- admin_dashboard: two real counts that the dashboard used to fake or cap.
-- * failedCount: ALL orders in gagal_kirim (failedOrders is only the newest 20, so its length was the card value and stopped at 20).
-- * syncErrors: active orders the provider sync could not reconcile (sync_error set: unknown status, invalid answer, provider error).
--   This feeds "Status beda dengan provider" in Rekonsiliasi, which was a hard-coded 0.
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
    'failedCount', (select count(*) from public.orders where status = 'gagal_kirim'),
    'syncErrors', (select count(*) from public.orders where status in ('menunggu', 'diproses', 'berjalan') and provider_order_id <> '' and sync_error is not null),
    'failedOrders', coalesce((select jsonb_agg(jsonb_build_object('id', o.id::text, 'username', p.username, 'charge', o.charge)) from (
        select * from public.orders where status = 'gagal_kirim' order by id desc limit 20) o join public.profiles p on p.id = o.user_id), '[]'::jsonb),
    'activeByProvider', coalesce((select jsonb_agg(distinct provider_id) from public.orders where status in ('menunggu', 'diproses', 'berjalan')), '[]'::jsonb),
    'importedServices', (select count(*) from public.services where imported)
  );
end $$;
