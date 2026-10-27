-- Deleting an account clears both the request's account and its record
-- link; check the record link at the end, once both are cleared.
alter table public.pharmacy_requests
  drop constraint pharmacy_requests_record_id_fkey,
  add constraint pharmacy_requests_record_id_fkey foreign key (record_id)
    references public.medical_records (id) on delete set null deferrable initially deferred;
