-- Milestone 2: places, doctors, specialties, hours, emergency
-- departments and the Aafia team. Row level security on every table:
-- the public can read active listings, only Aafia admins can change them.

-- Places --------------------------------------------------------------

create type public.place_kind as enum ('clinic', 'hospital', 'lab', 'pharmacy');

create table public.specialties (
  id bigint generated always as identity primary key,
  name_ar text not null check (length(trim(name_ar)) > 0),
  name_en text not null check (length(trim(name_en)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name_en)
);

create table public.places (
  id bigint generated always as identity primary key,
  kind public.place_kind not null,
  name_ar text not null check (length(trim(name_ar)) > 0),
  name_en text not null check (length(trim(name_en)) > 0),
  area_ar text not null check (length(trim(area_ar)) > 0),
  area_en text not null check (length(trim(area_en)) > 0),
  address_ar text,
  address_en text,
  phone text check (phone ~ '^\+?[0-9 ]{6,20}$'),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  home_visits boolean not null default false,
  open_24h boolean not null default false,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((latitude is null) = (longitude is null))
);

create table public.doctors (
  id bigint generated always as identity primary key,
  place_id bigint not null references public.places (id) on delete cascade,
  specialty_id bigint not null references public.specialties (id) on delete restrict,
  name_ar text not null check (length(trim(name_ar)) > 0),
  name_en text not null check (length(trim(name_en)) > 0),
  -- Consultation fee in Sudanese pounds, paid in cash at reception.
  fee_sdg integer check (fee_sdg >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index doctors_place_id_idx on public.doctors (place_id);
create index doctors_specialty_id_idx on public.doctors (specialty_id);

-- Weekly hours in Khartoum time. A row belongs to a place (general
-- hours) or to one doctor. closes < opens means it runs past midnight.
create table public.opening_hours (
  id bigint generated always as identity primary key,
  place_id bigint references public.places (id) on delete cascade,
  doctor_id bigint references public.doctors (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6), -- 0 = Sunday
  opens time not null,
  closes time not null,
  created_at timestamptz not null default now(),
  check ((place_id is null) <> (doctor_id is null)),
  check (opens <> closes)
);

create index opening_hours_place_id_idx on public.opening_hours (place_id);
create index opening_hours_doctor_id_idx on public.opening_hours (doctor_id);

create table public.emergency_departments (
  id bigint generated always as identity primary key,
  name_ar text not null check (length(trim(name_ar)) > 0),
  name_en text not null check (length(trim(name_en)) > 0),
  area_ar text not null check (length(trim(area_ar)) > 0),
  area_en text not null check (length(trim(area_en)) > 0),
  phone text not null check (phone ~ '^\+?[0-9 ]{3,20}$'),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  open_24h boolean not null default true,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((latitude is null) = (longitude is null))
);

-- Aafia team ----------------------------------------------------------

create table public.team_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'reception')),
  place_id bigint references public.places (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (role = 'admin' or place_id is not null)
);

create index team_members_place_id_idx on public.team_members (place_id);

-- Keep updated_at current ---------------------------------------------

create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger specialties_updated_at before update on public.specialties
  for each row execute function public.set_updated_at();
create trigger places_updated_at before update on public.places
  for each row execute function public.set_updated_at();
create trigger doctors_updated_at before update on public.doctors
  for each row execute function public.set_updated_at();
create trigger emergency_departments_updated_at before update on public.emergency_departments
  for each row execute function public.set_updated_at();

-- Who is an admin -----------------------------------------------------

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.team_members
    where user_id = auth.uid() and role = 'admin'
  );
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Team management (admins only). Emails live in auth.users, which the
-- app cannot read directly, so these run with elevated rights and
-- check is_admin() first.

