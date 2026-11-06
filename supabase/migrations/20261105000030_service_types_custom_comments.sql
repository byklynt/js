-- Service types: "Custom Comments" can be ordered (the buyer supplies the comments); every other provider type that needs extra data
-- the form cannot collect is NOT orderable. services.provider_type already exists (backfilled by the next provider sync; null = Default).

-- Kind of a provider service type: 'default' (null, empty, "Default"), 'comments' ("Custom Comments"), anything else 'unsupported'.
create or replace function public.service_kind(p_type text) returns text
language sql immutable set search_path = public as $$
  select case when p_type is null or btrim(p_type) = '' or lower(btrim(p_type)) = 'default' then 'default'
              when lower(btrim(p_type)) = 'custom comments' then 'comments'
              else 'unsupported' end;
$$;

-- One comment per line: CRLF -> LF, tabs -> spaces, control / invisible characters removed, each line trimmed, empty lines dropped.
-- (The same rules run in the browser, lib/comments.ts, but this is the one that counts.)
create or replace function public.parse_comment_lines(p_text text) returns text[]
language sql immutable set search_path = public as $$
  select coalesce(array_agg(l order by n), '{}'::text[])
    from (
      select btrim(regexp_replace(regexp_replace(replace(x, E'\t', ' '), '[\x01-\x08\x0b-\x1f\x7f]', '', 'g'),
                                  '[​-‏‪-‮⁦-⁩﻿]', '', 'g')) as l, n
        from unnest(regexp_split_to_array(replace(replace(coalesce(p_text, ''), E'\r\n', E'\n'), E'\r', E'\n'), E'\n')) with ordinality as t(x, n)
    ) s
   where l <> '';
$$;

-- The comments of an order (stored as submitted, after normalisation). Owner and admins read; nobody writes except place_order.
create table public.order_comments (
  order_id   bigint primary key references public.orders (id) on delete cascade,
  comments   text not null,
  line_count int  not null check (line_count > 0),
  created_at timestamptz not null default now(),
  constraint order_comments_size check (char_length(comments) <= 60000)
);
alter table public.order_comments enable row level security;
revoke all on public.order_comments from public, anon, authenticated;
grant select on public.order_comments to authenticated;
create policy order_comments_select_own on public.order_comments for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));
create policy order_comments_select_admin on public.order_comments for select to authenticated using (private.is_admin());

-- place_order with comments. The old signature goes away (an overload with defaults would be ambiguous).
drop function public.place_order(uuid, text, text, int, text);
create function public.place_order(
  p_user uuid, p_service text, p_link text, p_quantity int, p_accepted_rules_version text default null, p_comments text default null
) returns table (order_id bigint, charge bigint, held boolean, balance bigint)
language plpgsql security definer set search_path = public as $$
declare
  prof public.profiles; svc public.services; prov public.providers; dup public.orders;
  v_rule_key text; v_version text; v_limit int; v_charge bigint; v_cost bigint; v_id bigint; v_led record; v_rl record;
  v_link text := btrim(coalesce(p_link, ''));
  v_kind text; v_lines text[]; v_qty int := p_quantity; v_text text;
  c_max_len constant int := 300;      -- characters per comment
  c_max_total constant int := 50000;  -- characters in all comments together
