-- Milestone 3: patient profiles and family members. Each person can
-- see and change only their own rows. The Aafia team gets no access
-- here: these are private patient details.

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (length(trim(full_name)) between 2 and 100),
  birth_year smallint check (birth_year between 1900 and 2100),
  sex text check (sex in ('male', 'female')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.family_members (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  full_name text not null check (length(trim(full_name)) between 2 and 100),
  relation text not null check (
    relation in ('spouse', 'son', 'daughter', 'father', 'mother', 'brother', 'sister', 'other')
  ),
  birth_year smallint check (birth_year between 1900 and 2100),
  sex text check (sex in ('male', 'female')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index family_members_owner_id_idx on public.family_members (owner_id);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger family_members_updated_at before update on public.family_members
  for each row execute function public.set_updated_at();

-- A sensible cap, so one account can't fill the database.
create function public.limit_family_members() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.family_members where owner_id = new.owner_id) >= 20 then
    raise exception 'too many family members' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger family_members_limit before insert on public.family_members
  for each row execute function public.limit_family_members();

alter table public.profiles enable row level security;
alter table public.family_members enable row level security;

create policy "profiles: own row" on public.profiles
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "family: own rows" on public.family_members
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- Nobody signed out gets anything, not even through default grants.
revoke all on public.profiles from anon;
revoke all on public.family_members from anon;
