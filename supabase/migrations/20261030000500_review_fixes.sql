-- Fixes from the Milestone 6 review.

-- A request sent from the medical file loses its record if the patient's
-- account is deleted; that must not block the deletion. request_medicines
-- (the only way to add a request) still refuses empty requests.
alter table public.pharmacy_requests drop constraint pharmacy_requests_has_content;

-- Check who may delete before saying whether it was sent, so nobody
-- learns anything about other people's records.
create or replace function public.delete_record(p_record_id bigint) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_path text;
begin
  select file_path into v_path from public.medical_records
  where id = p_record_id
    and (
      (owner_id = auth.uid() and uploaded_by = auth.uid() and place_id is null)
      or (place_id is not null and private.is_place_staff(place_id))
    )
  for update;
  if v_path is null then
    raise exception 'invalid';
  end if;
  if exists (select 1 from public.pharmacy_requests where record_id = p_record_id) then
    raise exception 'sent';
  end if;
  delete from public.medical_records where id = p_record_id;
  return v_path;
end;
$$;
