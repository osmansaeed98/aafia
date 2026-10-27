-- Milestone 4: booking queue numbers, the live queue and the clinic
-- reception dashboard. Patients and reception change bookings only
-- through the functions below, which enforce the rules; nobody writes
-- to these tables directly.

-- Per-doctor settings ---------------------------------------------------

alter table public.doctors
  add column daily_limit integer not null default 30 check (daily_limit between 1 and 200),
  add column minutes_per_patient integer not null default 15 check (minutes_per_patient between 3 and 120);

-- Sessions: one doctor's sitting on one day (from the weekly hours) ----

create table public.sessions (
  id bigint generated always as identity primary key,
  doctor_id bigint not null references public.doctors (id) on delete cascade,
  session_date date not null,
  starts_at time not null,
  ends_at time not null,
  status text not null default 'open' check (status in ('open', 'delayed', 'cancelled', 'closed')),
  delay_minutes integer not null default 0 check (delay_minutes between 0 and 600),
  notice text check (length(notice) <= 200),
  now_serving integer not null default 0,
  last_number integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (doctor_id, session_date, starts_at)
);

create trigger sessions_updated_at before update on public.sessions
  for each row execute function public.set_updated_at();

-- Bookings: one queue number in one session ---------------------------

create table public.bookings (
  id bigint generated always as identity primary key,
  session_id bigint not null references public.sessions (id) on delete cascade,
  booked_by uuid references auth.users (id) on delete set null,
  family_member_id bigint references public.family_members (id) on delete set null,
  -- Copies taken at booking time, for reception's list.
  patient_name text not null check (length(trim(patient_name)) between 1 and 100),
  patient_phone text,
  queue_number integer not null check (queue_number > 0),
  source text not null default 'app' check (source in ('app', 'walk_in')),
  status text not null default 'booked' check (status in ('booked', 'arrived', 'seen', 'no_show', 'cancelled')),
  -- Cash only, paid at reception.
  paid_amount integer check (paid_amount >= 0),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, queue_number)
);

create index bookings_booked_by_idx on public.bookings (booked_by);
create index bookings_family_member_id_idx on public.bookings (family_member_id);

create trigger bookings_updated_at before update on public.bookings
  for each row execute function public.set_updated_at();

-- Helpers --------------------------------------------------------------

create function private.khartoum_now() returns timestamp
language sql stable set search_path = '' as $$
  select now() at time zone 'Africa/Khartoum';
$$;

-- Weekly hours for a doctor: their own, or else their place's.
create function private.session_hours(p_doctor_id bigint)
returns table (weekday smallint, opens time, closes time)
language sql stable security definer set search_path = '' as $$
  select h.weekday, h.opens, h.closes
  from public.opening_hours h
  where h.doctor_id = p_doctor_id
  union all
  select h.weekday, h.opens, h.closes
  from public.opening_hours h
  join public.doctors d on d.place_id = h.place_id
  where d.id = p_doctor_id
    and not exists (select 1 from public.opening_hours x where x.doctor_id = p_doctor_id);
$$;

-- Is the signed-in person an admin, or reception at this place?
create function private.can_manage_place(p_place_id bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.team_members t
    where t.user_id = auth.uid()
      and (t.role = 'admin' or (t.role = 'reception' and t.place_id = p_place_id))
  );
$$;

create function private.session_place(p_session_id bigint) returns bigint
language sql stable security definer set search_path = '' as $$
  select d.place_id from public.sessions s join public.doctors d on d.id = s.doctor_id where s.id = p_session_id;
$$;

-- Creates the session row the first time it's needed. Only for a day and
-- start time that match the doctor's weekly hours.
create function private.ensure_session(p_doctor_id bigint, p_date date, p_starts time) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_end time;
  v_id bigint;
begin
  select h.closes into v_end
  from private.session_hours(p_doctor_id) h
  where h.weekday = extract(dow from p_date)::int and h.opens = p_starts
  limit 1;
  if v_end is null then
    raise exception 'invalid';
  end if;
  insert into public.sessions (doctor_id, session_date, starts_at, ends_at)
  values (p_doctor_id, p_date, p_starts, v_end)
  on conflict (doctor_id, session_date, starts_at) do nothing;
  select id into v_id from public.sessions
  where doctor_id = p_doctor_id and session_date = p_date and starts_at = p_starts;
  return v_id;
