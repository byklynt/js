-- Overlap protection for the scheduled jobs: a lease row per job (atomic acquire, expires on its own if a run dies).
create table public.cron_leases (
  name         text primary key,
  locked_until timestamptz not null default now(),
  locked_by    text not null default '',
  last_started timestamptz,
  last_finished timestamptz
);
alter table public.cron_leases enable row level security;   -- no policies, no grants: service role only

create or replace function public.acquire_cron_lease(p_name text, p_ttl_seconds int, p_owner text) returns boolean
language plpgsql security definer set search_path = public as $$
declare got text;
begin
  if coalesce(p_name, '') = '' or p_ttl_seconds < 1 or p_ttl_seconds > 3600 then
    perform public.internal_fail('bad_input', 'Parameter lease tidak valid.');
  end if;
  insert into public.cron_leases as l (name, locked_until, locked_by, last_started)
  values (p_name, now() + make_interval(secs => p_ttl_seconds), p_owner, now())
  on conflict (name) do update set locked_until = now() + make_interval(secs => p_ttl_seconds), locked_by = p_owner, last_started = now()
    where l.locked_until <= now()
  returning l.name into got;
  return got is not null;
end $$;

create or replace function public.release_cron_lease(p_name text, p_owner text) returns void
language sql security definer set search_path = public as $$
  update public.cron_leases set locked_until = now(), last_finished = now() where name = p_name and locked_by = p_owner;
$$;

revoke all on function public.acquire_cron_lease(text, int, text), public.release_cron_lease(text, text) from public, anon, authenticated;
grant execute on function public.acquire_cron_lease(text, int, text), public.release_cron_lease(text, text) to service_role;
