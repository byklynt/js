-- Admin service search: matches our service ID, the provider service ID ("#26826" works: leading # is ignored) and the name (case-insensitive,
-- partial). While search text (2+ characters) is typed it looks across ALL categories (the category filter stays for the margin filter and for
-- an empty search); exact ID matches come first. Plain substring search (no LIKE wildcards from the user).
create or replace function public.admin_services_page(p_category text default null, p_thin boolean default false, p_search text default null,
                                                       p_min_margin numeric default 5, p_offset int default 0, p_limit int default 15)
returns table (service jsonb, total bigint)
language sql stable security definer set search_path = public as $$
  with q as (
    select lower(nullif(btrim(regexp_replace(btrim(coalesce(p_search, '')), '^#+', '')), '')) as n
  ), qq as (
    select n, (n is not null and length(n) >= 2) as searching from q
  )
  select to_jsonb(s) || jsonb_build_object('category_label', c.label), count(*) over ()
    from public.services s
    join public.service_categories c on c.id = s.category_id
    cross join qq
   where (case when p_thin then s.active and s.price_per_1000 > 0 and round(((s.price_per_1000 - s.provider_price)::numeric * 100 / s.price_per_1000), 1) < p_min_margin
               else p_category is null or qq.searching or s.category_id = p_category end)
     and (not qq.searching
          or position(qq.n in lower(s.id)) > 0
          or position(qq.n in lower(s.provider_service_id)) > 0
          or position(qq.n in lower(s.name)) > 0
          or position(qq.n in lower(coalesce(s.provider_name, ''))) > 0)
   order by coalesce(qq.searching and (lower(s.id) = qq.n or lower(s.provider_service_id) = qq.n), false) desc,
            s.sort_order, public.service_sort_key(s.id) nulls last, s.id
   offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 100);
$$;
