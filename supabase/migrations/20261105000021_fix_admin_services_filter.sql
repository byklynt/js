-- Fix: admin_services_page had a stray "s.imported or true and (...)" whose OR bypassed the category / thin-margin / search filters for imported services.
create or replace function public.admin_services_page(p_category text default null, p_thin boolean default false, p_search text default null,
                                                       p_min_margin numeric default 5, p_offset int default 0, p_limit int default 15)
returns table (service jsonb, total bigint)
language sql stable security definer set search_path = public as $$
  select to_jsonb(s) || jsonb_build_object('category_label', c.label), count(*) over ()
    from public.services s join public.service_categories c on c.id = s.category_id
   where (case when p_thin then s.active and s.price_per_1000 > 0 and round(((s.price_per_1000 - s.provider_price)::numeric * 100 / s.price_per_1000), 1) < p_min_margin
               else p_category is null or s.category_id = p_category end)
     and (p_search is null or length(btrim(p_search)) < 2 or s.id ilike '%' || btrim(p_search) || '%' or s.name ilike '%' || btrim(p_search) || '%')
   order by s.sort_order, public.service_sort_key(s.id) nulls last, s.id
   offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 100);
$$;