end;
$$;

revoke all on function private.khartoum_now() from public;
revoke all on function private.session_hours(bigint) from public;
revoke all on function private.ensure_session(bigint, date, time) from public;
revoke all on function private.session_place(bigint) from public;
revoke all on function private.can_manage_place(bigint) from public;
-- Used inside the bookings read rule, so it must be callable there.
grant execute on function private.can_manage_place(bigint) to authenticated;
grant execute on function private.session_place(bigint) to authenticated;

-- Public: sessions a patient can book (next days) ----------------------

create function public.available_sessions(p_doctor_id bigint, p_days integer default 7)
returns table (
  session_date date, starts_at time, ends_at time, status text,
  delay_minutes integer, notice text, numbers_taken integer, daily_limit integer
)
language sql stable security definer set search_path = '' as $$
  with now_k as (select private.khartoum_now() as ts),
  doc as (
    select d.id, d.daily_limit
    from public.doctors d join public.places p on p.id = d.place_id
    where d.id = p_doctor_id and d.is_active and p.is_active
  ),
  days as (
    select (select ts from now_k)::date + g as day
    from generate_series(0, least(greatest(p_days, 1), 14) - 1) as g
  )
  select days.day, h.opens, h.closes,
         coalesce(s.status, 'open'), coalesce(s.delay_minutes, 0), s.notice,
         (select count(*)::integer from public.bookings b where b.session_id = s.id and b.status <> 'cancelled'),
         doc.daily_limit
  from doc
  cross join days
  join private.session_hours(p_doctor_id) h on h.weekday = extract(dow from days.day)::int
  left join public.sessions s
    on s.doctor_id = doc.id and s.session_date = days.day and s.starts_at = h.opens
  where not (
    -- Today's sessions that have already finished.
    days.day = (select ts from now_k)::date
    and h.closes > h.opens
    and h.closes <= (select ts from now_k)::time
  )
  order by 1, 2;
$$;

grant execute on function public.available_sessions(bigint, integer) to anon, authenticated;

-- Patient: book a queue number -----------------------------------------
-- Errors (the message is the key the app shows in plain words):
-- not_signed_in, no_profile, invalid, closed, limit, duplicate, full.