begin
  select * into prof from public.profiles where id = p_user;
  if not found then perform public.internal_fail('no_user', 'Pengguna tidak ditemukan.'); end if;
  if prof.status <> 'aktif' then perform public.internal_fail('blocked', 'Akunmu sedang diblokir.'); end if;

  select * into svc from public.services where id = p_service;
  if not found or not svc.active or svc.provider_removed then perform public.internal_fail('no_service', 'Layanan tidak tersedia.'); end if;
  select * into prov from public.providers where id = svc.provider_id;
  if not found or not prov.active then perform public.internal_fail('no_service', 'Layanan tidak tersedia.'); end if;

  v_kind := public.service_kind(svc.provider_type);
  if v_kind = 'unsupported' then perform public.internal_fail('not_orderable', 'Layanan ini belum tersedia untuk dipesan.'); end if;
  if v_kind = 'comments' then
    -- the quantity IS the number of comments: computed here, a different number from the client is refused
    v_lines := public.parse_comment_lines(p_comments);
    if coalesce(array_length(v_lines, 1), 0) = 0 then perform public.internal_fail('no_comments', 'Isi minimal satu komentar (satu komentar per baris).'); end if;
    if exists (select 1 from unnest(v_lines) l where char_length(l) > c_max_len) then
      perform public.internal_fail('comment_too_long', format('Satu komentar maksimal %s karakter.', c_max_len));
    end if;
    v_text := array_to_string(v_lines, E'\n');
    if char_length(v_text) > c_max_total then
      perform public.internal_fail('comments_too_big', format('Total komentar maksimal %s karakter.', replace(to_char(c_max_total, 'FM999,999'), ',', '.')));
    end if;
    if p_quantity is not null and p_quantity <> array_length(v_lines, 1) then
      perform public.internal_fail('bad_quantity', 'Jumlah tidak sama dengan jumlah komentar.');
    end if;
    v_qty := array_length(v_lines, 1);
  elsif nullif(btrim(coalesce(p_comments, '')), '') is not null then
    perform public.internal_fail('bad_input', 'Layanan ini tidak menerima komentar.');
  end if;

  if v_qty is null or v_qty < svc.min or v_qty > svc.max then
    perform public.internal_fail('bad_quantity', format('Jumlah harus antara %s dan %s.',
      replace(to_char(svc.min, 'FM999,999,999,999'), ',', '.'), replace(to_char(svc.max, 'FM999,999,999,999'), ',', '.')));
  end if;
  if v_link !~* '^https?://[^\s]+\.[^\s]+$' then perform public.internal_fail('bad_link', 'Tautan tidak valid.'); end if;

  v_rule_key := case when lower(coalesce(svc.platform, '')) in ('instagram', 'tiktok', 'youtube', 'facebook', 'twitter', 'telegram', 'spotify')
                     then lower(svc.platform) else 'other' end;
  select version into v_version from public.service_rules where platform = v_rule_key;
  if v_version is null then perform public.internal_fail('rules_missing', 'Ketentuan order belum diatur.'); end if;
  if p_accepted_rules_version is not null and p_accepted_rules_version <> v_version then
    perform public.internal_fail('rules_changed', 'Ketentuan order berubah. Baca ulang sebelum memesan.');
  end if;

  select * into dup from public.orders o
   where o.user_id = p_user and o.service_id = p_service
     and o.link_normalized = regexp_replace(regexp_replace(lower(v_link), '#.*$', ''), '/+$', '')
     and (o.status in ('menunggu', 'diproses', 'berjalan') or o.held)
   limit 1;
  if found then
    perform public.internal_fail('duplicate_active', format('Pesanan #%s untuk layanan dan tautan yang sama masih berjalan. Tunggu sampai selesai.', dup.id));
  end if;

  v_limit := coalesce((select (data #>> '{limits,ordersPerMinute}')::int from public.site_settings), 10);
  select * into v_rl from public.rate_limit_hit('order:' || p_user::text, v_limit, 60);
  if not v_rl.allowed then
    perform public.internal_fail('rate_limited', format('Terlalu banyak pesanan. Coba lagi dalam %s detik.', v_rl.retry_after));
  end if;

  v_charge := (svc.price_per_1000 * v_qty + 999) / 1000;      -- ceil(price per 1000 * qty / 1000), integers only
  v_cost := (svc.provider_price * v_qty + 999) / 1000;
  if v_charge <= 0 then perform public.internal_fail('no_service', 'Layanan tidak tersedia.'); end if;
  v_id := nextval('public.orders_id_seq');

  select * into v_led from public.apply_ledger_entry(p_user, 'order', -v_charge, 'order', v_id::text, 'Pesanan #' || v_id, p_user::text);

  begin
    insert into public.orders (id, user_id, service_id, provider_id, link, quantity, charge, provider_cost, remains, status, held,
                               accepted_rules_version, accepted_at)
    values (v_id, p_user, p_service, svc.provider_id, v_link, v_qty, v_charge, v_cost, v_qty, 'menunggu', prof.manual_approval,
            v_version, now());
  exception when unique_violation then
    perform public.internal_fail('duplicate_active', 'Pesanan untuk layanan dan tautan yang sama masih berjalan. Tunggu sampai selesai.');
  end;
  if v_kind = 'comments' then
    insert into public.order_comments (order_id, comments, line_count) values (v_id, v_text, v_qty);
  end if;

  if v_led.new_balance < 10000 then
    perform public.internal_notify(p_user, 'sistem', 'Saldo hampir habis',
      'Saldomu tinggal ' || public.fmt_rupiah(v_led.new_balance) || '. Tambah saldo agar pesanan berikutnya tidak tertunda.',
      '/dashboard/add-funds', 'lowbal:' || p_user::text || ':' || to_char(now(), 'YYYY-MM-DD'));
  end if;
  if prof.manual_approval then
    perform public.internal_notify(p_user, 'pesanan', 'Pesanan #' || v_id || ' menunggu persetujuan',
      'Admin akan memeriksa pesananmu sebelum dikirim ke provider.', '/dashboard/orders?search=' || v_id, 'order:' || v_id || ':held');
  end if;

  order_id := v_id; charge := v_charge; held := prof.manual_approval; balance := v_led.new_balance;
  return next;
end $$;

revoke all on function public.place_order(uuid, text, text, int, text, text), public.service_kind(text), public.parse_comment_lines(text) from public, anon, authenticated;
grant execute on function public.place_order(uuid, text, text, int, text, text), public.service_kind(text), public.parse_comment_lines(text) to service_role;

-- Catalogue: carry the kind (appended: the view keeps its column order) so the order form can tell the buyer what a service needs.
create or replace view public.catalogue_services with (security_invoker = true) as
  select s.id, s.name, s.category_id, s.platform, s.price_per_1000 as price, s.min, s.max,
         case when s.refill then coalesce(s.refill_days, 30) end as refill_days, s.avg_time, s.speed,
         c.label as category_label, s.provider_name, s.refill, s.sort_order,
         e.sample_count as est_n, e.median_seconds as est_median, e.p25_seconds as est_p25, e.p75_seconds as est_p75, e.buckets as est_buckets,
         s.estimate_override as est_override,
         coalesce((select (data #>> '{estimates,minSamples}')::int from public.site_settings), 3) as est_min,
         public.service_kind(s.provider_type) as kind
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
                 est_n int, est_median int, est_p25 int, est_p75 int, est_buckets jsonb, est_override text, est_min int, kind text)
language sql stable security definer set search_path = public as $$
  select v.id, v.name, v.category_id, v.price, v.min, v.max, v.refill_days, v.avg_time, v.speed, count(*) over () as total,
         v.est_n, v.est_median, v.est_p25, v.est_p75, v.est_buckets, v.est_override, v.est_min, v.kind
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
