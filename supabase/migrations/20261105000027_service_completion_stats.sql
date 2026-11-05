-- Measured delivery-time estimates per service.
--
-- Capture:   orders.provider_accepted_at (set when the provider accepts the order), orders.completed_at (set once, on the first
--            transition into 'selesai'), orders.completion_counts (decided by the sync at that moment: a clean, precise completion),
--            orders.completed_approx (backfilled completion time, never counted), orders.status_manual (an admin changed the status).
-- Duration:  completed_at - coalesce(provider_accepted_at, created_at). The status sync runs about every 2 minutes, so a duration is
--            accurate to roughly that interval (documented in docs/supabase-setup.md).
-- Stats:     service_completion_stats holds ONLY aggregates (median / p25 / p75 of the most recent N counted orders, N = site setting
--            estimates.window, default 20) plus the same per quantity bucket (small <= 1.000, medium <= 10.000, large above) in `buckets`.
--            Recomputed in SQL for the affected service when an order completes, when a refill is requested for a counted order,
--            and by a cron pass (refresh_completion_stats) for stale rows. No order-level data is exposed.
-- Admin:     services.estimate_override (manual text) and services.stats_reset_at ("Reset statistik": orders completed before it are ignored).

alter table public.orders
  add column provider_accepted_at timestamptz,
  add column completion_counts boolean not null default false,
  add column completed_approx boolean not null default false,
  add column status_manual boolean not null default false;

-- Backfill: finished orders without a completion time get the best timestamp we have, flagged approximate (never used for estimates).
update public.orders set completed_at = coalesce(last_synced_at, updated_at), completed_approx = true
 where status = 'selesai' and completed_at is null;

alter table public.services
  add column estimate_override text check (estimate_override is null or length(estimate_override) <= 40),
  add column stats_reset_at timestamptz;

create table public.service_completion_stats (
  service_id        text primary key references public.services (id) on delete cascade,
  sample_count      int not null check (sample_count >= 0),
  median_seconds    int not null,
  p25_seconds       int not null,
  p75_seconds       int not null,
  buckets           jsonb not null default '{}'::jsonb,   -- {"small": {"n": 4, "median": 300, "p25": 240, "p75": 420}, ...}
  last_completed_at timestamptz,
  updated_at        timestamptz not null default now()
);
alter table public.service_completion_stats enable row level security;
-- Aggregates only: readable by signed-in users, writable only through the SECURITY DEFINER functions below.
create policy service_completion_stats_read on public.service_completion_stats for select to authenticated using (true);
grant select on public.service_completion_stats to authenticated;

-- completed_at is stamped on the first transition into 'selesai' and never moves afterwards.
create or replace function public.orders_completion_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status = 'selesai' and old.status is distinct from 'selesai' and new.completed_at is null then
    new.completed_at := now();
  end if;
  if old.status = 'selesai' and old.completed_at is not null and new.status = 'selesai' then
    new.completed_at := old.completed_at;
  end if;
  return new;
end $$;
create trigger orders_completion_guard before update on public.orders for each row execute function public.orders_completion_guard();

