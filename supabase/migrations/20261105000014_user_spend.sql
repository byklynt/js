-- Total spent / order count per user, for the admin user list (one aggregate instead of loading every order).
create or replace view public.user_spend with (security_invoker = true) as
  select user_id, coalesce(sum(charge), 0)::bigint as total_spent, count(*)::bigint as orders
    from public.orders group by user_id;
