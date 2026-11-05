-- Sidebar badges of the admin panel in ONE indexed round trip: revenue since a date (SUM over a bounded range), tickets and deposits waiting.
create index if not exists deposits_paid_idx on public.deposits (updated_at) where status = 'berhasil';
create index if not exists deposits_waiting_idx on public.deposits (created_at) where status = 'menunggu';
create index if not exists tickets_waiting_idx on public.tickets (updated_at) where status = 'menunggu';

create or replace function public.admin_shell_stats(p_since timestamptz)
returns table (revenue bigint, tickets_waiting bigint, deposits_waiting bigint)
language sql stable security definer set search_path = public as $$
  select coalesce((select sum(d.amount) from public.deposits d where d.status = 'berhasil' and d.updated_at >= p_since), 0)::bigint,
         (select count(*) from public.tickets t where t.status = 'menunggu'),
         (select count(*) from public.deposits d where d.status = 'menunggu');
$$;
revoke all on function public.admin_shell_stats(timestamptz) from public, anon, authenticated;
grant execute on function public.admin_shell_stats(timestamptz) to service_role;
