-- The read rules call is_admin() for every visitor, including people
-- who aren't signed in (it simply returns false for them).
grant execute on function public.is_admin() to anon;
