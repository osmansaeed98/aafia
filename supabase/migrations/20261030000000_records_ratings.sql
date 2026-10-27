-- Milestone 6: medical records (lab results, prescriptions, reports),
-- sending a prescription from the record to a pharmacy, and ratings.
-- Changes go through the functions below; nobody writes the tables directly.

-- Medical records -----------------------------------------------------------

create table public.medical_records (
  id bigint generated always as identity primary key,
  -- The patient's account (records of family members belong to it too).
  owner_id uuid not null references auth.users (id) on delete cascade,
  family_member_id bigint references public.family_members (id) on delete set null,
  patient_name text not null,
  kind text not null check (kind in ('lab_result', 'prescription', 'report', 'other')),
  title text not null check (length(trim(title)) between 2 and 120),
  notes text check (length(notes) <= 500),
  -- Private file in the "medical-files" bucket.
  file_path text not null,
  uploaded_by uuid references auth.users (id) on delete set null,
  -- Set when a clinic or lab added it (after a booking).
  place_id bigint references public.places (id) on delete set null,
  booking_id bigint references public.bookings (id) on delete set null,
  created_at timestamptz not null default now()
);
create index medical_records_owner_id_idx on public.medical_records (owner_id);
create index medical_records_family_member_id_idx on public.medical_records (family_member_id);
create index medical_records_place_id_idx on public.medical_records (place_id);
create index medical_records_booking_id_idx on public.medical_records (booking_id);
create index medical_records_uploaded_by_idx on public.medical_records (uploaded_by);

alter table public.medical_records enable row level security;
-- The patient's account, and the place that added the record. No one else.
create policy "records: owner or adding place" on public.medical_records
  for select to authenticated
  using (owner_id = (select auth.uid()) or (place_id is not null and private.can_manage_place(place_id)));
revoke all on public.medical_records from anon;
revoke insert, update, delete on public.medical_records from authenticated;

create function private.file_exists(p_bucket text, p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from storage.objects where bucket_id = p_bucket and name = p_path);
$$;
revoke all on function private.file_exists(text, text) from public;

