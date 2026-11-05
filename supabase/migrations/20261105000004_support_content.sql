-- Tickets, notifications, announcements, favorites, API keys, audit, settings, rate limits, admin 2FA backup codes.

create table public.tickets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 200),
  category    text not null default 'lainnya',
  subcategory text,
  status      text not null default 'menunggu' check (status in ('dibalas', 'menunggu', 'ditutup')),
  assignee    uuid references public.profiles (id) on delete set null,
  order_ids   bigint[] not null default '{}',
  user_unread boolean not null default false,       -- support replied and the user has not opened it yet
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index tickets_user_idx on public.tickets (user_id, updated_at desc);
create index tickets_status_idx on public.tickets (status, updated_at desc);
create trigger tickets_updated_at before update on public.tickets for each row execute function public.set_updated_at();

create table public.ticket_messages (
  id           uuid primary key default gen_random_uuid(),
  ticket_id    uuid not null references public.tickets (id) on delete cascade,
  sender       text not null check (sender in ('user', 'support')),
  sender_id    uuid references public.profiles (id) on delete set null,
  body         text not null check (char_length(body) between 1 and 2000),
  is_internal  boolean not null default false,       -- admin-only note
  attachments  jsonb not null default '[]'::jsonb,   -- [{id,name,size,type,path}] paths in the ticket-attachments bucket
  created_at   timestamptz not null default now(),
  constraint ticket_messages_internal_support check (not is_internal or sender = 'support')
);
create index ticket_messages_ticket_idx on public.ticket_messages (ticket_id, created_at);

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,   -- also admins (admin bell)
  type        text not null check (type in ('pesanan', 'refund', 'deposit', 'tiket', 'pembaruan', 'pengumuman', 'sistem')),
  title       text not null,
  body        text not null default '',
  href        text,
  read_at     timestamptz,
  dedupe_key  text,
  created_at  timestamptz not null default now(),
  constraint notifications_dedupe unique (user_id, dedupe_key)
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

create table public.announcements (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  body         text not null,
  audience     text not null default 'semua' check (audience in ('semua', 'reseller')),
  placements   text[] not null default '{dashboard}',
  level        text not null default 'info' check (level in ('info', 'penting', 'peringatan')),
  publish_at   timestamptz not null default now(),
  expires_at   timestamptz,
  active       boolean not null default true,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint announcements_placements check (placements <@ array['dashboard', 'pembaruan']::text[])
);
create index announcements_visible_idx on public.announcements (publish_at desc) where active;
create trigger announcements_updated_at before update on public.announcements for each row execute function public.set_updated_at();

create table public.announcement_reads (
  user_id   uuid primary key references public.profiles (id) on delete cascade,
  seen_at   timestamptz not null default now()      -- last time /dashboard/updates was opened (clears the badge)
);

create table public.favorites (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  service_id  text not null references public.services (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, service_id)
);

create table public.api_keys (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  name        text not null default 'Default',
  key_prefix  text not null,                         -- first characters, for display
  key_hash    text not null unique,                  -- sha-256 of the key; the key itself is shown once
  last_used_at timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index api_keys_user_idx on public.api_keys (user_id);

create table public.audit_logs (
  id           uuid primary key default gen_random_uuid(),
  admin_id     uuid references public.profiles (id) on delete set null,
  admin_name   text not null,
  action       text not null,
  target_type  text not null,
  target_id    text not null,
  before       jsonb,
  after        jsonb,
  created_at   timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_admin_idx on public.audit_logs (admin_id);

create or replace function public.audit_logs_immutable() returns trigger
language plpgsql set search_path = public as $$
begin raise exception 'audit_logs is append-only'; end $$;
create trigger audit_logs_no_change before update or delete on public.audit_logs
  for each row execute function public.audit_logs_immutable();

-- Admin 2FA lives in Supabase Auth MFA (TOTP). Only the backup codes (hashed) are ours.
create table public.admin_backup_codes (
  id         uuid primary key default gen_random_uuid(),
  admin_id   uuid not null references public.profiles (id) on delete cascade,
  code_hash  text not null,                          -- scrypt hash, single use
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index admin_backup_codes_admin_idx on public.admin_backup_codes (admin_id) where used_at is null;

-- Panel-side view of admin sign-ins ("Cabut sesi"): Supabase has no per-session revoke API for users, so we track ours.
create table public.admin_sessions (
  id            uuid primary key default gen_random_uuid(),
  admin_id      uuid not null references public.profiles (id) on delete cascade,
  ip            text not null default '',
  user_agent    text not null default '',
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  revoked_at    timestamptz
);
create index admin_sessions_admin_idx on public.admin_sessions (admin_id, created_at desc);

-- Single-row site configuration (general, payments + bonus tiers, ranks, pricing, limits, cancel policy, ...).
create table public.site_settings (
  id          boolean primary key default true check (id),   -- exactly one row
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id) on delete set null
);
create trigger site_settings_updated_at before update on public.site_settings for each row execute function public.set_updated_at();

-- Atomic fixed-window counters (login attempts, tickets, orders per minute).
create table public.rate_limits (
  key           text primary key,
  window_start  timestamptz not null default now(),
  hits          int not null default 0
);

create table public.user_notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  author_id   uuid references public.profiles (id) on delete set null,
  body        text not null,
  created_at  timestamptz not null default now()
);
create index user_notes_user_idx on public.user_notes (user_id, created_at desc);

-- Admin alerts + sanity runs + price changes (operational feeds shown in the admin panel).
create table public.admin_alerts (
  id           uuid primary key default gen_random_uuid(),
  provider_id  uuid references public.providers (id) on delete set null,
  kind         text not null,
  message      text not null,
  created_at   timestamptz not null default now()
);
create index admin_alerts_created_idx on public.admin_alerts (created_at desc);

create table public.sanity_runs (
  id                  uuid primary key default gen_random_uuid(),
  balance_mismatches  int not null default 0,
  refund_mismatches   int not null default 0,
  discrepancies       int not null default 0,
  stuck               int not null default 0,
  created_at          timestamptz not null default now()
);

create table public.price_updates (
  id          uuid primary key default gen_random_uuid(),
  service_id  text not null,
  platform    text not null,
  name        text not null,
  type        text not null check (type in ('naik', 'turun', 'baru', 'nonaktif', 'perubahan')),
  detail      text not null default '',
  created_at  timestamptz not null default now()
);
create index price_updates_created_idx on public.price_updates (created_at desc);
