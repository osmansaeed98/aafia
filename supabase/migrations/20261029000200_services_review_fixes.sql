-- Fixes from the Milestone 5 review.

-- Pharmacy replies follow a sensible order:
-- sent/available/partial -> available, partial or unavailable;
-- available/partial -> collected. Collected, unavailable and cancelled
-- are final (the patient can send a new request).
create or replace function public.answer_medicines(
  p_request_id bigint, p_status text, p_total integer default null,
  p_ready_at timestamptz default null, p_note text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_status text;
  v_place bigint;
begin
  if p_status not in ('available', 'partial', 'unavailable', 'collected') then
    raise exception 'invalid';
  end if;
  if p_total is not null and p_total < 0 then
    raise exception 'invalid';
  end if;
  select status, place_id into v_status, v_place from public.pharmacy_requests where id = p_request_id for update;
  if not private.can_manage_place(v_place) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not (
    (v_status in ('sent', 'available', 'partial') and p_status in ('available', 'partial', 'unavailable'))
    or (v_status in ('available', 'partial') and p_status = 'collected')
  ) then
    raise exception 'invalid';
  end if;
  update public.pharmacy_requests
  set status = p_status,
      total_sdg = coalesce(p_total, total_sdg),
      ready_at = coalesce(p_ready_at, ready_at),
      pharmacy_note = coalesce(nullif(left(trim(coalesce(p_note, '')), 300), ''), pharmacy_note)
  where id = p_request_id;
end;
$$;

-- Home visits: requested -> confirmed or declined; confirmed -> confirmed
-- again (new time) or done. Declined, done and cancelled are final.
create or replace function public.answer_home_visit(
  p_request_id bigint, p_status text, p_visit_at timestamptz default null,
  p_fee integer default null, p_note text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_status text;
  v_place bigint;
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
  select status, place_id into v_status, v_place from public.home_visit_requests where id = p_request_id for update;
  if not private.can_manage_place(v_place) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not (
    (v_status = 'requested' and p_status in ('confirmed', 'declined'))
    or (v_status = 'confirmed' and p_status in ('confirmed', 'done'))
  ) then
    raise exception 'invalid';
  end if;
  update public.home_visit_requests
  set status = p_status,
      visit_at = coalesce(p_visit_at, visit_at),
      fee_sdg = coalesce(p_fee, fee_sdg),
      clinic_note = coalesce(nullif(left(trim(coalesce(p_note, '')), 300), ''), clinic_note)
  where id = p_request_id;
end;
$$;

-- Medicine requests must point at a photo that was actually uploaded.
create or replace function public.request_medicines(
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
  if p_photo_path is not null and (
    split_part(p_photo_path, '/', 1) <> v_uid::text
    or not exists (select 1 from storage.objects where bucket_id = 'prescriptions' and name = p_photo_path)
  ) then
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

-- Photos: at most 30 per account (keeps the free 1 GB safe), and once a
-- photo is sent to a pharmacy the patient can no longer delete it.
create function private.prescription_count(p_uid uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from storage.objects
  where bucket_id = 'prescriptions' and (storage.foldername(name))[1] = p_uid::text;
$$;
revoke all on function private.prescription_count(uuid) from public;
grant execute on function private.prescription_count(uuid) to authenticated;

drop policy "prescriptions: upload own" on storage.objects;
create policy "prescriptions: upload own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'prescriptions'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and private.prescription_count((select auth.uid())) < 30
  );

drop policy "prescriptions: delete own" on storage.objects;
create policy "prescriptions: delete own unsent" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'prescriptions'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (select 1 from public.pharmacy_requests r where r.photo_path = name)
  );

-- A place's lab queue is switched on only while the place is a lab.
create or replace function private.ensure_lab_desk() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'lab' then
    insert into public.doctors (place_id, specialty_id, name_ar, name_en, is_lab_desk, daily_limit, minutes_per_patient)
    values (new.id, null, 'المعمل', 'Laboratory', true, 60, 5)
    on conflict (place_id) where is_lab_desk do nothing;
  end if;
  update public.doctors set is_active = (new.kind = 'lab')
  where place_id = new.id and is_lab_desk and is_active <> (new.kind = 'lab');
  return new;
end;
$$;