-- A patient adds their own document (for themselves or a family member).
create function public.add_my_record(
  p_family_member_id bigint, p_kind text, p_title text, p_notes text, p_file_path text
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_id bigint;
begin
  if v_uid is null then
    raise exception 'not_signed_in';
  end if;
  if p_kind not in ('lab_result', 'prescription', 'report', 'other')
     or split_part(p_file_path, '/', 1) <> v_uid::text
     or not private.file_exists('medical-files', p_file_path) then
    raise exception 'invalid';
  end if;
  insert into public.medical_records (owner_id, family_member_id, patient_name, kind, title, notes, file_path, uploaded_by)
  values (v_uid, p_family_member_id, private.patient_name(p_family_member_id), p_kind, trim(p_title),
          nullif(left(trim(coalesce(p_notes, '')), 500), ''), p_file_path, v_uid)
  returning id into v_id;
  return v_id;
end;
$$;

-- A clinic or lab adds a result / prescription / report to a booking.
-- The file must be in that place's folder ("place-<id>/...").
create function public.staff_add_record(
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
  if not private.can_manage_place(v_place) then
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

-- Patients delete documents they added themselves; places delete what
-- they added. Returns the file path so the app can remove the file.
create function public.delete_record(p_record_id bigint) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_path text;
begin
  delete from public.medical_records
  where id = p_record_id
    and (
      (owner_id = auth.uid() and uploaded_by = auth.uid() and place_id is null)
      or (place_id is not null and private.can_manage_place(place_id))
    )
  returning file_path into v_path;
  if v_path is null then
    raise exception 'invalid';
  end if;
  return v_path;
end;
$$;

-- Sending a prescription from the record to a pharmacy ------------------

alter table public.pharmacy_requests
  add column record_id bigint references public.medical_records (id) on delete set null;
create index pharmacy_requests_record_id_idx on public.pharmacy_requests (record_id);

do $$
declare c text;
begin
  select conname into c from pg_constraint
  where conrelid = 'public.pharmacy_requests'::regclass and contype = 'c'
    and pg_get_constraintdef(oid) like '%items_text IS NOT NULL%photo_path IS NOT NULL%';
  execute format('alter table public.pharmacy_requests drop constraint %I', c);
end $$;
alter table public.pharmacy_requests add constraint pharmacy_requests_has_content
  check (items_text is not null or photo_path is not null or record_id is not null);

drop function public.request_medicines(bigint, bigint, text, text);
create function public.request_medicines(
  p_place_id bigint, p_family_member_id bigint, p_items text, p_photo_path text, p_record_id bigint default null
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_id bigint;
  v_record public.medical_records;
  v_name text;
begin
  if v_uid is null then
    raise exception 'not_signed_in';
  end if;
  perform pg_advisory_xact_lock(hashtext('pharmacy:' || v_uid::text));
  if not exists (select 1 from public.places where id = p_place_id and kind = 'pharmacy' and is_active) then
    raise exception 'invalid';
  end if;
  if nullif(trim(coalesce(p_items, '')), '') is null and p_photo_path is null and p_record_id is null then
    raise exception 'empty';
  end if;
  if p_photo_path is not null and (
    split_part(p_photo_path, '/', 1) <> v_uid::text
    or not private.file_exists('prescriptions', p_photo_path)
  ) then
    raise exception 'invalid';
  end if;
  if p_record_id is not null then
    select * into v_record from public.medical_records where id = p_record_id and owner_id = v_uid and kind = 'prescription';
    if v_record.id is null then
      raise exception 'invalid';
    end if;
  end if;
  if (
    select count(*) from public.pharmacy_requests
    where requested_by = v_uid and status in ('sent', 'available', 'partial')
  ) >= 5 then
    raise exception 'limit';
  end if;
  -- A prescription from the record is for the person it was written for.
  v_name := case when v_record.id is not null then v_record.patient_name else private.patient_name(p_family_member_id) end;
  insert into public.pharmacy_requests (place_id, requested_by, family_member_id, patient_name, patient_phone, items_text, photo_path, record_id)
  values (
    p_place_id, v_uid, coalesce(v_record.family_member_id, p_family_member_id), v_name,
    (select phone from auth.users where id = v_uid),
    nullif(left(trim(coalesce(p_items, '')), 1000), ''), p_photo_path, p_record_id
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- Medical files storage ------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('medical-files', 'medical-files', false, 4194304,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create function private.medical_file_count(p_folder text) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from storage.objects
  where bucket_id = 'medical-files' and (storage.foldername(name))[1] = p_folder;
$$;
revoke all on function private.medical_file_count(text) from public;
grant execute on function private.medical_file_count(text) to authenticated;

-- Can the signed-in person open this medical file? Owner of the record,
-- the place that added it, or the pharmacy it was sent to.
create function private.can_read_medical_file(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.medical_records m
    where m.file_path = p_path
      and (
        m.owner_id = auth.uid()
        or (m.place_id is not null and private.can_manage_place(m.place_id))
        or exists (
          select 1 from public.pharmacy_requests r
          where r.record_id = m.id and r.status <> 'cancelled' and private.can_manage_place(r.place_id)
        )
      )
  );
$$;
revoke all on function private.can_read_medical_file(text) from public;
grant execute on function private.can_read_medical_file(text) to authenticated;

create function private.medical_file_in_use(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.medical_records where file_path = p_path);
$$;
revoke all on function private.medical_file_in_use(text) from public;
grant execute on function private.medical_file_in_use(text) to authenticated;

-- Upload: patients into their own folder (max 50 files); staff into
-- their place's folder ("place-<id>").
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
        and private.can_manage_place(substr((storage.foldername(name))[1], 7)::bigint)
      )
    )
  );

create policy "medical files: read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'medical-files' and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or private.can_read_medical_file(name)
    )
  );

-- Delete only files no record uses any more (after delete_record).
create policy "medical files: delete unused" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'medical-files'
    and not private.medical_file_in_use(name)
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (
        (storage.foldername(name))[1] ~ '^place-[0-9]+$'
        and private.can_manage_place(substr((storage.foldername(name))[1], 7)::bigint)
      )
    )
  );

