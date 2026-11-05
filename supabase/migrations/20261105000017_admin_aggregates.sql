-- SQL aggregates for the admin dashboard and the stats page (replaces the in-memory snapshot). Service role only.
-- Days are Asia/Jakarta calendar days, like the rest of the app (lib/server/time.ts).

-- What the provider really charged for an order (mirrors lib/server/rules.ts effectiveProviderCost).
create or replace function public.effective_provider_cost(p_status text, p_cost bigint, p_qty int, p_remains bigint) returns bigint
language sql immutable parallel safe set search_path = public as $$
  select case
    when p_status in ('dibatalkan', 'gagal_kirim') then 0
    when p_status = 'sebagian' and p_qty > 0 then (p_cost * greatest(0, p_qty - p_remains)) / p_qty
    else p_cost end;
$$;

create index if not exists orders_status_created_idx on public.orders (status, created_at desc);
create index if not exists refunds_processed_idx on public.refunds (processed_at) where status = 'selesai';
create index if not exists profiles_created_idx on public.profiles (created_at desc);

-- StatsDataset (lib/admin-stats-data.ts) as aggregated rows, from p_from (a Jakarta day) to today.
create or replace function public.admin_stats_dataset(p_from date, p_tz text default 'Asia/Jakarta') returns jsonb
language sql stable security definer set search_path = public as $$
  with ord as (
    select o.*, (o.created_at at time zone p_tz)::date as d, s.platform, s.name as sname
      from public.orders o join public.services s on s.id = o.service_id
     where (o.created_at at time zone p_tz)::date >= p_from
  ), spend as (
    select user_id, sum(charge) as spent, sum(refunded_amount) as refunded, count(*) as n from public.orders group by user_id order by sum(charge) desc limit 100
  )
  select jsonb_build_object(
    'daily', coalesce((select jsonb_agg(jsonb_build_object('date', g.d, 'serviceId', g.service_id, 'serviceName', g.sn, 'platform', g.pf, 'providerId', g.pid,
        'orders', g.orders, 'revenue', g.revenue, 'providerCost', g.cost, 'refund', g.refund, 'completed', g.completed, 'partial', g.partial,
        'canceled', g.canceled, 'failed', g.failed, 'completionMinutes', g.minutes))
        from (select d, service_id, max(service_id || ' - ' || sname) as sn, max(platform) as pf, max(provider_id::text) as pid, count(*) as orders, sum(charge) as revenue,
                     sum(public.effective_provider_cost(status, provider_cost, quantity, remains)) as cost, sum(refunded_amount) as refund,
                     count(*) filter (where status = 'selesai') as completed, count(*) filter (where status = 'sebagian') as partial,
                     count(*) filter (where status = 'dibatalkan') as canceled, count(*) filter (where status = 'gagal_kirim') as failed,
                     coalesce(sum(greatest(0, round(extract(epoch from (completed_at - created_at)) / 60))) filter (where status = 'selesai' and completed_at is not null), 0) as minutes
                from ord group by d, service_id) g), '[]'::jsonb),
    'deposits', coalesce((select jsonb_agg(jsonb_build_object('date', (created_at at time zone p_tz)::date, 'method', method, 'amount', amount))
        from public.deposits where status = 'berhasil' and (created_at at time zone p_tz)::date >= p_from), '[]'::jsonb),
    'signups', coalesce((select jsonb_agg(jsonb_build_object('date', d, 'signups', c)) from (
        select (created_at at time zone p_tz)::date as d, count(*) as c from public.profiles where role <> 'admin' and (created_at at time zone p_tz)::date >= p_from group by 1) x), '[]'::jsonb),
    'active', coalesce((select jsonb_agg(jsonb_build_object('date', d, 'active', c)) from (select d, count(distinct user_id) as c from ord group by d) x), '[]'::jsonb),
    'tickets', coalesce((select jsonb_agg(jsonb_build_object('date', d, 'tickets', c, 'firstResponseMin', coalesce(fr, 0))) from (
        select (t.created_at at time zone p_tz)::date as d, count(*) as c,
               round(avg(extract(epoch from (r.first_reply - t.created_at)) / 60))::int as fr
          from public.tickets t
          left join lateral (select min(m.created_at) as first_reply from public.ticket_messages m where m.ticket_id = t.id and m.sender = 'support' and not m.is_internal) r on true
         where (t.created_at at time zone p_tz)::date >= p_from group by 1) x), '[]'::jsonb),
    'syncErrors', coalesce((select jsonb_agg(jsonb_build_object('date', d, 'errors', e)) from (
        select (started_at at time zone p_tz)::date as d, sum(errors) as e from public.provider_sync_runs where (started_at at time zone p_tz)::date >= p_from group by 1) x), '[]'::jsonb),
    'spenders', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'totalSpent', s.spent, 'orders', s.n,
        'refundRatio', case when s.spent > 0 then round((s.refunded::numeric / s.spent), 2) else 0 end, 'status', p.status, 'balance', p.balance) order by s.spent desc)
        from spend s join public.profiles p on p.id = s.user_id), '[]'::jsonb),
    'platforms', coalesce((select jsonb_agg(distinct platform) from public.services where platform <> ''), '[]'::jsonb)
  );
$$;

-- Everything the admin dashboard shows that comes from orders / deposits / refunds / users, in one round trip.
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
        (o.status in ('dibatalkan', 'gagal_kirim') and coalesce(o.cancelled_by, '') <> 'user' and o.refunded_amount <> o.charge)
     or (o.status = 'sebagian' and o.refunded_amount <> least(o.charge, (o.charge * least(greatest(o.remains, 0), o.quantity)) / o.quantity)))),
    'failedOrders', coalesce((select jsonb_agg(jsonb_build_object('id', o.id::text, 'username', p.username, 'charge', o.charge)) from (
        select * from public.orders where status = 'gagal_kirim' order by id desc limit 20) o join public.profiles p on p.id = o.user_id), '[]'::jsonb),
    'activeByProvider', coalesce((select jsonb_agg(distinct provider_id) from public.orders where status in ('menunggu', 'diproses', 'berjalan')), '[]'::jsonb),
    'importedServices', (select count(*) from public.services where imported)
  );
end $$;

revoke all on function public.effective_provider_cost(text, bigint, int, bigint), public.admin_stats_dataset(date, text), public.admin_dashboard(text) from public, anon, authenticated;
grant execute on function public.effective_provider_cost(text, bigint, int, bigint), public.admin_stats_dataset(date, text), public.admin_dashboard(text) to service_role;
