-- A pharmacy can see the one prescription record a patient sent to it
-- (title and file), and nothing else from the patient's records.
create function private.record_sent_to_my_pharmacy(p_record_id bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.pharmacy_requests r
    where r.record_id = p_record_id and r.status <> 'cancelled' and private.can_manage_place(r.place_id)
  );
$$;
revoke all on function private.record_sent_to_my_pharmacy(bigint) from public;
grant execute on function private.record_sent_to_my_pharmacy(bigint) to authenticated;

create policy "records: pharmacy it was sent to" on public.medical_records
  for select to authenticated using (private.record_sent_to_my_pharmacy(id));