-- Ratings ---------------------------------------------------------------------

create table public.ratings (
  id bigint generated always as identity primary key,
  rater uuid not null references auth.users (id) on delete cascade,
  place_id bigint not null references public.places (id) on delete cascade,
  doctor_id bigint references public.doctors (id) on delete set null,
  booking_id bigint unique references public.bookings (id) on delete set null,
  pharmacy_request_id bigint unique references public.pharmacy_requests (id) on delete set null,
  visit_request_id bigint unique references public.home_visit_requests (id) on delete set null,
  stars smallint not null check (stars between 1 and 5),
  comment text check (length(comment) <= 500),
  created_at timestamptz not null default now()
);
create index ratings_rater_idx on public.ratings (rater);
create index ratings_place_id_idx on public.ratings (place_id);
create index ratings_doctor_id_idx on public.ratings (doctor_id);

alter table public.ratings enable row level security;
-- The person who rated, and the place (and admins). Comments aren't public.
create policy "ratings: rater or place" on public.ratings
  for select to authenticated using (rater = (select auth.uid()) or private.can_manage_place(place_id));
revoke all on public.ratings from anon;
revoke insert, update, delete on public.ratings from authenticated;

-- Rate a completed visit, once, within 60 days.
-- p_kind: 'booking' (seen), 'medicines' (collected) or 'visit' (done).
create function public.rate(p_kind text, p_id bigint, p_stars integer, p_comment text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_place bigint;
  v_doctor bigint;
  v_done_at timestamptz;
begin
  if v_uid is null then
    raise exception 'not_signed_in';
  end if;
  if p_stars not between 1 and 5 then
    raise exception 'invalid';
  end if;
  if p_kind = 'booking' then
    select d.place_id, d.id, b.updated_at into v_place, v_doctor, v_done_at
    from public.bookings b join public.sessions s on s.id = b.session_id join public.doctors d on d.id = s.doctor_id
    where b.id = p_id and b.booked_by = v_uid and b.status = 'seen';
  elsif p_kind = 'medicines' then
    select place_id, updated_at into v_place, v_done_at from public.pharmacy_requests
    where id = p_id and requested_by = v_uid and status = 'collected';
  elsif p_kind = 'visit' then
    select place_id, updated_at into v_place, v_done_at from public.home_visit_requests
    where id = p_id and requested_by = v_uid and status = 'done';
  end if;
  if v_place is null or v_done_at < now() - interval '60 days' then
    raise exception 'invalid';
  end if;
  begin
    insert into public.ratings (rater, place_id, doctor_id, booking_id, pharmacy_request_id, visit_request_id, stars, comment)
    values (
      v_uid, v_place, v_doctor,
      case when p_kind = 'booking' then p_id end,
      case when p_kind = 'medicines' then p_id end,
      case when p_kind = 'visit' then p_id end,
      p_stars, nullif(left(trim(coalesce(p_comment, '')), 500), '')
    );
  exception when unique_violation then
    raise exception 'already';
  end;
end;
$$;

-- Public star averages (only once there are at least 3 ratings).
create function public.rating_summary()
returns table (place_id bigint, doctor_id bigint, average numeric, ratings integer)
language sql stable security definer set search_path = '' as $$
  select r.place_id, null::bigint, round(avg(r.stars), 1), count(*)::integer
  from public.ratings r group by r.place_id having count(*) >= 3
  union all
  select null::bigint, r.doctor_id, round(avg(r.stars), 1), count(*)::integer
  from public.ratings r where r.doctor_id is not null group by r.doctor_id having count(*) >= 3;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.add_my_record(bigint, text, text, text, text)',
    'public.staff_add_record(bigint, text, text, text, text)',
    'public.delete_record(bigint)',
    'public.request_medicines(bigint, bigint, text, text, bigint)',
    'public.rate(text, bigint, integer, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke all on function public.rating_summary() from public;
grant execute on function public.rating_summary() to anon, authenticated;
