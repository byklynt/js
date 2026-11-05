-- Stops (unschedules) every JagoanSosmed job. Idempotent. The Vault secrets stay; `npm run cron:disable -- --purge` also deletes them.
do $$
declare j record;
begin
  if to_regclass('cron.job') is null then return; end if;
  for j in select jobid from cron.job where jobname like 'jago-%' loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;
