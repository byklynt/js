-- Core: extensions, helpers, profiles (+ signup trigger), is_admin().
-- Conventions: snake_case, uuid PKs, timestamptz, money as bigint Rupiah (never float), enums as text + check.

create extension if not exists citext with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- Default deny: nothing created in public from now on is reachable by API roles unless a later migration grants it.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------------------------------------------
create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  username        extensions.citext not null unique
                    check (username::text ~ '^[A-Za-z0-9_.]{3,24}$'),
  email           extensions.citext not null,
  role            text not null default 'user' check (role in ('user', 'reseller', 'admin')),
  status          text not null default 'aktif' check (status in ('aktif', 'diblokir')),
  balance         bigint not null default 0 check (balance >= 0),
  language        text not null default 'id' check (language in ('id', 'en')),
  avatar_url      text,
  referral_code   text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  referred_by     uuid references public.profiles (id) on delete set null,
  rank            text not null default 'Starter' check (rank in ('Starter', 'Silver', 'Gold', 'Reseller')),
  flagged         boolean not null default false,
  manual_approval boolean not null default false,    -- orders/refunds of this user wait for an admin
  prefs           jsonb not null default '{}'::jsonb, -- notification preferences, timezone, invoice details
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  last_login_at   timestamptz
);
create index profiles_email_idx on public.profiles (email);
create index profiles_referred_by_idx on public.profiles (referred_by) where referred_by is not null;
create index profiles_role_idx on public.profiles (role) where role <> 'user';
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();

-- Role check used by RLS. Reads the profiles TABLE, never the JWT (user_metadata is user-editable).
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and p.status = 'aktif');
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- Signup: the profile is created by this trigger from auth.users. Username comes from signup metadata (validated, unique).
-- role / balance are NEVER read from metadata.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare uname text;
begin
  uname := btrim(coalesce(new.raw_user_meta_data ->> 'username', ''));
  if uname !~ '^[A-Za-z0-9_.]{3,24}$' then
    raise exception 'Username tidak valid' using errcode = '22023';
  end if;
  if exists (select 1 from public.profiles where username = uname::extensions.citext) then
    raise exception 'Username sudah dipakai' using errcode = '23505';
  end if;
  insert into public.profiles (id, username, email, language)
  values (new.id, uname, coalesce(new.email, ''), case when new.raw_user_meta_data ->> 'language' = 'en' then 'en' else 'id' end);
  return new;
end $$;
revoke all on function public.handle_new_user() from public;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Keep profiles.email in step with auth.users.email.
create or replace function public.sync_profile_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end $$;
revoke all on function public.sync_profile_email() from public;
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (old.email is distinct from new.email) execute function public.sync_profile_email();
