-- Milestone 5: labs (queue numbers + price list), pharmacy pickup
-- requests (prescription photo and/or list) and home-visit requests.
-- Patients and staff change requests only through the functions below.

-- Labs ------------------------------------------------------------------
-- A lab's queue reuses the doctors/sessions/bookings machinery through
-- one "lab desk" row per lab, created automatically. It has no specialty.

alter table public.doctors
  add column is_lab_desk boolean not null default false,
  alter column specialty_id drop not null,
  add constraint doctors_specialty_unless_lab_desk check (is_lab_desk or specialty_id is not null);

create unique index doctors_one_lab_desk_per_place on public.doctors (place_id) where is_lab_desk;

create function private.ensure_lab_desk() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'lab' then
    insert into public.doctors (place_id, specialty_id, name_ar, name_en, is_lab_desk, daily_limit, minutes_per_patient)
    values (new.id, null, 'المعمل', 'Laboratory', true, 60, 5)
    on conflict (place_id) where is_lab_desk do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.ensure_lab_desk() from public;

create trigger places_lab_desk after insert or update of kind on public.places
  for each row execute function private.ensure_lab_desk();

create table public.lab_tests (
  id bigint generated always as identity primary key,
  place_id bigint not null references public.places (id) on delete cascade,
  name_ar text not null check (length(trim(name_ar)) between 1 and 120),
  name_en text not null check (length(trim(name_en)) between 1 and 120),
  price_sdg integer check (price_sdg >= 0),
  -- e.g. "صايم 8 ساعات" (fasting 8 hours), "النتيجة بعد يومين"
  notes_ar text check (length(notes_ar) <= 200),
  notes_en text check (length(notes_en) <= 200),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index lab_tests_place_id_idx on public.lab_tests (place_id);
create trigger lab_tests_updated_at before update on public.lab_tests
  for each row execute function public.set_updated_at();

alter table public.lab_tests enable row level security;
create policy "lab tests: anyone reads active" on public.lab_tests
  for select to anon, authenticated using (
    public.is_admin()
    or (is_active and exists (select 1 from public.places p where p.id = place_id and p.is_active))
  );
create policy "lab tests: admins change" on public.lab_tests
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Shared helpers ----------------------------------------------------------

-- The patient's (or their family member's) name for a request.
create function private.patient_name(p_family_member_id bigint) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_name text;
begin
  if p_family_member_id is null then
    select full_name into v_name from public.profiles where user_id = auth.uid();
    if v_name is null then
      raise exception 'no_profile';
    end if;
  else
    select full_name into v_name from public.family_members
    where id = p_family_member_id and owner_id = auth.uid();
    if v_name is null then
      raise exception 'invalid';
    end if;
  end if;
  return v_name;
end;
$$;
revoke all on function private.patient_name(bigint) from public;

-- Pharmacy pickup requests ------------------------------------------------

