-- Row Level Security: enabled on EVERY table, default deny.
-- Layers: (1) RLS policies, (2) table/column GRANTs (service_role keeps full access and bypasses RLS),
-- (3) a trigger that blocks sensitive profile columns even if a grant is ever widened by mistake.
-- Money tables have NO insert/update/delete grant for API roles: writes go through SECURITY DEFINER functions (server only).

alter table public.profiles            enable row level security;
alter table public.providers           enable row level security;
alter table public.service_categories  enable row level security;
alter table public.services            enable row level security;
alter table public.service_rules       enable row level security;
alter table public.orders              enable row level security;
alter table public.provider_sync_runs  enable row level security;
alter table public.balance_ledger      enable row level security;
alter table public.refunds             enable row level security;
alter table public.refill_requests     enable row level security;
alter table public.cancel_requests     enable row level security;
alter table public.deposits            enable row level security;
alter table public.webhook_events      enable row level security;
alter table public.tickets             enable row level security;
alter table public.ticket_messages     enable row level security;
alter table public.notifications       enable row level security;
alter table public.announcements       enable row level security;
alter table public.announcement_reads  enable row level security;
alter table public.favorites           enable row level security;
alter table public.api_keys            enable row level security;
alter table public.audit_logs          enable row level security;
alter table public.admin_backup_codes  enable row level security;
alter table public.admin_sessions      enable row level security;
alter table public.site_settings       enable row level security;
alter table public.rate_limits         enable row level security;
alter table public.user_notes          enable row level security;
alter table public.admin_alerts        enable row level security;
alter table public.sanity_runs         enable row level security;
alter table public.price_updates       enable row level security;

-- Start from zero for API roles on everything that already exists.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;

-- Helper for announcement audience.
create or replace function public.is_reseller_or_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('reseller', 'admin') and p.status = 'aktif');
$$;
revoke all on function public.is_reseller_or_admin() from public;
grant execute on function public.is_reseller_or_admin() to authenticated;

-- ---- profiles: own row + admin read; users may change ONLY language and avatar_url ----------------------------------
grant select on public.profiles to authenticated;
grant update (language, avatar_url) on public.profiles to authenticated;
create policy profiles_select_own   on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_select_admin on public.profiles for select to authenticated using (public.is_admin());
create policy profiles_update_own   on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create or replace function public.guard_profile_columns() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('anon', 'authenticated') and (
       new.role is distinct from old.role or new.balance is distinct from old.balance
    or new.status is distinct from old.status or new.rank is distinct from old.rank
    or new.flagged is distinct from old.flagged or new.manual_approval is distinct from old.manual_approval
    or new.username is distinct from old.username or new.email is distinct from old.email
    or new.referral_code is distinct from old.referral_code or new.referred_by is distinct from old.referred_by
    or new.id is distinct from old.id) then
    raise exception 'Kolom ini tidak bisa diubah langsung' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles for each row execute function public.guard_profile_columns();

-- ---- catalogue ------------------------------------------------------------------------------------------------------
-- Users read only public columns of active services (no provider_id, provider_price, markup, rate_provider, ...).
grant select (id, category_id, name, platform, price_per_1000, min, max, refill, refill_days, cancel, avg_time, speed,
              description, badges, active, provider_removed, sort_order)
  on public.services to authenticated;
create policy services_select_active on public.services for select to authenticated using (active and not provider_removed);
create policy services_select_admin  on public.services for select to authenticated using (public.is_admin());

grant select on public.service_categories to authenticated;
create policy categories_select_active on public.service_categories for select to authenticated using (active);
create policy categories_select_admin  on public.service_categories for select to authenticated using (public.is_admin());

grant select on public.service_rules to authenticated;
create policy rules_select on public.service_rules for select to authenticated using (true);

-- Providers: admin only, and never the encrypted key.
grant select (id, name, slug, api_url, mode, active, currency, exchange_rate, balance_native, balance_idr, balance_at,
              low_balance_threshold, last_test, last_sync_at, created_at, updated_at)
  on public.providers to authenticated;
create policy providers_select_admin on public.providers for select to authenticated using (public.is_admin());

-- ---- user-owned, read-only for clients (writes via server functions) ------------------------------------------------
grant select on public.orders, public.refunds, public.refill_requests, public.cancel_requests, public.deposits,
                public.balance_ledger to authenticated;
