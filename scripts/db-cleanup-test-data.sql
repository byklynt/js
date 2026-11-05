-- Removes everything the DB integration tests create (users @jagoansosmed-test.invalid and ZT- fixtures).
-- The append-only triggers are disabled INSIDE this transaction only (DDL is transactional): nothing else is touched.
begin;
alter table public.balance_ledger disable trigger balance_ledger_no_change;
alter table public.audit_logs disable trigger audit_logs_no_change;

create temp table zt_users on commit drop as select id from auth.users where email like '%@jagoansosmed-test.invalid';

delete from public.refunds where user_id in (select id from zt_users);
delete from public.refill_requests where user_id in (select id from zt_users);
delete from public.cancel_requests where user_id in (select id from zt_users);
delete from public.orders where user_id in (select id from zt_users);
delete from public.balance_ledger where user_id in (select id from zt_users);
delete from public.deposits where user_id in (select id from zt_users);
delete from public.audit_logs where target_id in (select id::text from zt_users) or admin_id in (select id from zt_users);
delete from public.rate_limits where key in (select 'order:' || id::text from zt_users);
delete from public.admin_alerts where message like '%zt\_%';
delete from auth.users where id in (select id from zt_users);   -- profiles, notifications, tickets cascade

delete from public.services where id like 'ZT-%';
delete from public.service_categories where id like 'zt-%';
delete from public.providers where slug like 'zt-%';
delete from public.service_rules where version = 'zt-rules';

alter table public.balance_ledger enable trigger balance_ledger_no_change;
alter table public.audit_logs enable trigger audit_logs_no_change;
commit;