create table public.pharmacy_requests (
  id bigint generated always as identity primary key,
  place_id bigint not null references public.places (id) on delete cascade,
  requested_by uuid references auth.users (id) on delete set null,
  family_member_id bigint references public.family_members (id) on delete set null,
  patient_name text not null,
  patient_phone text,
  items_text text check (length(items_text) <= 1000),
  -- Private file in the "prescriptions" storage bucket.
  photo_path text,
  status text not null default 'sent' check (
    status in ('sent', 'available', 'partial', 'unavailable', 'collected', 'cancelled')
  ),
  total_sdg integer check (total_sdg >= 0),
  ready_at timestamptz,
  pharmacy_note text check (length(pharmacy_note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (items_text is not null or photo_path is not null)
);
create index pharmacy_requests_place_id_idx on public.pharmacy_requests (place_id);
create index pharmacy_requests_requested_by_idx on public.pharmacy_requests (requested_by);
create index pharmacy_requests_family_member_id_idx on public.pharmacy_requests (family_member_id);
create trigger pharmacy_requests_updated_at before update on public.pharmacy_requests
  for each row execute function public.set_updated_at();

create function public.request_medicines(
  p_place_id bigint, p_family_member_id bigint, p_items text, p_photo_path text
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_id bigint;
begin
  if v_uid is null then
    raise exception 'not_signed_in';
  end if;
  perform pg_advisory_xact_lock(hashtext('pharmacy:' || v_uid::text));
  if not exists (select 1 from public.places where id = p_place_id and kind = 'pharmacy' and is_active) then
    raise exception 'invalid';
  end if;
  if nullif(trim(coalesce(p_items, '')), '') is null and p_photo_path is null then
    raise exception 'empty';
  end if;
  -- The photo must be one this person uploaded (their own folder).
  if p_photo_path is not null and split_part(p_photo_path, '/', 1) <> v_uid::text then
    raise exception 'invalid';
  end if;
  if (
    select count(*) from public.pharmacy_requests
    where requested_by = v_uid and status in ('sent', 'available', 'partial')
  ) >= 5 then
    raise exception 'limit';
  end if;
  insert into public.pharmacy_requests (place_id, requested_by, family_member_id, patient_name, patient_phone, items_text, photo_path)
  values (
    p_place_id, v_uid, p_family_member_id, private.patient_name(p_family_member_id),
    (select phone from auth.users where id = v_uid),
    nullif(left(trim(coalesce(p_items, '')), 1000), ''), p_photo_path
  )
  returning id into v_id;
  return v_id;
end;
$$;

create function public.cancel_medicines(p_request_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.pharmacy_requests set status = 'cancelled'
  where id = p_request_id and requested_by = auth.uid() and status in ('sent', 'available', 'partial');
  if not found then
    raise exception 'invalid';
  end if;
end;
$$;

-- The pharmacy answers: available / partial / unavailable (with total,
-- ready time and a note), or marks it collected.
create function public.answer_medicines(
  p_request_id bigint, p_status text, p_total integer default null,
  p_ready_at timestamptz default null, p_note text default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_status not in ('available', 'partial', 'unavailable', 'collected') then
    raise exception 'invalid';
  end if;
  if p_total is not null and p_total < 0 then
    raise exception 'invalid';
  end if;
  if not private.can_manage_place((select place_id from public.pharmacy_requests where id = p_request_id)) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.pharmacy_requests
  set status = p_status,
      total_sdg = coalesce(p_total, total_sdg),
      ready_at = coalesce(p_ready_at, ready_at),
      pharmacy_note = coalesce(nullif(left(trim(coalesce(p_note, '')), 300), ''), pharmacy_note)
  where id = p_request_id and status <> 'cancelled';
  if not found then
    raise exception 'invalid';
  end if;
end;
$$;

-- Home visits ---------------------------------------------------------------

create table public.home_visit_requests (
  id bigint generated always as identity primary key,
  place_id bigint not null references public.places (id) on delete cascade,
  requested_by uuid references auth.users (id) on delete set null,
  family_member_id bigint references public.family_members (id) on delete set null,
  patient_name text not null,
  patient_phone text,
  reason text not null check (length(trim(reason)) between 3 and 300),
  preferred_date date not null,
  preferred_time text not null check (preferred_time in ('morning', 'afternoon', 'evening')),
  area text not null check (length(trim(area)) between 2 and 100),
  address_details text not null check (length(trim(address_details)) between 5 and 300),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  status text not null default 'requested' check (status in ('requested', 'confirmed', 'declined', 'done', 'cancelled')),
  visit_at timestamptz,
  fee_sdg integer check (fee_sdg >= 0),
  clinic_note text check (length(clinic_note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((latitude is null) = (longitude is null))
);
create index home_visit_requests_place_id_idx on public.home_visit_requests (place_id);
create index home_visit_requests_requested_by_idx on public.home_visit_requests (requested_by);
create index home_visit_requests_family_member_id_idx on public.home_visit_requests (family_member_id);
create trigger home_visit_requests_updated_at before update on public.home_visit_requests
  for each row execute function public.set_updated_at();

create function public.request_home_visit(
  p_place_id bigint, p_family_member_id bigint, p_reason text, p_date date, p_time text,
  p_area text, p_address text, p_latitude double precision default null, p_longitude double precision default null
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_id bigint;
begin
  if v_uid is null then
    raise exception 'not_signed_in';
  end if;
  perform pg_advisory_xact_lock(hashtext('visit:' || v_uid::text));
  if not exists (select 1 from public.places where id = p_place_id and home_visits and is_active) then
    raise exception 'invalid';
  end if;
  if p_date not between private.khartoum_now()::date and private.khartoum_now()::date + 14 then
    raise exception 'date';
  end if;
  if (
    select count(*) from public.home_visit_requests
    where requested_by = v_uid and status in ('requested', 'confirmed')
  ) >= 3 then
    raise exception 'limit';
  end if;
  insert into public.home_visit_requests (
    place_id, requested_by, family_member_id, patient_name, patient_phone,
    reason, preferred_date, preferred_time, area, address_details, latitude, longitude
  ) values (
    p_place_id, v_uid, p_family_member_id, private.patient_name(p_family_member_id),
    (select phone from auth.users where id = v_uid),
    trim(p_reason), p_date, p_time, trim(p_area), trim(p_address), p_latitude, p_longitude
  )
  returning id into v_id;
  return v_id;
end;
$$;

create function public.cancel_home_visit(p_request_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.home_visit_requests set status = 'cancelled'
  where id = p_request_id and requested_by = auth.uid() and status in ('requested', 'confirmed');
  if not found then
    raise exception 'invalid';
  end if;
end;
$$;

-- The clinic confirms (time + fee), declines (with a reason) or marks done.
create function public.answer_home_visit(
  p_request_id bigint, p_status text, p_visit_at timestamptz default null,
  p_fee integer default null, p_note text default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_status not in ('confirmed', 'declined', 'done') then
    raise exception 'invalid';
  end if;
  if p_status = 'confirmed' and p_visit_at is null then
    raise exception 'invalid';
  end if;
  if p_fee is not null and p_fee < 0 then
    raise exception 'invalid';
  end if;
  if not private.can_manage_place((select place_id from public.home_visit_requests where id = p_request_id)) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.home_visit_requests
  set status = p_status,
      visit_at = coalesce(p_visit_at, visit_at),
      fee_sdg = coalesce(p_fee, fee_sdg),
      clinic_note = coalesce(nullif(left(trim(coalesce(p_note, '')), 300), ''), clinic_note)
  where id = p_request_id and status not in ('cancelled', 'done');
  if not found then
    raise exception 'invalid';
  end if;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.request_medicines(bigint, bigint, text, text)',
    'public.cancel_medicines(bigint)',
    'public.answer_medicines(bigint, text, integer, timestamptz, text)',
    'public.request_home_visit(bigint, bigint, text, date, text, text, text, double precision, double precision)',
    'public.cancel_home_visit(bigint)',
    'public.answer_home_visit(bigint, text, timestamptz, integer, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- Access rules: the patient who asked, or staff of that place. ---------

alter table public.pharmacy_requests enable row level security;
alter table public.home_visit_requests enable row level security;

create policy "pharmacy requests: own or staff" on public.pharmacy_requests
  for select to authenticated using (requested_by = (select auth.uid()) or private.can_manage_place(place_id));
create policy "home visits: own or staff" on public.home_visit_requests
  for select to authenticated using (requested_by = (select auth.uid()) or private.can_manage_place(place_id));

revoke all on public.pharmacy_requests from anon;
revoke all on public.home_visit_requests from anon;
revoke insert, update, delete on public.pharmacy_requests from authenticated;
revoke insert, update, delete on public.home_visit_requests from authenticated;

-- Prescription photos: private bucket, small images only. ------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('prescriptions', 'prescriptions', false, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Patients upload only into their own folder ("<user id>/...").
create policy "prescriptions: upload own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'prescriptions' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Readable by the patient, and by staff of the pharmacy it was sent to.
create policy "prescriptions: read own or pharmacy" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'prescriptions' and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1 from public.pharmacy_requests r
        where r.photo_path = name and private.can_manage_place(r.place_id)
      )
    )
  );

-- Existing labs get their desk.
update public.places set kind = kind where kind = 'lab';
