-- OAuth sign-ups (Google) have no username in their metadata: derive a unique one from the e-mail.
-- E-mail/password sign-ups must still supply a valid username (validated, unique) or the sign-up is rejected.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare uname text; base text; n int := 0; provider text := coalesce(new.raw_app_meta_data ->> 'provider', 'email');
begin
  uname := btrim(coalesce(new.raw_user_meta_data ->> 'username', ''));
  if uname = '' and provider <> 'email' then
    base := regexp_replace(split_part(coalesce(new.email, 'user'), '@', 1), '[^A-Za-z0-9_]', '', 'g');
    base := left(case when length(base) < 3 then base || 'user' else base end, 18);
    uname := base;
    while exists (select 1 from public.profiles where username = uname::extensions.citext) loop
      n := n + 1;
      uname := base || n::text;
    end loop;
  end if;
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
