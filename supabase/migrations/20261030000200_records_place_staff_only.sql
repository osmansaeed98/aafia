-- Medical records are for the patient and the staff of the place
-- involved only: Aafia admins manage listings, not patients' files.

create function private.is_place_staff(p_place_id bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.team_members t
    where t.user_id = auth.uid() and t.role = 'reception' and t.place_id = p_place_id
  );
$$;
revoke all on function private.is_place_staff(bigint) from public;
grant execute on function private.is_place_staff(bigint) to authenticated;

drop policy "records: owner or adding place" on public.medical_records;
create policy "records: owner or adding place" on public.medical_records
  for select to authenticated
  using (owner_id = (select auth.uid()) or (place_id is not null and private.is_place_staff(place_id)));

create or replace function private.record_sent_to_my_pharmacy(p_record_id bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.pharmacy_requests r
    where r.record_id = p_record_id and r.status <> 'cancelled' and private.is_place_staff(r.place_id)
  );
$$;

create or replace function private.can_read_medical_file(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.medical_records m
    where m.file_path = p_path
      and (
        m.owner_id = auth.uid()
        or (m.place_id is not null and private.is_place_staff(m.place_id))
        or exists (
          select 1 from public.pharmacy_requests r
          where r.record_id = m.id and r.status <> 'cancelled' and private.is_place_staff(r.place_id)
        )
      )
  );
$$;

create or replace function public.staff_add_record(
  p_booking_id bigint, p_kind text, p_title text, p_notes text, p_file_path text
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_booking public.bookings;
  v_place bigint;
  v_id bigint;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  v_place := private.session_place(v_booking.session_id);
  if v_place is null or not private.is_place_staff(v_place) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_booking.booked_by is null then
    -- Walk-ins without an Aafia account have nowhere to receive it.
    raise exception 'no_account';
  end if;
  if v_booking.status = 'cancelled'
     or p_kind not in ('lab_result', 'prescription', 'report', 'other')
     or split_part(p_file_path, '/', 1) <> 'place-' || v_place
     or not private.file_exists('medical-files', p_file_path) then
    raise exception 'invalid';
  end if;
  insert into public.medical_records (owner_id, family_member_id, patient_name, kind, title, notes, file_path, uploaded_by, place_id, booking_id)
  values (v_booking.booked_by, v_booking.family_member_id, v_booking.patient_name, p_kind, trim(p_title),
          nullif(left(trim(coalesce(p_notes, '')), 500), ''), p_file_path, auth.uid(), v_place, p_booking_id)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.delete_record(p_record_id bigint) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_path text;
begin
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

drop policy "medical files: upload" on storage.objects;
create policy "medical files: upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'medical-files' and (
      (
        (storage.foldername(name))[1] = (select auth.uid())::text
        and private.medical_file_count((select auth.uid())::text) < 50
      )
      or (
        (storage.foldername(name))[1] ~ '^place-[0-9]+$'
        and private.is_place_staff(substr((storage.foldername(name))[1], 7)::bigint)
      )
    )
  );

drop policy "medical files: delete unused" on storage.objects;
create policy "medical files: delete unused" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'medical-files'
    and not private.medical_file_in_use(name)
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (
        (storage.foldername(name))[1] ~ '^place-[0-9]+$'
        and private.is_place_staff(substr((storage.foldername(name))[1], 7)::bigint)
      )
    )
  );
