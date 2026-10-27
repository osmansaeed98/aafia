-- Fixes from the Milestone 4 review.

-- Reception keeps access to its own doctors even if an admin hides one
-- in the middle of a session.
create policy "doctors: staff read own place" on public.doctors
  for select to authenticated using (private.can_manage_place(place_id));

-- Booking: one booking at a time per account (so two at the same moment
-- can't both slip under the limit of 3), and bookings in cancelled or
-- closed sessions don't count towards it.
create or replace function public.book(
  p_doctor_id bigint, p_date date, p_starts time, p_family_member_id bigint default null
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_phone text;
  v_session public.sessions;
  v_session_id bigint;
  v_limit integer;
  v_number integer;
  v_booking_id bigint;
begin
  if v_uid is null then
    raise exception 'not_signed_in';
  end if;
  perform pg_advisory_xact_lock(hashtext('book:' || v_uid::text));

  if p_family_member_id is null then
    select full_name into v_name from public.profiles where user_id = v_uid;
    if v_name is null then
      raise exception 'no_profile';
    end if;
  else
    select full_name into v_name from public.family_members
    where id = p_family_member_id and owner_id = v_uid;
    if v_name is null then
      raise exception 'invalid';
    end if;
  end if;

  if not exists (
    select 1 from public.available_sessions(p_doctor_id, 7) a
    where a.session_date = p_date and a.starts_at = p_starts
  ) then
    raise exception 'invalid';
  end if;

  v_session_id := private.ensure_session(p_doctor_id, p_date, p_starts);
  select * into v_session from public.sessions where id = v_session_id for update;
  if v_session.status in ('cancelled', 'closed') then
    raise exception 'closed';
  end if;

  if (
    select count(*) from public.bookings b join public.sessions s on s.id = b.session_id
    where b.booked_by = v_uid and b.status in ('booked', 'arrived')
      and s.status not in ('cancelled', 'closed')
      and s.session_date >= private.khartoum_now()::date
  ) >= 3 then
    raise exception 'limit';
  end if;

  if exists (
    select 1 from public.bookings
    where session_id = v_session_id and booked_by = v_uid and status <> 'cancelled'
      and coalesce(family_member_id, 0) = coalesce(p_family_member_id, 0)
  ) then
    raise exception 'duplicate';
  end if;

  select daily_limit into v_limit from public.doctors where id = p_doctor_id;
  if (
    select count(*) from public.bookings where session_id = v_session_id and status <> 'cancelled'
  ) >= v_limit then
    raise exception 'full';
  end if;

  select phone into v_phone from auth.users where id = v_uid;
  update public.sessions set last_number = last_number + 1
  where id = v_session_id returning last_number into v_number;

  insert into public.bookings (session_id, booked_by, family_member_id, patient_name, patient_phone, queue_number, source)
  values (v_session_id, v_uid, p_family_member_id, v_name, v_phone, v_number, 'app')
  returning id into v_booking_id;
  return v_booking_id;
end;
$$;

-- Patients can always cancel a booking that is still waiting, even if
-- the clinic cancelled the session.
create or replace function public.cancel_booking(p_booking_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.bookings b set status = 'cancelled'
  from public.sessions s
  where b.id = p_booking_id and s.id = b.session_id
    and b.booked_by = auth.uid() and b.status = 'booked'
    and s.session_date >= private.khartoum_now()::date;
  if not found then
    raise exception 'invalid';
  end if;
end;
$$;

create function private.require_running_session(p_session_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_manage_session(p_session_id);
  if (select status from public.sessions where id = p_session_id) in ('cancelled', 'closed') then
    raise exception 'closed';
  end if;
end;
$$;
revoke all on function private.require_running_session(bigint) from public;

-- Call next: the next waiting number above the current one; if none,
-- anyone further back who was marked as arrived again (late comers).
create or replace function public.call_next(p_session_id bigint) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_current integer;
  v_next integer;
begin
  perform private.require_running_session(p_session_id);
  select now_serving into v_current from public.sessions where id = p_session_id for update;
  update public.bookings set status = 'seen'
  where session_id = p_session_id and queue_number = v_current and status in ('booked', 'arrived');
  select min(queue_number) into v_next from public.bookings
  where session_id = p_session_id and queue_number > v_current and status in ('booked', 'arrived');
  if v_next is null then
    select min(queue_number) into v_next from public.bookings
    where session_id = p_session_id and queue_number < v_current and status = 'arrived';
  end if;
  if v_next is not null then
    update public.sessions set now_serving = v_next,
      status = case when status = 'delayed' then 'open' else status end,
      delay_minutes = case when status = 'delayed' then 0 else delay_minutes end
    where id = p_session_id;
  end if;
  return v_next;
end;
$$;

create or replace function public.add_walk_in(p_session_id bigint, p_name text, p_phone text default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_number integer;
begin
  perform private.require_running_session(p_session_id);
  if length(trim(coalesce(p_name, ''))) = 0 or length(p_name) > 100 then
    raise exception 'invalid';
  end if;
  update public.sessions set last_number = last_number + 1
  where id = p_session_id returning last_number into v_number;
  insert into public.bookings (session_id, patient_name, patient_phone, queue_number, source)
  values (p_session_id, trim(p_name), nullif(trim(coalesce(p_phone, '')), ''), v_number, 'walk_in');
  return v_number;
end;
$$;

-- Everything reception needs for today's screen, in one call.
create function public.clinic_today(p_place_id bigint)
returns table (
  doctor_id bigint, doctor_name_ar text, doctor_name_en text, session_id bigint,
  starts_at time, ends_at time, status text, now_serving integer, numbers_taken integer
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := private.khartoum_now()::date;
begin
  if not private.can_manage_place(p_place_id) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return query
    with planned as (
      select d.id as doctor_id, h.opens, h.closes
      from public.doctors d
      cross join lateral private.session_hours(d.id) h
      where d.place_id = p_place_id and d.is_active and h.weekday = extract(dow from v_today)::int
    ),
    existing as (
      select s.doctor_id, s.starts_at as opens, s.ends_at as closes
      from public.sessions s join public.doctors d on d.id = s.doctor_id
      where d.place_id = p_place_id and s.session_date = v_today
    ),
    slots as (select * from planned union select * from existing)
    select d.id, d.name_ar, d.name_en, s.id, slots.opens, slots.closes,
           coalesce(s.status, 'open'), coalesce(s.now_serving, 0),
           (select count(*)::integer from public.bookings b where b.session_id = s.id and b.status <> 'cancelled')
    from slots
    join public.doctors d on d.id = slots.doctor_id
    left join public.sessions s on s.doctor_id = slots.doctor_id and s.session_date = v_today and s.starts_at = slots.opens
    order by d.name_ar, slots.opens;
end;
$$;

revoke all on function public.clinic_today(bigint) from public, anon;
grant execute on function public.clinic_today(bigint) to authenticated;