create policy orders_select_own   on public.orders          for select to authenticated using (user_id = auth.uid());
create policy orders_select_admin on public.orders          for select to authenticated using (public.is_admin());
create policy refunds_select_own  on public.refunds         for select to authenticated using (user_id = auth.uid());
create policy refunds_select_admin on public.refunds        for select to authenticated using (public.is_admin());
create policy refill_select_own   on public.refill_requests for select to authenticated using (user_id = auth.uid());
create policy refill_select_admin on public.refill_requests for select to authenticated using (public.is_admin());
create policy cancel_select_own   on public.cancel_requests for select to authenticated using (user_id = auth.uid());
create policy cancel_select_admin on public.cancel_requests for select to authenticated using (public.is_admin());
create policy deposits_select_own on public.deposits        for select to authenticated using (user_id = auth.uid());
create policy deposits_select_admin on public.deposits      for select to authenticated using (public.is_admin());
create policy ledger_select_own   on public.balance_ledger  for select to authenticated using (user_id = auth.uid());
create policy ledger_select_admin on public.balance_ledger  for select to authenticated using (public.is_admin());

-- Notifications: read own (realtime uses this policy). Mark-read goes through the server.
grant select on public.notifications to authenticated;
create policy notifications_select_own on public.notifications for select to authenticated using (user_id = auth.uid());

-- Tickets: own tickets; own messages except internal notes. Inserts only through the (rate limited) server function.
grant select on public.tickets, public.ticket_messages to authenticated;
create policy tickets_select_own   on public.tickets for select to authenticated using (user_id = auth.uid());
create policy tickets_select_admin on public.tickets for select to authenticated using (public.is_admin());
create policy ticket_messages_select_own on public.ticket_messages for select to authenticated
  using (not is_internal and exists (select 1 from public.tickets t where t.id = ticket_id and t.user_id = auth.uid()));
create policy ticket_messages_select_admin on public.ticket_messages for select to authenticated using (public.is_admin());

-- Announcements: same visibility as getVisibleAnnouncements (active, published, not expired, audience).
grant select on public.announcements to authenticated;
create policy announcements_select_visible on public.announcements for select to authenticated
  using (active and publish_at <= now() and (expires_at is null or expires_at > now())
         and (audience = 'semua' or public.is_reseller_or_admin()));
create policy announcements_select_admin on public.announcements for select to authenticated using (public.is_admin());

grant select on public.announcement_reads to authenticated;
create policy announcement_reads_select_own on public.announcement_reads for select to authenticated using (user_id = auth.uid());

-- Favorites: plain per-user preference, safe to write directly.
grant select, insert, delete on public.favorites to authenticated;
create policy favorites_select_own on public.favorites for select to authenticated using (user_id = auth.uid());
create policy favorites_insert_own on public.favorites for insert to authenticated with check (user_id = auth.uid());
create policy favorites_delete_own on public.favorites for delete to authenticated using (user_id = auth.uid());

-- API keys: list own (never the hash). Create/revoke through the server.
grant select (id, user_id, name, key_prefix, last_used_at, revoked_at, created_at) on public.api_keys to authenticated;
create policy api_keys_select_own on public.api_keys for select to authenticated using (user_id = auth.uid());

-- ---- admin-only reads -----------------------------------------------------------------------------------------------
grant select on public.audit_logs, public.provider_sync_runs, public.user_notes, public.admin_alerts,
                public.sanity_runs, public.price_updates to authenticated;
create policy audit_logs_select_admin on public.audit_logs         for select to authenticated using (public.is_admin());
create policy sync_runs_select_admin  on public.provider_sync_runs for select to authenticated using (public.is_admin());
create policy user_notes_select_admin on public.user_notes         for select to authenticated using (public.is_admin());
create policy admin_alerts_select_admin on public.admin_alerts     for select to authenticated using (public.is_admin());
create policy sanity_runs_select_admin on public.sanity_runs       for select to authenticated using (public.is_admin());
create policy price_updates_select_admin on public.price_updates   for select to authenticated using (public.is_admin());

-- ---- server-only tables: RLS on, no grants, no policies -------------------------------------------------------------
-- webhook_events, admin_backup_codes, admin_sessions, site_settings, rate_limits.
-- They are reachable only with the service role (server code).

-- ---- Realtime: notifications + ticket messages for the current user (RLS applies to the stream) ---------------------
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
    alter publication supabase_realtime add table public.ticket_messages;
  end if;
end $$;
