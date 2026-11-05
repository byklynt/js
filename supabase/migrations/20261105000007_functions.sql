-- Postgres functions: the ONLY way money, orders-with-money and refunds change.
-- All SECURITY DEFINER, search_path pinned, inputs validated, EXECUTE granted to service_role only (server code).
-- Errors: SQLSTATE P0001, message in Indonesian (shown to users), HINT = machine code (insufficient_balance, ...).

-- ---------------------------------------------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.internal_fail(p_code text, p_message text) returns void
language plpgsql set search_path = public as $$
begin raise exception '%', p_message using errcode = 'P0001', hint = p_code; end $$;

create or replace function public.fmt_rupiah(p_amount bigint) returns text
language sql immutable set search_path = public as $$
  select 'Rp ' || replace(to_char(p_amount, 'FM999,999,999,999,999'), ',', '.');
$$;

-- One notification per (recipient, dedupe_key); written in the SAME transaction as the event.
create or replace function public.internal_notify(p_user uuid, p_type text, p_title text, p_body text, p_href text, p_dedupe text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, type, title, body, href, dedupe_key)
  values (p_user, p_type, p_title, coalesce(p_body, ''), p_href, p_dedupe)
  on conflict (user_id, dedupe_key) do nothing;
end $$;

create or replace function public.internal_audit(p_admin uuid, p_action text, p_type text, p_id text, p_before jsonb, p_after jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_logs (admin_id, admin_name, action, target_type, target_id, before, after)
  values (p_admin, coalesce((select username::text from public.profiles where id = p_admin), 'system'), p_action, p_type, p_id, p_before, p_after);
end $$;

create or replace function public.internal_require_admin(p_admin uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = p_admin and role = 'admin' and status = 'aktif') then
    perform public.internal_fail('forbidden', 'Hanya admin yang boleh melakukan ini.');
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- rate limit: atomic fixed-window counter
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.rate_limit_hit(p_key text, p_limit int, p_window_seconds int)
returns table (allowed boolean, retry_after int)
language plpgsql security definer set search_path = public as $$
declare r public.rate_limits;
begin
  if coalesce(p_key, '') = '' or p_limit < 1 or p_window_seconds < 1 then
    perform public.internal_fail('bad_input', 'Parameter rate limit tidak valid.');
  end if;
  insert into public.rate_limits as rl (key, window_start, hits) values (p_key, now(), 1)
  on conflict (key) do update set
    hits = case when rl.window_start + make_interval(secs => p_window_seconds) <= now() then 1 else rl.hits + 1 end,
    window_start = case when rl.window_start + make_interval(secs => p_window_seconds) <= now() then now() else rl.window_start end
  returning * into r;
  allowed := r.hits <= p_limit;
  retry_after := case when allowed then 0
                 else greatest(1, ceil(extract(epoch from (r.window_start + make_interval(secs => p_window_seconds) - now())))::int) end;
  return next;
end $$;

-- Failed-login style counters can be cleared on success.
create or replace function public.rate_limit_reset(p_key text) returns void
language sql security definer set search_path = public as $$
  delete from public.rate_limits where key = p_key;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- apply_ledger_entry: the only balance writer
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.apply_ledger_entry(
  p_user uuid, p_type text, p_amount bigint, p_ref_type text, p_ref_id text, p_note text default '', p_by text default 'system'
) returns table (ledger_id uuid, new_balance bigint, duplicate boolean)
language plpgsql security definer set search_path = public as $$
declare prof public.profiles; existing public.balance_ledger; entry public.balance_ledger;
begin
  if p_amount is null or p_amount = 0 then perform public.internal_fail('bad_amount', 'Nominal tidak valid.'); end if;
  if coalesce(p_ref_type, '') = '' or coalesce(p_ref_id, '') = '' then perform public.internal_fail('bad_ref', 'Referensi transaksi wajib diisi.'); end if;

  select * into prof from public.profiles where id = p_user for update;   -- serialises every spend/credit of this user
  if not found then perform public.internal_fail('no_user', 'Pengguna tidak ditemukan.'); end if;

  -- Idempotent replay (checked AFTER the lock, so two concurrent identical calls cannot both pass).
  select * into existing from public.balance_ledger where type = p_type and ref_type = p_ref_type and ref_id = p_ref_id;
  if found then
    ledger_id := existing.id; new_balance := existing.balance_after; duplicate := true;
    return next; return;
  end if;

  if p_amount < 0 and prof.balance + p_amount < 0 then
    perform public.internal_fail('insufficient_balance', 'Saldo tidak cukup.');
  end if;

  insert into public.balance_ledger (user_id, type, amount, balance_before, balance_after, ref_type, ref_id, note, created_by)
  values (p_user, p_type, p_amount, prof.balance, prof.balance + p_amount, p_ref_type, p_ref_id, coalesce(p_note, ''), coalesce(p_by, 'system'))
  returning * into entry;
  update public.profiles set balance = prof.balance + p_amount where id = p_user;

  ledger_id := entry.id; new_balance := entry.balance_after; duplicate := false;
  return next;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- place_order: validate, rate limit, debit, insert. The provider call happens in server code AFTER commit.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.place_order(
  p_user uuid, p_service text, p_link text, p_quantity int, p_accepted_rules_version text default null
) returns table (order_id bigint, charge bigint, held boolean, balance bigint)
language plpgsql security definer set search_path = public as $$
declare
  prof public.profiles; svc public.services; prov public.providers; dup public.orders;
  v_rule_key text; v_version text; v_limit int; v_charge bigint; v_cost bigint; v_id bigint; v_led record; v_rl record;
  v_link text := btrim(coalesce(p_link, ''));
begin
  select * into prof from public.profiles where id = p_user;
  if not found then perform public.internal_fail('no_user', 'Pengguna tidak ditemukan.'); end if;
  if prof.status <> 'aktif' then perform public.internal_fail('blocked', 'Akunmu sedang diblokir.'); end if;

  select * into svc from public.services where id = p_service;
  if not found or not svc.active or svc.provider_removed then perform public.internal_fail('no_service', 'Layanan tidak tersedia.'); end if;
  select * into prov from public.providers where id = svc.provider_id;
  if not found or not prov.active then perform public.internal_fail('no_service', 'Layanan tidak tersedia.'); end if;

  if p_quantity is null or p_quantity < svc.min or p_quantity > svc.max then
    perform public.internal_fail('bad_quantity', format('Jumlah harus antara %s dan %s.',
      replace(to_char(svc.min, 'FM999,999,999,999'), ',', '.'), replace(to_char(svc.max, 'FM999,999,999,999'), ',', '.')));
  end if;
  if v_link !~* '^https?://[^\s]+\.[^\s]+$' then perform public.internal_fail('bad_link', 'Tautan tidak valid.'); end if;

  -- Rules the user accepted: always the CURRENT version of the platform's rules (set here, never taken from the client).
  v_rule_key := case when lower(coalesce(svc.platform, '')) in ('instagram', 'tiktok', 'youtube', 'facebook', 'twitter', 'telegram', 'spotify')
                     then lower(svc.platform) else 'other' end;
  select version into v_version from public.service_rules where platform = v_rule_key;
  if v_version is null then perform public.internal_fail('rules_missing', 'Ketentuan order belum diatur.'); end if;
  if p_accepted_rules_version is not null and p_accepted_rules_version <> v_version then
    perform public.internal_fail('rules_changed', 'Ketentuan order berubah. Baca ulang sebelum memesan.');
  end if;

  -- Duplicate: an unfinished order for the same service and (normalised) link.
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

  v_charge := (svc.price_per_1000 * p_quantity + 999) / 1000;      -- ceil(price per 1000 * qty / 1000), integers only
  v_cost := (svc.provider_price * p_quantity + 999) / 1000;
  if v_charge <= 0 then perform public.internal_fail('no_service', 'Layanan tidak tersedia.'); end if;
  v_id := nextval('public.orders_id_seq');

  select * into v_led from public.apply_ledger_entry(p_user, 'order', -v_charge, 'order', v_id::text, 'Pesanan #' || v_id, p_user::text);

  begin
    insert into public.orders (id, user_id, service_id, provider_id, link, quantity, charge, provider_cost, remains, status, held,
                               accepted_rules_version, accepted_at)
    values (v_id, p_user, p_service, svc.provider_id, v_link, p_quantity, v_charge, v_cost, p_quantity, 'menunggu', prof.manual_approval,
            v_version, now());
  exception when unique_violation then
    perform public.internal_fail('duplicate_active', 'Pesanan untuk layanan dan tautan yang sama masih berjalan. Tunggu sampai selesai.');
  end;

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

-- ---------------------------------------------------------------------------------------------------------------
-- refunds
-- ---------------------------------------------------------------------------------------------------------------
-- Credit one refund row (idempotent): cap by what is still refundable, ledger entry keyed on the refund id.
create or replace function public.internal_settle_refund(p_refund uuid, p_by text) returns public.refunds
language plpgsql security definer set search_path = public as $$
declare r public.refunds; o public.orders; v_order bigint; v_led record;
begin
  select order_id into v_order from public.refunds where id = p_refund;
  if not found then perform public.internal_fail('no_refund', 'Refund tidak ditemukan.'); end if;
  select * into o from public.orders where id = v_order for update;                  -- lock order first, then refund (fixed order)
  select * into r from public.refunds where id = p_refund for update;
  if r.status = 'selesai' then return r; end if;
  if r.status = 'ditolak' then perform public.internal_fail('already_rejected', 'Refund ini sudah ditolak.'); end if;
  if r.amount > o.charge - o.refunded_amount then
    perform public.internal_fail('refund_exceeds_charge',
      'Refund melebihi sisa yang bisa dikembalikan (' || public.fmt_rupiah(o.charge - o.refunded_amount) || ').');
  end if;
  select * into v_led from public.apply_ledger_entry(r.user_id, 'refund', r.amount, 'refund', r.id::text,
    'Refund pesanan #' || o.id || ' (' || r.reason || ')', p_by);
  if not v_led.duplicate then
    update public.orders set refunded_amount = refunded_amount + r.amount where id = o.id;
  end if;
  update public.refunds set status = 'selesai', processed_by = p_by, processed_at = now() where id = r.id returning * into r;
  perform public.internal_notify(r.user_id, 'refund', 'Refund ' || public.fmt_rupiah(r.amount) || ' masuk',
    'Refund untuk pesanan #' || o.id || ' sudah masuk ke saldomu.', '/dashboard/refunds', 'refund:' || r.id);
  return r;
end $$;

-- Create (and, by default, settle) a refund for an order. Idempotent per (order, reason) for non-manual reasons.
-- p_amount = null -> computed from the order: dibatalkan / gagal_kirim = full charge; sebagian = floor(charge * remains / quantity);
-- user_cancel = floor(charge * remains * percent / (quantity * 100)). Never more than charge - refunded_amount.
create or replace function public.create_refund_for_order(
  p_order bigint, p_reason text, p_amount bigint default null, p_source text default 'auto', p_by text default 'system',
  p_note text default null, p_settle boolean default true, p_policy_percent int default null, p_cancel_request uuid default null
) returns table (refund_id uuid, amount bigint, status text, created boolean)
language plpgsql security definer set search_path = public as $$
declare o public.orders; prof public.profiles; existing public.refunds; r public.refunds; v_amount bigint; v_remaining bigint; v_rem bigint; v_percent int;
begin
  if p_reason not in ('dibatalkan', 'sebagian', 'gagal_kirim', 'manual', 'user_cancel') then perform public.internal_fail('bad_reason', 'Alasan refund tidak valid.'); end if;
  if p_source not in ('auto', 'admin', 'user_request') then perform public.internal_fail('bad_source', 'Sumber refund tidak valid.'); end if;

  select * into o from public.orders where id = p_order for update;               -- serialises concurrent refunds of one order
  if not found then perform public.internal_fail('no_order', 'Pesanan tidak ditemukan.'); end if;
  select * into prof from public.profiles where id = o.user_id;
  v_remaining := o.charge - o.refunded_amount;

  if p_reason <> 'manual' then
    select * into existing from public.refunds f
     where f.order_id = o.id and f.reason = p_reason and not f.reversed and f.status <> 'ditolak';
    if found then
      refund_id := existing.id; amount := existing.amount; status := existing.status; created := false; return next; return;
    end if;
  end if;

  -- A cancellation the USER asked for never gets the automatic 100% refund: it goes through approve_refund + the policy.
  if p_source = 'auto' and p_reason = 'dibatalkan' and o.cancelled_by = 'user' then
    refund_id := null; amount := 0; status := null; created := false; return next; return;
  end if;

  v_rem := least(greatest(o.remains, 0), o.quantity);
  v_percent := coalesce(p_policy_percent, (select (data #>> '{cancelPolicy,refundPercent}')::int from public.site_settings), 50);
  if p_amount is not null then
    v_amount := p_amount;
    if v_amount <= 0 then perform public.internal_fail('bad_amount', 'Nominal refund harus lebih dari nol.'); end if;
    if v_amount > v_remaining then
      perform public.internal_fail('refund_exceeds_charge', 'Refund melebihi sisa yang bisa dikembalikan (' || public.fmt_rupiah(v_remaining) || ').');
    end if;
  else
    v_amount := case p_reason
      when 'dibatalkan' then o.charge
      when 'gagal_kirim' then o.charge
      when 'sebagian' then (o.charge * v_rem) / o.quantity                        -- bigint division floors
      when 'user_cancel' then (o.charge * v_rem * v_percent) / (o.quantity::bigint * 100)
      else null end;
    if v_amount is null then perform public.internal_fail('bad_amount', 'Nominal refund wajib diisi untuk refund manual.'); end if;
    v_amount := least(v_amount, v_remaining);
    if v_amount <= 0 then refund_id := null; amount := 0; status := null; created := false; return next; return; end if;
  end if;

  if p_reason = 'manual' then
    if length(btrim(coalesce(p_note, ''))) < 10 then perform public.internal_fail('note_too_short', 'Alasan minimal 10 karakter.'); end if;
    if exists (select 1 from public.refunds f where f.order_id = o.id and f.reason = 'manual' and f.status = 'menunggu') then
      perform public.internal_fail('refund_pending', 'Masih ada refund manual yang menunggu untuk pesanan ini.');
    end if;
  end if;

  begin
    insert into public.refunds (order_id, user_id, amount, reason, source, status, note, policy_percent, cancel_request_id)
    values (o.id, o.user_id, v_amount, p_reason, p_source, 'menunggu', p_note,
            case when p_reason = 'user_cancel' then v_percent end, p_cancel_request)
    returning * into r;
  exception when unique_violation then
    select * into existing from public.refunds f where f.order_id = o.id and f.reason = p_reason and not f.reversed and f.status <> 'ditolak';
    refund_id := existing.id; amount := existing.amount; status := existing.status; created := false; return next; return;
  end;

  -- Auto refunds of users under review wait for an admin; everything else settles now when asked to.
  if p_settle and not (p_source = 'auto' and prof.manual_approval) then
    r := public.internal_settle_refund(r.id, p_by);
    if p_source = 'auto' then
      perform public.internal_audit(null, 'refund.auto', 'refund', r.id::text, null, jsonb_build_object('orderId', o.id, 'amount', v_amount, 'reason', p_reason));
    end if;
  elsif p_source = 'auto' then
    perform public.internal_audit(null, 'refund.auto_held', 'refund', r.id::text, null, jsonb_build_object('orderId', o.id, 'amount', v_amount));
  end if;

  refund_id := r.id; amount := r.amount; status := r.status; created := true;
  return next;
end $$;

-- Admin approves a waiting refund. user_cancel: cancels the order using the policy formula on the CURRENT order state.
create or replace function public.approve_refund(
  p_refund uuid, p_admin uuid, p_override_amount bigint default null, p_override_reason text default null
) returns table (refund_id uuid, amount bigint, status text, duplicate boolean)
language plpgsql security definer set search_path = public as $$
declare r public.refunds; o public.orders; v_order bigint; v_amount bigint; v_percent int; v_remaining bigint; v_rem bigint; v_note text;
begin
  perform public.internal_require_admin(p_admin);
  select f.order_id into v_order from public.refunds f where f.id = p_refund;
  if not found then perform public.internal_fail('no_refund', 'Refund tidak ditemukan.'); end if;
  select * into o from public.orders where id = v_order for update;
  select * into r from public.refunds where id = p_refund for update;
  if r.status = 'ditolak' then perform public.internal_fail('already_rejected', 'Refund ini sudah ditolak.'); end if;
  if r.status = 'selesai' then refund_id := r.id; amount := r.amount; status := r.status; duplicate := true; return next; return; end if;

  if r.reason = 'user_cancel' then
    if o.status not in ('menunggu', 'diproses', 'berjalan') then
      perform public.internal_fail('not_cancellable', 'Pesanan sudah selesai atau dibatalkan. Tolak permintaan ini.');
    end if;
    v_percent := coalesce(r.policy_percent, (select (data #>> '{cancelPolicy,refundPercent}')::int from public.site_settings), 50);
    v_remaining := o.charge - o.refunded_amount;
    v_rem := least(greatest(o.remains, 0), o.quantity);
    v_amount := greatest(0, least((o.charge * v_rem * v_percent) / (o.quantity::bigint * 100), v_remaining));
    v_note := r.note;
    if p_override_amount is not null then
      if length(btrim(coalesce(p_override_reason, ''))) < 10 then perform public.internal_fail('override_reason', 'Alasan mengubah nominal minimal 10 karakter.'); end if;
      if p_override_amount <= 0 then perform public.internal_fail('bad_amount', 'Nominal harus lebih dari nol.'); end if;
      if p_override_amount > v_remaining then
        perform public.internal_fail('refund_exceeds_charge', 'Nominal melebihi sisa yang bisa direfund (' || public.fmt_rupiah(v_remaining) || ').');
      end if;
      v_amount := p_override_amount;
      v_note := btrim(coalesce(r.note, '') || ' Nominal diubah admin: ' || btrim(p_override_reason));
      update public.refunds set overridden = true where id = r.id;
    end if;
    if v_amount <= 0 then
      perform public.internal_fail('nothing_to_refund', 'Tidak ada bagian yang belum terkirim, jadi tidak ada yang direfund. Tolak permintaan ini.');
    end if;
    update public.refunds set amount = v_amount, policy_percent = v_percent, note = v_note where id = r.id;
    update public.orders set status = 'dibatalkan', cancelled_by = 'user', cancel_policy_percent = v_percent, completed_at = now() where id = o.id;
    if r.cancel_request_id is not null then update public.cancel_requests set status = 'selesai' where id = r.cancel_request_id; end if;
    perform public.internal_notify(o.user_id, 'pesanan', 'Pesanan #' || o.id || ' dibatalkan', 'Buka halaman pesanan untuk melihat detailnya.',
      '/dashboard/orders?search=' || o.id, 'order:' || o.id || ':dibatalkan');
  end if;

  r := public.internal_settle_refund(r.id, p_admin::text);
  perform public.internal_audit(p_admin, 'refund.approve', 'refund', r.id::text, jsonb_build_object('status', 'menunggu'),
    jsonb_build_object('status', r.status, 'amount', r.amount, 'orderId', r.order_id));
  refund_id := r.id; amount := r.amount; status := r.status; duplicate := false;
  return next;
end $$;

create or replace function public.reject_refund(p_refund uuid, p_admin uuid, p_reason text) returns public.refunds
language plpgsql security definer set search_path = public as $$
declare r public.refunds;
begin
  perform public.internal_require_admin(p_admin);
  if length(btrim(coalesce(p_reason, ''))) < 3 then perform public.internal_fail('reason_required', 'Alasan penolakan wajib diisi.'); end if;
  select * into r from public.refunds where id = p_refund for update;
  if not found then perform public.internal_fail('no_refund', 'Refund tidak ditemukan.'); end if;
  if r.status <> 'menunggu' then perform public.internal_fail('already_processed', 'Refund ini sudah diproses.'); end if;
  update public.refunds set status = 'ditolak', processed_by = p_admin::text, reject_reason = btrim(p_reason), processed_at = now()
   where id = r.id returning * into r;
  if r.cancel_request_id is not null then
    update public.cancel_requests set status = 'ditolak', reject_reason = btrim(p_reason) where id = r.cancel_request_id;
  end if;
  perform public.internal_notify(r.user_id, 'refund', case when r.reason = 'user_cancel' then 'Pembatalan ditolak' else 'Permintaan refund ditolak' end,
    'Pesanan #' || r.order_id || ': ' || btrim(p_reason), '/dashboard/refunds', 'refund-rejected:' || r.id);
  perform public.internal_audit(p_admin, 'refund.reject', 'refund', r.id::text, jsonb_build_object('status', 'menunggu'),
    jsonb_build_object('status', 'ditolak', 'reason', btrim(p_reason)));
  return r;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- credit_deposit: idempotent by external_id (and by deposit id / status); deposit + tier bonus through the ledger
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.credit_deposit(
  p_external_id text, p_user_id uuid, p_amount bigint, p_method text, p_deposit_id uuid default null, p_by text default 'webhook'
) returns table (deposit_id uuid, bonus bigint, duplicate boolean)
language plpgsql security definer set search_path = public as $$
declare d public.deposits; v_percent int; v_bonus bigint; v_large bigint; v_name text;
begin
  if p_amount is null or p_amount <= 0 then perform public.internal_fail('bad_amount', 'Nominal tidak valid.'); end if;

  if p_deposit_id is not null then
    select * into d from public.deposits where id = p_deposit_id for update;
    if not found then perform public.internal_fail('no_deposit', 'Deposit tidak ditemukan.'); end if;
  elsif p_external_id is not null then
    select * into d from public.deposits where external_id = p_external_id for update;
  end if;

  if d.id is null then                                     -- gateway pushed a payment we have no row for: create it
    if not exists (select 1 from public.profiles where id = p_user_id) then perform public.internal_fail('no_user', 'Pengguna tidak ditemukan.'); end if;
    begin
      insert into public.deposits (user_id, method, amount, status, external_id)
      values (p_user_id, coalesce(p_method, 'gateway'), p_amount, 'menunggu', p_external_id) returning * into d;
    exception when unique_violation then                    -- concurrent delivery of the same external_id
      select * into d from public.deposits where external_id = p_external_id for update;
    end;
  end if;

  if p_user_id is not null and d.user_id <> p_user_id then perform public.internal_fail('user_mismatch', 'Pengguna tidak cocok dengan deposit.'); end if;
  if d.amount <> p_amount then perform public.internal_fail('amount_mismatch', 'Nominal tidak cocok dengan deposit.'); end if;
  if p_external_id is not null and d.external_id is not null and d.external_id <> p_external_id then
    perform public.internal_fail('duplicate_external_id', 'ID transaksi tidak cocok dengan deposit ini.');
  end if;
  if p_external_id is not null and d.external_id is null and exists (select 1 from public.deposits x where x.external_id = p_external_id and x.id <> d.id) then
    perform public.internal_fail('duplicate_external_id', 'ID transaksi sudah dipakai deposit lain.');
  end if;

  if d.status = 'berhasil' then deposit_id := d.id; bonus := d.bonus; duplicate := true; return next; return; end if;

  perform public.apply_ledger_entry(d.user_id, 'deposit', d.amount, 'deposit', d.id::text, 'Deposit ' || d.method, p_by);

  select (t ->> 'percent')::int into v_percent
    from jsonb_array_elements(coalesce((select data #> '{payments,bonusTiers}' from public.site_settings), '[]'::jsonb)) t
   where d.amount >= (t ->> 'min')::bigint
   order by (t ->> 'min')::bigint desc limit 1;
  v_bonus := (d.amount * coalesce(v_percent, 0)) / 100;
  if v_bonus > 0 then
    perform public.apply_ledger_entry(d.user_id, 'bonus', v_bonus, 'deposit_bonus', d.id::text, 'Bonus deposit ' || v_percent || '%', p_by);
  end if;

  update public.deposits set status = 'berhasil', bonus = v_bonus, external_id = coalesce(p_external_id, external_id) where id = d.id;

  v_large := (select (data #>> '{notifications,largeDepositAmount}')::bigint from public.site_settings);
  if v_large is not null and d.amount >= v_large then
    select username::text into v_name from public.profiles where id = d.user_id;
    insert into public.admin_alerts (kind, message) values ('large_deposit', 'Deposit besar ' || public.fmt_rupiah(d.amount) || ' dari ' || v_name || '.');
  end if;
  perform public.internal_notify(d.user_id, 'deposit', 'Deposit ' || public.fmt_rupiah(d.amount) || ' berhasil',
    'Saldomu bertambah' || case when v_bonus > 0 then ' termasuk bonus ' || public.fmt_rupiah(v_bonus) else '' end || '.',
    '/dashboard/add-funds', 'deposit:' || d.id || ':ok');

  deposit_id := d.id; bonus := v_bonus; duplicate := false;
  return next;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- admin_adjust_balance: ledger entry + audit log in one transaction. p_amount is signed.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.admin_adjust_balance(p_admin uuid, p_user uuid, p_amount bigint, p_reason text, p_ref text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_before bigint; v_led record;
begin
  perform public.internal_require_admin(p_admin);
  if p_amount is null or p_amount = 0 or abs(p_amount) > 100000000 then
    perform public.internal_fail('bad_amount', 'Nominal harus antara 1 dan Rp 100.000.000.');
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 or length(p_reason) > 200 then
    perform public.internal_fail('bad_reason', 'Alasan minimal 5 karakter.');
  end if;
  select balance into v_before from public.profiles where id = p_user;
  if not found then perform public.internal_fail('no_user', 'Pengguna tidak ditemukan.'); end if;

  select * into v_led from public.apply_ledger_entry(p_user, 'adjustment', p_amount, 'admin_adjust',
    coalesce(p_ref, p_user::text || ':' || gen_random_uuid()::text), btrim(p_reason), p_admin::text);
  if not v_led.duplicate then
    perform public.internal_audit(p_admin, 'user.balance.adjust', 'user', p_user::text, jsonb_build_object('balance', v_before),
      jsonb_build_object('balance', v_led.new_balance, 'delta', p_amount, 'reason', btrim(p_reason)));
  end if;
  return v_led.new_balance;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- daily sanity job
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.verify_balances() returns table (user_id uuid, username text, stored bigint, computed bigint, diff bigint)
language sql security definer set search_path = public as $$
  select p.id, p.username::text, p.balance, coalesce(sum(l.amount), 0)::bigint, p.balance - coalesce(sum(l.amount), 0)::bigint
    from public.profiles p left join public.balance_ledger l on l.user_id = p.id
   group by p.id having p.balance <> coalesce(sum(l.amount), 0);
$$;

create or replace function public.run_sanity_check() returns public.sanity_runs
language plpgsql security definer set search_path = public as $$
declare r public.sanity_runs; v_bal int; v_ref int; v_stuck int; v_hours int;
begin
  select count(*) into v_bal from public.verify_balances();
  -- Orders in a refundable final status whose refunded amount differs from the calculated refund (user-cancel orders excluded).
  select count(*) into v_ref from public.orders o
   where not o.needs_manual_check and (
        (o.status in ('dibatalkan', 'gagal_kirim') and coalesce(o.cancelled_by, '') <> 'user' and o.refunded_amount <> o.charge)
     or (o.status = 'sebagian' and o.refunded_amount <> least(o.charge, (o.charge * least(greatest(o.remains, 0), o.quantity)) / o.quantity)));
  v_hours := coalesce((select (data #>> '{operations,stuckHours}')::int from public.site_settings), 24);
  select count(*) into v_stuck from public.orders where status in ('menunggu', 'diproses', 'berjalan') and created_at < now() - make_interval(hours => v_hours);
  insert into public.sanity_runs (balance_mismatches, refund_mismatches, discrepancies, stuck)
  values (v_bal, v_ref, v_bal + v_ref, v_stuck) returning * into r;
  return r;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- grants: server code (service_role) only
-- ---------------------------------------------------------------------------------------------------------------
revoke all on function public.internal_fail(text, text), public.fmt_rupiah(bigint),
  public.internal_notify(uuid, text, text, text, text, text), public.internal_audit(uuid, text, text, text, jsonb, jsonb),
  public.internal_require_admin(uuid), public.rate_limit_hit(text, int, int), public.rate_limit_reset(text),
  public.apply_ledger_entry(uuid, text, bigint, text, text, text, text), public.place_order(uuid, text, text, int, text),
  public.internal_settle_refund(uuid, text),
  public.create_refund_for_order(bigint, text, bigint, text, text, text, boolean, int, uuid),
  public.approve_refund(uuid, uuid, bigint, text), public.reject_refund(uuid, uuid, text),
  public.credit_deposit(text, uuid, bigint, text, uuid, text), public.admin_adjust_balance(uuid, uuid, bigint, text, text),
  public.verify_balances(), public.run_sanity_check()
  from public, anon, authenticated;
grant execute on function public.internal_fail(text, text), public.fmt_rupiah(bigint),
  public.internal_notify(uuid, text, text, text, text, text), public.internal_audit(uuid, text, text, text, jsonb, jsonb),
  public.internal_require_admin(uuid), public.rate_limit_hit(text, int, int), public.rate_limit_reset(text),
  public.apply_ledger_entry(uuid, text, bigint, text, text, text, text), public.place_order(uuid, text, text, int, text),
  public.internal_settle_refund(uuid, text),
  public.create_refund_for_order(bigint, text, bigint, text, text, text, boolean, int, uuid),
  public.approve_refund(uuid, uuid, bigint, text), public.reject_refund(uuid, uuid, text),
  public.credit_deposit(text, uuid, bigint, text, uuid, text), public.admin_adjust_balance(uuid, uuid, bigint, text, text),
  public.verify_balances(), public.run_sanity_check()
  to service_role;