create or replace function public.recompute_service_completion_stats(p_service text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_window int := greatest(1, least(500, coalesce((select (data #>> '{estimates,window}')::int from public.site_settings), 20)));
  v_reset timestamptz;
  v_n int; v_med float8; v_p25 float8; v_p75 float8; v_last timestamptz; v_buckets jsonb;
begin
  select stats_reset_at into v_reset from public.services where id = p_service;
  with recent as (
    select o.quantity, o.completed_at,
           extract(epoch from (o.completed_at - coalesce(o.provider_accepted_at, o.created_at)))::int as secs
      from public.orders o
     where o.service_id = p_service and o.status = 'selesai' and o.completion_counts and not o.completed_approx
       and not o.status_manual and o.sync_error is null and o.completed_at is not null
       and (v_reset is null or o.completed_at > v_reset)
       and not exists (select 1 from public.refill_requests r where r.order_id = o.id)
     order by o.completed_at desc limit v_window
  ), valid as (select * from recent where secs > 0)
  select count(*), percentile_cont(0.5) within group (order by secs), percentile_cont(0.25) within group (order by secs),
         percentile_cont(0.75) within group (order by secs), max(completed_at),
         coalesce((select jsonb_object_agg(b, jsonb_build_object('n', n, 'median', round(m)::int, 'p25', round(a)::int, 'p75', round(c)::int))
                     from (select case when quantity <= 1000 then 'small' when quantity <= 10000 then 'medium' else 'large' end as b, count(*) as n,
                                  percentile_cont(0.5) within group (order by secs) as m, percentile_cont(0.25) within group (order by secs) as a,
                                  percentile_cont(0.75) within group (order by secs) as c
                             from valid group by 1) x), '{}'::jsonb)
    into v_n, v_med, v_p25, v_p75, v_last, v_buckets from valid;

  if coalesce(v_n, 0) = 0 then
    delete from public.service_completion_stats where service_id = p_service;
  else
    insert into public.service_completion_stats (service_id, sample_count, median_seconds, p25_seconds, p75_seconds, buckets, last_completed_at, updated_at)
    values (p_service, v_n, round(v_med)::int, round(v_p25)::int, round(v_p75)::int, v_buckets, v_last, now())
    on conflict (service_id) do update set sample_count = excluded.sample_count, median_seconds = excluded.median_seconds, p25_seconds = excluded.p25_seconds,
      p75_seconds = excluded.p75_seconds, buckets = excluded.buckets, last_completed_at = excluded.last_completed_at, updated_at = now();
  end if;
end $$;

-- Only a first transition into 'selesai' that the sync marked as a clean completion changes the statistics (repeated syncs change nothing).
create or replace function public.orders_completion_stats_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'selesai' and old.status is distinct from 'selesai' and new.completion_counts then
    perform public.recompute_service_completion_stats(new.service_id);
  end if;
  return null;
end $$;
create trigger orders_completion_stats after update on public.orders for each row execute function public.orders_completion_stats_trigger();

-- A refill asked for later takes that order out of the sample.
create or replace function public.refill_requests_stats_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_service text;
begin
  select service_id into v_service from public.orders where id = new.order_id;
  if v_service is not null then perform public.recompute_service_completion_stats(v_service); end if;
  return null;
end $$;
create trigger refill_requests_stats after insert on public.refill_requests for each row execute function public.refill_requests_stats_trigger();

-- Cron / settings change: recompute rows that are stale (older than a day, or a counted order completed after the row was written),
-- or every service when p_all.
create or replace function public.refresh_completion_stats(p_all boolean default false) returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in
    select distinct o.service_id from public.orders o
      left join public.service_completion_stats s on s.service_id = o.service_id
     where o.status = 'selesai' and o.completion_counts and not o.completed_approx
       and (p_all or s.service_id is null or s.updated_at < now() - interval '1 day' or o.completed_at > s.updated_at)
    union
    select s2.service_id from public.service_completion_stats s2 where p_all
  loop
    perform public.recompute_service_completion_stats(r.service_id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- "Reset statistik": forget everything measured so far for a service (e.g. the provider or the service changed).
create or replace function public.reset_service_completion_stats(p_service text, p_admin uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_old public.service_completion_stats;
begin
  perform public.internal_require_admin(p_admin);
  if not exists (select 1 from public.services where id = p_service) then perform public.internal_fail('no_service', 'Layanan tidak ditemukan.'); end if;
  select * into v_old from public.service_completion_stats where service_id = p_service;
  update public.services set stats_reset_at = now() where id = p_service;
  delete from public.service_completion_stats where service_id = p_service;
  perform public.internal_audit(p_admin, 'service.stats_reset', 'service', p_service,
    jsonb_build_object('sampleCount', coalesce(v_old.sample_count, 0), 'medianSeconds', v_old.median_seconds), jsonb_build_object('sampleCount', 0));
end $$;

revoke all on function public.orders_completion_guard(), public.recompute_service_completion_stats(text), public.orders_completion_stats_trigger(),
  public.refill_requests_stats_trigger(), public.refresh_completion_stats(boolean), public.reset_service_completion_stats(text, uuid) from public, anon, authenticated;
grant execute on function public.recompute_service_completion_stats(text), public.refresh_completion_stats(boolean), public.reset_service_completion_stats(text, uuid) to service_role;

-- The catalogue view and page function carry the aggregates (one LEFT JOIN on the primary key: no extra query, no N+1).
create or replace view public.catalogue_services with (security_invoker = true) as
  select s.id, s.name, s.category_id, s.platform, s.price_per_1000 as price, s.min, s.max,
         case when s.refill then coalesce(s.refill_days, 30) end as refill_days, s.avg_time, s.speed,
         c.label as category_label, s.provider_name, s.refill, s.sort_order,
         e.sample_count as est_n, e.median_seconds as est_median, e.p25_seconds as est_p25, e.p75_seconds as est_p75, e.buckets as est_buckets,
         s.estimate_override as est_override,
         coalesce((select (data #>> '{estimates,minSamples}')::int from public.site_settings), 3) as est_min
    from public.services s
    join public.providers p on p.id = s.provider_id and p.active
    join public.service_categories c on c.id = s.category_id
    left join public.service_completion_stats e on e.service_id = s.id
   where s.active and not s.provider_removed and s.price_per_1000 > 0 and s.imported;

drop function public.catalogue_page(text, text, text, text, bigint, bigint, text, text[], int, int);
create function public.catalogue_page(
  p_category text default null, p_platform text default null, p_search text default null, p_sort text default 'id-asc',
  p_price_min bigint default null, p_price_max bigint default null, p_guarantee text default null, p_ids text[] default null,
  p_offset int default 0, p_limit int default 20
) returns table (id text, name text, category_id text, price bigint, min int, max bigint, refill_days int, avg_time text, speed int, total bigint,
                 est_n int, est_median int, est_p25 int, est_p75 int, est_buckets jsonb, est_override text, est_min int)
language sql stable security definer set search_path = public as $$
  select v.id, v.name, v.category_id, v.price, v.min, v.max, v.refill_days, v.avg_time, v.speed, count(*) over () as total,
         v.est_n, v.est_median, v.est_p25, v.est_p75, v.est_buckets, v.est_override, v.est_min
    from public.catalogue_services v
   where (p_category is null or v.category_id = p_category)
     and public.catalogue_filter_ok(v.name, v.id, v.platform, v.price, v.refill_days, p_platform, nullif(btrim(p_search), ''), p_price_min, p_price_max, p_guarantee, p_ids)
   order by
     case when p_sort = 'termurah' then v.price end asc,
     case when p_sort = 'termahal' then v.price end desc,
     case when p_sort = 'tercepat' then coalesce(v.speed, 0) end desc,
     public.service_sort_key(v.id) asc nulls last, v.id asc
   offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 100);
$$;
revoke all on function public.catalogue_page(text, text, text, text, bigint, bigint, text, text[], int, int) from public, anon, authenticated;
grant execute on function public.catalogue_page(text, text, text, text, bigint, bigint, text, text[], int, int) to service_role;
