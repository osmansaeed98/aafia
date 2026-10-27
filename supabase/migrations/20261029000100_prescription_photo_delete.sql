-- Patients can delete their own prescription photos (used when sending a
-- request fails after the upload, so no photo is left behind).
create policy "prescriptions: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'prescriptions' and (storage.foldername(name))[1] = (select auth.uid())::text);
