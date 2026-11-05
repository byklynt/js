-- Providers, catalogue, rules, orders.

create table public.providers (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  slug                  text not null unique,
  api_url               text not null default '',
  api_key_encrypted     text,                        -- AES-256-GCM (PROVIDER_KEY_ENC_KEY). Never selectable by API roles.
  mode                  text not null default 'live' check (mode in ('live', 'mock')),
  active                boolean not null default true,
  currency              text not null default 'USD',
  exchange_rate         numeric(18, 4),              -- null = "belum diatur"
  balance_native        numeric(18, 4),
  balance_idr           bigint,
  balance_at            timestamptz,
  low_balance_threshold bigint not null default 500000 check (low_balance_threshold >= 0),
  last_test             jsonb,
  last_sync_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create trigger providers_updated_at before update on public.providers for each row execute function public.set_updated_at();

create table public.service_categories (
  id          text primary key,                      -- stable slug, e.g. "instagram-followers"
  label       text not null,
  platform    text not null,
  sort_order  int not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index service_categories_platform_idx on public.service_categories (platform, sort_order);

create table public.services (
  id                   text primary key,             -- public service id shown to users
  provider_id          uuid not null references public.providers (id) on delete restrict,
  provider_service_id  text not null,
  category_id          text not null references public.service_categories (id) on delete restrict,
  name                 text not null,
  provider_name        text,
  platform             text not null,
  rate_provider        numeric(18, 6) not null default 0,                      -- provider price per 1000, provider currency
  provider_price       bigint not null default 0 check (provider_price >= 0),  -- cost per 1000 in Rupiah
  markup_type          text not null default 'persen' check (markup_type in ('persen', 'tetap')),
  markup_value         numeric(12, 4) not null default 0 check (markup_value >= 0),
  price_per_1000       bigint not null default 0 check (price_per_1000 >= 0),
  min                  int not null default 1 check (min >= 1),
  max                  bigint not null default 1000000000 check (max >= min),
  refill               boolean not null default false,
  refill_days          int check (refill_days is null or refill_days > 0),
  cancel               boolean not null default false,
  avg_time             text,
  speed                int,
  description          jsonb not null default '[]'::jsonb,
  badges               text[] not null default '{}',
  active               boolean not null default true,
  provider_removed     boolean not null default false,
  imported             boolean not null default false,
  sort_order           int not null default 0,
  synced_at            timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (provider_id, provider_service_id)
);
create index services_category_idx on public.services (category_id, sort_order, id) where active;
create index services_platform_idx on public.services (platform) where active;
create index services_provider_idx on public.services (provider_id);
create index services_price_idx on public.services (price_per_1000) where active;
create index services_name_trgm_idx on public.services using gin (name extensions.gin_trgm_ops);
create trigger services_updated_at before update on public.services for each row execute function public.set_updated_at();

-- What users must accept before ordering, per platform. `version` is bumped on every edit.
create table public.service_rules (
  platform    text primary key,
  label       text not null,
  title       text not null,
  bullets     text[] not null default '{}',
  version     text not null,
  updated_at  timestamptz not null default now()
);

create sequence public.orders_id_seq start 10001;
create table public.orders (
  id                      bigint primary key default nextval('public.orders_id_seq'),
  user_id                 uuid not null references public.profiles (id) on delete restrict,
  service_id              text not null references public.services (id) on delete restrict,
  provider_id             uuid not null references public.providers (id) on delete restrict,
  provider_order_id       text not null default '',
  link                    text not null,
  link_normalized         text generated always as (
                            regexp_replace(regexp_replace(lower(btrim(link)), '#.*$', ''), '/+$', '')
                          ) stored,
  quantity                int not null check (quantity > 0),
  charge                  bigint not null check (charge >= 0),
  provider_cost           bigint not null default 0 check (provider_cost >= 0),
  start_count             bigint not null default 0,
  remains                 bigint not null default 0 check (remains >= 0),
  status                  text not null default 'menunggu' check (status in
                            ('menunggu', 'diproses', 'berjalan', 'selesai', 'sebagian', 'dibatalkan', 'gagal_kirim')),
  refunded_amount         bigint not null default 0 check (refunded_amount >= 0),
  submit_attempts         int not null default 0,
  held                    boolean not null default false,      -- paid, not yet sent (flagged users)
  needs_manual_check      boolean not null default false,
  cancelled_by            text check (cancelled_by in ('user', 'provider')),
  cancel_policy_percent   int check (cancel_policy_percent between 0 and 100),
  accepted_rules_version  text,
  accepted_at             timestamptz,
  last_synced_at          timestamptz,
  completed_at            timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint orders_refund_le_charge check (refunded_amount <= charge)
);
alter sequence public.orders_id_seq owned by public.orders.id;
create index orders_user_created_idx on public.orders (user_id, created_at desc);
create index orders_status_idx on public.orders (status);
create index orders_provider_order_idx on public.orders (provider_id, provider_order_id);
create index orders_service_idx on public.orders (service_id);
create index orders_created_idx on public.orders (created_at desc);
-- Duplicate-link rule: one unfinished order per (user, service, normalised link).
create unique index orders_active_duplicate_idx on public.orders (user_id, service_id, link_normalized)
  where status in ('menunggu', 'diproses', 'berjalan') or held;
create trigger orders_updated_at before update on public.orders for each row execute function public.set_updated_at();

create table public.provider_sync_runs (
  id              uuid primary key default gen_random_uuid(),
  provider_id     uuid not null references public.providers (id) on delete cascade,
  started_at      timestamptz not null,
  finished_at     timestamptz not null,
  orders_checked  int not null default 0,
  orders_changed  int not null default 0,
  errors          int not null default 0,
  error_message   text
);
create index provider_sync_runs_provider_idx on public.provider_sync_runs (provider_id, started_at desc);
