-- Storage buckets and policies.
-- avatars: public read, a user writes only inside their own folder (<user_id>/...).
-- ticket-attachments: private. Path = <user_id>/<ticket_id>/<file>. Owner and admin read through signed URLs.
-- Size and mime limits are enforced by the bucket itself (and again in the server action).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp']),
  ('ticket-attachments', 'ticket-attachments', false, 5242880, array['image/png', 'image/jpeg', 'application/pdf'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy avatars_read on storage.objects for select to anon, authenticated using (bucket_id = 'avatars');
create policy avatars_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_update_own on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Upload only into <own user id>/<own ticket id>/...
create policy ticket_att_insert_own on storage.objects for insert to authenticated
  with check (
    bucket_id = 'ticket-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (select 1 from public.tickets t where t.id::text = (storage.foldername(name))[2] and t.user_id = auth.uid())
  );
create policy ticket_att_select_own on storage.objects for select to authenticated
  using (bucket_id = 'ticket-attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy ticket_att_select_admin on storage.objects for select to authenticated
  using (bucket_id = 'ticket-attachments' and public.is_admin());
-- No update/delete policy for ticket attachments: evidence stays.