create function public.list_team_members()
returns table (user_id uuid, email text, role text, place_id bigint, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select t.user_id, u.email::text, t.role, t.place_id, t.created_at
    from public.team_members t
    join auth.users u on u.id = t.user_id
    order by t.created_at;
end;
$$;

-- Returns 'added', 'updated' or 'not_found' (the person must sign in
-- once at /admin/login before they can be added).
create function public.add_team_member(member_email text, member_role text, member_place_id bigint default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  target uuid;
  existed boolean;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select id into target from auth.users where lower(email) = lower(trim(member_email));
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

create function public.remove_team_member(member_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if member_user_id = auth.uid() then
    raise exception 'cannot remove yourself' using errcode = '42501';
  end if;
  delete from public.team_members where user_id = member_user_id;
end;
$$;

revoke execute on function public.list_team_members() from public, anon;
revoke execute on function public.add_team_member(text, text, bigint) from public, anon;
revoke execute on function public.remove_team_member(uuid) from public, anon;
grant execute on function public.list_team_members() to authenticated;
grant execute on function public.add_team_member(text, text, bigint) to authenticated;
grant execute on function public.remove_team_member(uuid) to authenticated;

-- Row level security --------------------------------------------------

alter table public.specialties enable row level security;
alter table public.places enable row level security;
alter table public.doctors enable row level security;
alter table public.opening_hours enable row level security;
alter table public.emergency_departments enable row level security;
alter table public.team_members enable row level security;

-- Specialties: everyone reads, admins change.
create policy "specialties: anyone reads" on public.specialties
  for select to anon, authenticated using (true);
create policy "specialties: admins change" on public.specialties
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Places: everyone reads active ones, admins read and change all.
create policy "places: anyone reads active" on public.places
  for select to anon, authenticated using (is_active or public.is_admin());
create policy "places: admins change" on public.places
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Doctors: visible when the doctor and their place are both active.
create policy "doctors: anyone reads active" on public.doctors
  for select to anon, authenticated using (
    public.is_admin() or (
      is_active and exists (
        select 1 from public.places p where p.id = place_id and p.is_active
      )
    )
  );
create policy "doctors: admins change" on public.doctors
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Hours: visible when what they belong to is visible.
create policy "hours: anyone reads active" on public.opening_hours
  for select to anon, authenticated using (
    public.is_admin()
    or exists (select 1 from public.places p where p.id = place_id and p.is_active)
    or exists (
      select 1 from public.doctors d join public.places p on p.id = d.place_id
      where d.id = doctor_id and d.is_active and p.is_active
    )
  );
create policy "hours: admins change" on public.opening_hours
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Emergency departments: everyone reads active ones, admins change.
create policy "emergency: anyone reads active" on public.emergency_departments
  for select to anon, authenticated using (is_active or public.is_admin());
create policy "emergency: admins change" on public.emergency_departments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Team: people see their own row; admins manage through the functions.
create policy "team: see own row" on public.team_members
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- Starting list of specialties (standard Arabic, English beneath).
-- Admins can rename or add more.
insert into public.specialties (name_ar, name_en) values
  ('الطب العام', 'General Practice'),
  ('طب الأطفال', 'Paediatrics'),
  ('أمراض النساء والتوليد', 'Obstetrics & Gynaecology'),
  ('الأمراض الباطنية', 'Internal Medicine'),
  ('الجراحة العامة', 'General Surgery'),
  ('جراحة العظام', 'Orthopaedics'),
  ('أمراض القلب', 'Cardiology'),
  ('الأنف والأذن والحنجرة', 'Ear, Nose & Throat'),
  ('طب العيون', 'Ophthalmology'),
  ('الأمراض الجلدية', 'Dermatology'),
  ('طب الأسنان', 'Dentistry'),
  ('المسالك البولية', 'Urology'),
  ('المخ والأعصاب', 'Neurology'),
  ('الطب النفسي', 'Psychiatry'),
  ('أمراض الكلى', 'Nephrology'),
  ('الجهاز الهضمي', 'Gastroenterology');
