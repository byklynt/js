-- Security advisor: SECURITY DEFINER helpers that RLS policies call must not be reachable through the REST/RPC API.
-- Move them to a schema that is not exposed. Policies refer to functions by OID, so every existing policy keeps working.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

alter function public.is_admin() set schema private;
alter function public.is_reseller_or_admin() set schema private;
revoke all on function private.is_admin(), private.is_reseller_or_admin() from public, anon;
grant execute on function private.is_admin(), private.is_reseller_or_admin() to authenticated, service_role;
