-- A replayed ledger reference must belong to the same user (the idempotency key is global).
create or replace function public.apply_ledger_entry(
  p_user uuid, p_type text, p_amount bigint, p_ref_type text, p_ref_id text, p_note text default '', p_by text default 'system'
) returns table (ledger_id uuid, new_balance bigint, duplicate boolean)
language plpgsql security definer set search_path = public as $$
declare prof public.profiles; existing public.balance_ledger; entry public.balance_ledger;
begin
  if p_amount is null or p_amount = 0 then perform public.internal_fail('bad_amount', 'Nominal tidak valid.'); end if;
  if coalesce(p_ref_type, '') = '' or coalesce(p_ref_id, '') = '' then perform public.internal_fail('bad_ref', 'Referensi transaksi wajib diisi.'); end if;

  select * into prof from public.profiles where id = p_user for update;   -- serialises every spend/credit of this user
  if not found then perform public.internal_fail('no_user', 'Pengguna tidak ditemukan.'); end if;

  -- Idempotent replay (checked AFTER the lock, so two concurrent identical calls cannot both pass).
  select * into existing from public.balance_ledger where type = p_type and ref_type = p_ref_type and ref_id = p_ref_id;
  if found then
    if existing.user_id <> p_user then
      perform public.internal_fail('ref_conflict', 'Referensi transaksi sudah dipakai pengguna lain.');
    end if;
    ledger_id := existing.id; new_balance := existing.balance_after; duplicate := true;
    return next; return;
  end if;

  if p_amount < 0 and prof.balance + p_amount < 0 then
    perform public.internal_fail('insufficient_balance', 'Saldo tidak cukup.');
  end if;

  insert into public.balance_ledger (user_id, type, amount, balance_before, balance_after, ref_type, ref_id, note, created_by)
  values (p_user, p_type, p_amount, prof.balance, prof.balance + p_amount, p_ref_type, p_ref_id, coalesce(p_note, ''), coalesce(p_by, 'system'))
  returning * into entry;
  update public.profiles set balance = prof.balance + p_amount where id = p_user;

  ledger_id := entry.id; new_balance := entry.balance_after; duplicate := false;
  return next;
end $$;
