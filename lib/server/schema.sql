-- JagoanSosmed: order / refund / balance schema (Postgres, Supabase-compatible).
-- STATUS: reference only. The app currently runs on the in-memory mock store (lib/admin-db.ts).
-- The functions below are the SQL form of lib/server/*.ts; every money movement is ONE function = ONE transaction.

create table if not exists balance_ledger (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users(id),
  type           text not null check (type in ('deposit','order','refund','adjustment','bonus')),
  amount         bigint not null check (amount <> 0),          -- signed rupiah: credit > 0, debit < 0
  balance_before bigint not null,
  balance_after  bigint not null check (balance_after >= 0),
  ref_type       text not null,
  ref_id         text not null,
  note           text not null default '',
  created_by     text not null default 'system',
  created_at     timestamptz not null default now(),
  unique (type, ref_type, ref_id)                              -- idempotency: the same event can never post twice
);
create index if not exists balance_ledger_user_idx on balance_ledger (user_id, created_at desc);

-- Append-only: no UPDATE / DELETE, not even by the service role.
create or replace function balance_ledger_immutable() returns trigger language plpgsql as $$
begin raise exception 'balance_ledger is append-only'; end $$;
create trigger balance_ledger_no_update before update or delete on balance_ledger
  for each row execute function balance_ledger_immutable();

alter table orders
  add column if not exists provider_cost    bigint not null default 0,
  add column if not exists refunded_amount  bigint not null default 0 check (refunded_amount >= 0),
  add column if not exists submit_attempts  int    not null default 0,
  add column if not exists last_synced_at   timestamptz,
  add column if not exists completed_at     timestamptz,
  add constraint orders_refund_le_charge check (refunded_amount <= charge),
  add constraint orders_status_chk check (status in
    ('menunggu','diproses','berjalan','selesai','sebagian','dibatalkan','gagal_kirim'));

create table if not exists refunds (
  id            uuid primary key default gen_random_uuid(),
  order_id      text not null references orders(id),
  user_id       uuid not null references users(id),
  amount        bigint not null check (amount > 0),
  reason        text not null check (reason in ('dibatalkan','sebagian','gagal_kirim','manual')),
  source        text not null check (source in ('auto','admin','user_request')),
  status        text not null default 'menunggu' check (status in ('menunggu','selesai','ditolak')),
  processed_by  text,
  reject_reason text,
  note          text,
  reversed      boolean not null default false,
  created_at    timestamptz not null default now(),
  processed_at  timestamptz
);
-- One automatic refund per order and reason (manual refunds may repeat, but their total is capped by orders.refunded_amount).
create unique index if not exists refunds_auto_unique on refunds (order_id, reason) where reason <> 'manual' and not reversed;

create table if not exists refill_requests (
  id uuid primary key default gen_random_uuid(), order_id text not null references orders(id), user_id uuid not null,
  status text not null default 'menunggu' check (status in ('menunggu','berjalan','selesai','ditolak')),
  provider_request_id text, reject_reason text, created_at timestamptz not null default now()
);
create table if not exists cancel_requests (like refill_requests including all);

create table if not exists provider_sync_runs (
  id uuid primary key default gen_random_uuid(), provider_id text not null,
  started_at timestamptz not null, finished_at timestamptz not null,
  orders_checked int not null default 0, orders_changed int not null default 0, errors int not null default 0, error_message text
);

alter table deposits add column if not exists external_id text unique;   -- gateway transaction ID: a webhook cannot credit twice

-- The ONLY way to change users.balance.
create or replace function apply_ledger_entry(
  p_user uuid, p_type text, p_amount bigint, p_ref_type text, p_ref_id text, p_note text, p_by text
) returns balance_ledger language plpgsql security definer as $$
declare u users; existing balance_ledger; entry balance_ledger;
begin
  select * into existing from balance_ledger where type = p_type and ref_type = p_ref_type and ref_id = p_ref_id;
  if found then return existing; end if;                                 -- idempotent replay
  select * into u from users where id = p_user for update;              -- row lock: serialises concurrent spends
  if not found then raise exception 'Pengguna tidak ditemukan'; end if;
  if p_amount < 0 and u.balance + p_amount < 0 then raise exception 'Saldo tidak cukup'; end if;
  insert into balance_ledger (user_id, type, amount, balance_before, balance_after, ref_type, ref_id, note, created_by)
    values (p_user, p_type, p_amount, u.balance, u.balance + p_amount, p_ref_type, p_ref_id, p_note, p_by)
    returning * into entry;
  update users set balance = u.balance + p_amount where id = p_user;
  return entry;
end $$;

-- Settle one refund: cap by charge, credit through the ledger, update the order. Safe to call twice.
create or replace function settle_refund(p_refund uuid, p_by text) returns refunds language plpgsql security definer as $$
declare r refunds; o orders;
begin
  select * into r from refunds where id = p_refund for update;
  if r.status = 'selesai' then return r; end if;
  if r.status = 'ditolak' then raise exception 'Refund sudah ditolak'; end if;
  select * into o from orders where id = r.order_id for update;
  if r.amount > o.charge - o.refunded_amount then raise exception 'Refund melebihi sisa yang bisa dikembalikan'; end if;
  perform apply_ledger_entry(r.user_id, 'refund', r.amount, 'refund', r.id::text, 'Refund pesanan #' || o.id, p_by);
  update orders set refunded_amount = refunded_amount + r.amount where id = o.id;
  update refunds set status = 'selesai', processed_by = p_by, processed_at = now() where id = r.id returning * into r;
  return r;
end $$;

-- Place an order: validate, debit and insert in ONE transaction. The provider call happens AFTER commit (see orders.ts).
-- TODO(db): write place_order(p_user, p_service, p_link, p_quantity) the same way as settle_refund above.

-- Sanity job: users whose stored balance differs from the ledger sum.
create or replace view balance_mismatches as
  select u.id, u.balance as stored, coalesce(sum(l.amount), 0) as computed
  from users u left join balance_ledger l on l.user_id = u.id
  group by u.id having u.balance <> coalesce(sum(l.amount), 0);

-- RLS: users read only their own ledger / orders / refunds; all writes go through the functions above (server only).
alter table balance_ledger enable row level security;
create policy ledger_own_read on balance_ledger for select using (user_id = auth.uid());
alter table refunds enable row level security;
create policy refunds_own_read on refunds for select using (user_id = auth.uid());

-- Admin 2FA (replaces the dev JSON store). Only server code with the service role may touch it.
create table if not exists admin_2fa (
  admin_id            uuid primary key references users(id) on delete cascade,
  secret_encrypted    text not null,                       -- AES-256-GCM, key in ADMIN_2FA_ENC_KEY (never in the database)
  enabled             boolean not null default false,
  enabled_at          timestamptz,
  backup_codes_hashed jsonb not null default '[]',        -- scrypt hashes, 10 single-use codes
  last_used_step      bigint not null default 0,          -- TOTP replay protection
  updated_at          timestamptz not null default now()
);
create table if not exists admin_2fa_pending (
  admin_id         uuid primary key references users(id) on delete cascade,
  secret_encrypted text not null,
  expires_at       timestamptz not null                    -- 10 minutes
);
alter table admin_2fa enable row level security;           -- no policies = no access for anon / authenticated roles
alter table admin_2fa_pending enable row level security;
