-- Supabase's file API needs read access to delete a file. Let a place's
-- reception read its own folder (it only holds files they added), so
-- removing a record also removes its file.
drop policy "medical files: read" on storage.objects;
create policy "medical files: read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'medical-files' and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (
        (storage.foldername(name))[1] ~ '^place-[0-9]+$'
        and private.is_place_staff(substr((storage.foldername(name))[1], 7)::bigint)
      )
      or private.can_read_medical_file(name)
    )
  );
