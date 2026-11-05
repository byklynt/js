-- User-facing catalogue queries (server-side pagination, filters, search, category counts) + provider_type column.
-- Service-role only: the server returns just the public fields (no provider_id, no cost, no markup).

alter table public.services add column if not exists provider_type text;

-- Numeric-aware sort key for service ids ("2" before "10").
create or replace function public.service_sort_key(p_id text) returns bigint
language sql immutable parallel safe set search_path = public as $$
  select case when p_id ~ '^[0-9]{1,18}$' then p_id::bigint end;
$$;
create index if not exists services_sort_key_idx on public.services (public.service_sort_key(id), id) where active and not provider_removed;

-- "Can a user see and order this": active, priced, not dropped by the provider, and its provider is active.
create or replace view public.catalogue_services with (security_invoker = true) as
  select s.id, s.name, s.category_id, s.platform, s.price_per_1000 as price, s.min, s.max,
         case when s.refill then coalesce(s.refill_days, 30) end as refill_days, s.avg_time, s.speed,
         c.label as category_label, s.provider_name, s.refill, s.sort_order
    from public.services s
    join public.providers p on p.id = s.provider_id and p.active
    join public.service_categories c on c.id = s.category_id
   where s.active and not s.provider_removed and s.price_per_1000 > 0 and s.imported;

create or replace function public.catalogue_filter_ok(
  p_name text, p_id text, p_platform text, p_price bigint, p_refill_days int,
  f_platform text, f_search text, f_pmin bigint, f_pmax bigint, f_guarantee text, f_ids text[]
) returns boolean language sql immutable set search_path = public as $$
  select (f_platform is null or f_platform = 'semua' or p_platform = f_platform)
     and (f_pmin is null or p_price >= f_pmin)
     and (f_pmax is null or p_price <= f_pmax)
     and (f_guarantee is null or f_guarantee = 'semua'
          or (f_guarantee = 'ada-garansi' and p_refill_days is not null)
          or (f_guarantee = 'tanpa-garansi' and p_refill_days is null))
     and (f_ids is null or p_id = any (f_ids))
     and (f_search is null or not exists (
            select 1 from regexp_split_to_table(lower(f_search), '\s+') t
             where t <> '' and position(t in lower(p_id || ' ' || p_name)) = 0));
$$;

create or replace function public.catalogue_page(
  p_category text default null, p_platform text default null, p_search text default null, p_sort text default 'id-asc',
  p_price_min bigint default null, p_price_max bigint default null, p_guarantee text default null, p_ids text[] default null,
  p_offset int default 0, p_limit int default 20
) returns table (id text, name text, category_id text, price bigint, min int, max bigint, refill_days int, avg_time text, speed int, total bigint)
language sql stable security definer set search_path = public as $$
  select v.id, v.name, v.category_id, v.price, v.min, v.max, v.refill_days, v.avg_time, v.speed, count(*) over () as total
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

create or replace function public.catalogue_categories(
  p_platform text default null, p_search text default null, p_price_min bigint default null, p_price_max bigint default null,
  p_guarantee text default null, p_ids text[] default null
) returns table (id text, label text, platform text, count bigint)
language sql stable security definer set search_path = public as $$
  select v.category_id, max(v.category_label), max(v.platform), count(*)
    from public.catalogue_services v
   where public.catalogue_filter_ok(v.name, v.id, v.platform, v.price, v.refill_days, p_platform, nullif(btrim(p_search), ''), p_price_min, p_price_max, p_guarantee, p_ids)
   group by v.category_id;
$$;

revoke all on function public.service_sort_key(text), public.catalogue_filter_ok(text, text, text, bigint, int, text, text, bigint, bigint, text, text[]),
  public.catalogue_page(text, text, text, text, bigint, bigint, text, text[], int, int),
  public.catalogue_categories(text, text, bigint, bigint, text, text[]) from public, anon, authenticated;
grant execute on function public.service_sort_key(text), public.catalogue_filter_ok(text, text, text, bigint, int, text, text, bigint, bigint, text, text[]),
  public.catalogue_page(text, text, text, text, bigint, bigint, text, text[], int, int),
  public.catalogue_categories(text, text, bigint, bigint, text, text[]) to service_role;
