-- Like prescription photos: once a prescription is sent to a pharmacy
-- it can't be deleted (the pharmacy's request would lose its content).
create or replace function public.delete_record(p_record_id bigint) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_path text;
begin
  if exists (select 1 from public.pharmacy_requests where record_id = p_record_id) then
    raise exception 'sent';
  end if;
  delete from public.medical_records
  where id = p_record_id
    and (
      (owner_id = auth.uid() and uploaded_by = auth.uid() and place_id is null)
      or (place_id is not null and private.is_place_staff(place_id))
    )
  returning file_path into v_path;
  if v_path is null then
    raise exception 'invalid';
  end if;
  return v_path;
end;
$$;
