-- Move the elevated admin check into a schema the website API doesn't
-- expose. public.is_admin() stays (the app and the read rules use it)
-- but now runs with the caller's own rights and asks private.is_admin().
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.team_members
    where user_id = auth.uid() and role = 'admin'
  );
$$;

revoke execute on function private.is_admin() from public;
grant execute on function private.is_admin() to anon, authenticated;

create or replace function public.is_admin() returns boolean
language sql stable security invoker set search_path = '' as $$
  select private.is_admin();
$$;