create function public.book(
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
  -- Lock the session so two people can't get the same number.
  select * into v_session from public.sessions where id = v_session_id for update;
  if v_session.status in ('cancelled', 'closed') then
    raise exception 'closed';
  end if;

  if (
    select count(*) from public.bookings b join public.sessions s on s.id = b.session_id
    where b.booked_by = v_uid and b.status in ('booked', 'arrived')
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

create function public.cancel_booking(p_booking_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.bookings b set status = 'cancelled'
  from public.sessions s
  where b.id = p_booking_id and s.id = b.session_id
    and b.booked_by = auth.uid() and b.status = 'booked'
    and s.status not in ('closed', 'cancelled')
    and s.session_date >= private.khartoum_now()::date;
  if not found then
    raise exception 'invalid';
  end if;
end;
$$;

-- Reception (or admins) --------------------------------------------------

create function private.require_manage_session(p_session_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.can_manage_place(private.session_place(p_session_id)) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.require_manage_session(bigint) from public;

create function public.open_session(p_doctor_id bigint, p_date date, p_starts time) returns bigint
language plpgsql security definer set search_path = '' as $$
begin
  if not private.can_manage_place((select place_id from public.doctors where id = p_doctor_id)) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_date not between private.khartoum_now()::date - 1 and private.khartoum_now()::date + 13 then
    raise exception 'invalid';
  end if;
  return private.ensure_session(p_doctor_id, p_date, p_starts);
end;
$$;

-- Calls the next waiting number. The one being seen until now is marked
-- seen. Returns the new number, or null when nobody is left waiting.
create function public.call_next(p_session_id bigint) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_current integer;
  v_next integer;
begin
  perform private.require_manage_session(p_session_id);
  select now_serving into v_current from public.sessions where id = p_session_id for update;
  update public.bookings set status = 'seen'
  where session_id = p_session_id and queue_number = v_current and status in ('booked', 'arrived');
  select min(queue_number) into v_next from public.bookings
  where session_id = p_session_id and queue_number > v_current and status in ('booked', 'arrived');
  if v_next is not null then
    update public.sessions set now_serving = v_next,
      status = case when status = 'delayed' then 'open' else status end,
      delay_minutes = case when status = 'delayed' then 0 else delay_minutes end
    where id = p_session_id;
  end if;
  return v_next;
end;
$$;

create function public.set_booking_status(p_booking_id bigint, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_session bigint;
begin
  if p_status not in ('booked', 'arrived', 'seen', 'no_show') then
    raise exception 'invalid';
  end if;
  select session_id into v_session from public.bookings where id = p_booking_id;
  perform private.require_manage_session(v_session);
  update public.bookings set status = p_status where id = p_booking_id and status <> 'cancelled';
end;
$$;

-- Cash received at reception (null amount = undo).
create function public.mark_paid(p_booking_id bigint, p_amount integer) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_session bigint;
begin
  if p_amount is not null and p_amount < 0 then
    raise exception 'invalid';
  end if;
  select session_id into v_session from public.bookings where id = p_booking_id;
  perform private.require_manage_session(v_session);
  update public.bookings
  set paid_amount = p_amount, paid_at = case when p_amount is null then null else now() end
  where id = p_booking_id;
end;
$$;

-- Walk-ins get the next number (reception decides, so no daily limit).
create function public.add_walk_in(p_session_id bigint, p_name text, p_phone text default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_number integer;
begin
  perform private.require_manage_session(p_session_id);
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

create function public.update_session(
  p_session_id bigint, p_status text, p_delay_minutes integer default 0, p_notice text default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_manage_session(p_session_id);
  if p_status not in ('open', 'delayed', 'cancelled', 'closed') then
    raise exception 'invalid';
  end if;
  update public.sessions
  set status = p_status,
      delay_minutes = case when p_status = 'delayed' then greatest(0, least(coalesce(p_delay_minutes, 0), 600)) else 0 end,
      notice = nullif(left(trim(coalesce(p_notice, '')), 200), '')
  where id = p_session_id;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.book(bigint, date, time, bigint)',
    'public.cancel_booking(bigint)',
    'public.open_session(bigint, date, time)',
    'public.call_next(bigint)',
    'public.set_booking_status(bigint, text)',
    'public.mark_paid(bigint, integer)',
    'public.add_walk_in(bigint, text, text)',
    'public.update_session(bigint, text, integer, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- Access rules ----------------------------------------------------------

alter table public.sessions enable row level security;
alter table public.bookings enable row level security;

-- Session status (now serving, delays) has no personal details: public,
-- so the live queue works for everyone.
create policy "sessions: anyone reads" on public.sessions
  for select to anon, authenticated using (true);

-- Bookings: the patient who made it, or reception at that place.
create policy "bookings: own or reception" on public.bookings
  for select to authenticated using (
    booked_by = (select auth.uid())
    or private.can_manage_place(private.session_place(session_id))
  );

revoke insert, update, delete on public.sessions from anon, authenticated;
revoke all on public.bookings from anon;
revoke insert, update, delete on public.bookings from authenticated;

-- Live updates for the queue page.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.sessions;
  end if;
end $$;

-- Team: reception staff are added by phone (they sign in with WhatsApp)
drop function public.list_team_members();
create function public.list_team_members()
returns table (user_id uuid, email text, phone text, role text, place_id bigint, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select t.user_id, u.email::text, u.phone::text, t.role, t.place_id, t.created_at
    from public.team_members t
    join auth.users u on u.id = t.user_id
    order by t.created_at;
end;
$$;
revoke execute on function public.list_team_members() from public, anon;
grant execute on function public.list_team_members() to authenticated;

-- member_email may now be an email or a phone number ("249912345678").
create or replace function public.add_team_member(member_email text, member_role text, member_place_id bigint default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  target uuid;
  existed boolean;
  contact text := lower(trim(member_email));
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if position('@' in contact) > 0 then
    select id into target from auth.users where lower(email) = contact;
  else
    select id into target from auth.users where phone = regexp_replace(contact, '\D', '', 'g');
  end if;
  if target is null then
    return 'not_found';
  end if;
  select exists (select 1 from public.team_members where user_id = target) into existed;
  insert into public.team_members (user_id, role, place_id)
  values (target, member_role, case when member_role = 'admin' then null else member_place_id end)
  on conflict (user_id) do update
    set role = excluded.role, place_id = excluded.place_id;
  return case when existed then 'updated' else 'added' end;
end;
$$;
