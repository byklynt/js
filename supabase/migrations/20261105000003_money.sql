-- Money tables. Writes happen ONLY through SECURITY DEFINER functions (next migration), called with the service role.

create table public.balance_ledger (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete restrict,
  type            text not null check (type in ('deposit', 'order', 'refund', 'adjustment', 'bonus')),
  amount          bigint not null check (amount <> 0),            -- signed Rupiah: credit > 0, debit < 0
  balance_before  bigint not null check (balance_before >= 0),
  balance_after   bigint not null check (balance_after >= 0),
  ref_type        text not null,
  ref_id          text not null,
  note            text not null default '',
  created_by      text not null default 'system',
  created_at      timestamptz not null default now(),
  constraint balance_ledger_math check (balance_after = balance_before + amount),
  constraint balance_ledger_idempotent unique (type, ref_type, ref_id)  -- the same event can never post twice
);
create index balance_ledger_user_idx on public.balance_ledger (user_id, created_at desc);

-- Append-only: no UPDATE / DELETE, not even for the service role.
create or replace function public.balance_ledger_immutable() returns trigger
language plpgsql set search_path = public as $$
begin raise exception 'balance_ledger is append-only'; end $$;
create trigger balance_ledger_no_change before update or delete on public.balance_ledger
  for each row execute function public.balance_ledger_immutable();
create trigger balance_ledger_no_truncate before truncate on public.balance_ledger
  for each statement execute function public.balance_ledger_immutable();

create table public.refunds (
  id             uuid primary key default gen_random_uuid(),
  order_id       bigint not null references public.orders (id) on delete restrict,
  user_id        uuid not null references public.profiles (id) on delete restrict,
  amount         bigint not null check (amount > 0),
  reason         text not null check (reason in ('dibatalkan', 'sebagian', 'gagal_kirim', 'manual', 'user_cancel')),
  source         text not null check (source in ('auto', 'admin', 'user_request')),
  status         text not null default 'menunggu' check (status in ('menunggu', 'selesai', 'ditolak')),
  processed_by   text,
  reject_reason  text,
  note           text,
  reversed       boolean not null default false,    -- a gagal_kirim order sent again and charged again
  overridden     boolean not null default false,    -- amount set by an admin instead of the formula
  policy_percent int check (policy_percent between 0 and 100),
  cancel_request_id uuid,
  created_at     timestamptz not null default now(),
  processed_at   timestamptz
);
create index refunds_order_idx on public.refunds (order_id);
create index refunds_user_idx on public.refunds (user_id, created_at desc);
create index refunds_status_idx on public.refunds (status) where status = 'menunggu';
-- One automatic refund per (order, reason). Manual refunds may repeat; their total is capped by orders.refunded_amount.
create unique index refunds_one_per_reason_idx on public.refunds (order_id, reason)
  where reason <> 'manual' and not reversed and status <> 'ditolak';

create table public.refill_requests (
  id                   uuid primary key default gen_random_uuid(),
  order_id             bigint not null references public.orders (id) on delete restrict,
  user_id              uuid not null references public.profiles (id) on delete restrict,
  status               text not null default 'menunggu' check (status in ('menunggu', 'berjalan', 'selesai', 'ditolak')),
  provider_request_id  text,
  reject_reason        text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index refill_requests_order_idx on public.refill_requests (order_id, created_at desc);
create index refill_requests_user_idx on public.refill_requests (user_id, created_at desc);
create trigger refill_requests_updated_at before update on public.refill_requests for each row execute function public.set_updated_at();

create table public.cancel_requests (
  id                   uuid primary key default gen_random_uuid(),
  order_id             bigint not null references public.orders (id) on delete restrict,
  user_id              uuid not null references public.profiles (id) on delete restrict,
  status               text not null default 'menunggu' check (status in ('menunggu', 'berjalan', 'selesai', 'ditolak')),
  provider_request_id  text,
  reject_reason        text,
  age_hours            int,
  remains_at_request   bigint,
  calculated_refund    bigint,
  policy_percent       int,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index cancel_requests_order_idx on public.cancel_requests (order_id, created_at desc);
create index cancel_requests_user_idx on public.cancel_requests (user_id, created_at desc);
create trigger cancel_requests_updated_at before update on public.cancel_requests for each row execute function public.set_updated_at();
-- At most one open request per order.
create unique index refill_requests_open_idx on public.refill_requests (order_id) where status in ('menunggu', 'berjalan');
create unique index cancel_requests_open_idx on public.cancel_requests (order_id) where status in ('menunggu', 'berjalan');

create table public.deposits (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete restrict,
  method       text not null,
  amount       bigint not null check (amount > 0),
  bonus        bigint not null default 0 check (bonus >= 0),
  status       text not null default 'menunggu' check (status in ('menunggu', 'berhasil', 'gagal', 'kedaluwarsa')),
  external_id  text unique,                      -- gateway transaction id: a webhook can never credit twice
  proof        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index deposits_user_idx on public.deposits (user_id, created_at desc);
create index deposits_status_idx on public.deposits (status, created_at desc);
create trigger deposits_updated_at before update on public.deposits for each row execute function public.set_updated_at();

-- Every webhook delivery, deduplicated by the gateway's id.
create table public.webhook_events (
  id           uuid primary key default gen_random_uuid(),
  source       text not null default 'payment',
  external_id  text not null unique,
  payload      jsonb not null default '{}'::jsonb,
  processed    boolean not null default false,
  received_at  timestamptz not null default now()
);

-- Daily sanity job: stored balance vs ledger sum.
create or replace view public.balance_mismatches with (security_invoker = true) as
  select p.id as user_id, p.username, p.balance as stored, coalesce(sum(l.amount), 0)::bigint as computed
  from public.profiles p left join public.balance_ledger l on l.user_id = p.id
  group by p.id having p.balance <> coalesce(sum(l.amount), 0);
