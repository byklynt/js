-- Bulk activate / deactivate of services (admin). ONE set-based UPDATE, no per-row loop; rows already in the target state are not touched and not
-- logged; ONE audit row per call (action, counts, filter summary), never one per service. Orders keep their service reference (only services.active changes).
--
-- bulk_service_targets: the rows a selection means. Either explicit ids, or the same filter the admin list uses (category / margin filter / search,
-- plus an optional platform). "review" = the "Perlu dicek" rule (price over the threshold, or a name / category under 3 characters; keep in step with
-- lib/service-review.ts).
create or replace function public.bulk_service_targets(
  p_ids text[] default null, p_category text default null, p_platform text default null, p_search text default null,
  p_thin boolean default false, p_min_margin numeric default 5, p_review_threshold bigint default 5000000
) returns table (id text, active boolean, review boolean)
language sql stable security definer set search_path = public as $$
  with q as (
    select lower(nullif(btrim(regexp_replace(btrim(coalesce(p_search, '')), '^#+', '')), '')) as n
  ), qq as (
    select n, (n is not null and length(n) >= 2) as searching from q
  )
  select s.id, s.active,
         (s.price_per_1000 > p_review_threshold or char_length(btrim(s.name)) < 3 or char_length(btrim(c.label)) < 3) as review
    from public.services s
    join public.service_categories c on c.id = s.category_id
    cross join qq
   where case
           when p_ids is not null then s.id = any (p_ids)
           else (case when p_thin then s.active and s.price_per_1000 > 0 and round(((s.price_per_1000 - s.provider_price)::numeric * 100 / s.price_per_1000), 1) < p_min_margin
                      else p_category is null or qq.searching or s.category_id = p_category end)
                and (p_platform is null or s.platform = p_platform)
                and (not qq.searching
                     or position(qq.n in lower(s.id)) > 0
                     or position(qq.n in lower(s.provider_service_id)) > 0
                     or position(qq.n in lower(s.name)) > 0
                     or position(qq.n in lower(coalesce(s.provider_name, ''))) > 0)
         end;
$$;

-- bulk_set_services_active: returns {matched, changed, skippedReview, unchanged, dryRun}. With p_dry_run nothing is written (changed = what WOULD change).
-- When activating, services flagged "Perlu dicek" are skipped unless p_include_review (the admin confirmed it explicitly).
create or replace function public.bulk_set_services_active(
  p_admin uuid, p_active boolean, p_scope text default 'filter',
  p_ids text[] default null, p_category text default null, p_platform text default null, p_search text default null,
  p_thin boolean default false, p_min_margin numeric default 5, p_review_threshold bigint default 5000000,
  p_include_review boolean default false, p_dry_run boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_matched int; v_would int; v_skipped int; v_changed int := 0;
begin
  perform public.internal_require_admin(p_admin);
  select count(*),
         count(*) filter (where t.active is distinct from p_active and (not p_active or p_include_review or not t.review)),
         count(*) filter (where p_active and not t.active and t.review and not p_include_review)
    into v_matched, v_would, v_skipped
    from public.bulk_service_targets(p_ids, p_category, p_platform, p_search, p_thin, p_min_margin, p_review_threshold) t;
  if p_dry_run then
    return jsonb_build_object('matched', v_matched, 'changed', v_would, 'skippedReview', v_skipped, 'unchanged', v_matched - v_would - v_skipped, 'dryRun', true);
  end if;

  with upd as (
    update public.services s set active = p_active
      from public.bulk_service_targets(p_ids, p_category, p_platform, p_search, p_thin, p_min_margin, p_review_threshold) t
     where s.id = t.id and s.active is distinct from p_active and (not p_active or p_include_review or not t.review)
    returning s.id
  )
  select count(*) into v_changed from upd;

  if v_changed > 0 then
    perform public.internal_audit(p_admin, 'service.bulk_active', 'service', 'bulk',
      jsonb_build_object('active', not p_active),
      jsonb_build_object('active', p_active, 'changed', v_changed, 'matched', v_matched, 'skippedReview', v_skipped, 'includeReview', p_include_review,
                         'filter', jsonb_build_object('scope', p_scope, 'ids', coalesce(array_length(p_ids, 1), 0), 'category', p_category, 'platform', p_platform,
                                                      'search', p_search, 'thin', p_thin)));
  end if;
  return jsonb_build_object('matched', v_matched, 'changed', v_changed, 'skippedReview', v_skipped, 'unchanged', v_matched - v_changed - v_skipped, 'dryRun', false);
end $$;

revoke all on function public.bulk_service_targets(text[], text, text, text, boolean, numeric, bigint),
  public.bulk_set_services_active(uuid, boolean, text, text[], text, text, text, boolean, numeric, bigint, boolean, boolean) from public, anon, authenticated;
grant execute on function public.bulk_service_targets(text[], text, text, text, boolean, numeric, bigint),
  public.bulk_set_services_active(uuid, boolean, text, text[], text, text, text, boolean, numeric, bigint, boolean, boolean) to service_role;
