-- Fixes from the Milestone 7 review: account deletion also removes files
-- a clinic added to the patient's medical file, can be retried if a file
-- step fails, and the final step only runs after the first.

-- Accounts in the middle of deleting themselves (step 1 done).
create table private.account_deletions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  started_at timestamptz not null default now()
);

create function private.require_deletable_account() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_signed_in';
  end if;
  -- Aafia team and reception accounts are removed by an admin instead.
  if exists (select 1 from public.team_members where user_id = v_uid) then
    raise exception 'team';
  end if;
  return v_uid;
end;
$$;
revoke all on function private.require_deletable_account() from public;

-- Cancels what's still open and clears health details from requests.
-- Safe to run more than once.
create function private.close_open_activity(p_uid uuid) returns void
language sql security definer set search_path = '' as $$
  update public.bookings b set status = 'cancelled'
  from public.sessions s
  where s.id = b.session_id and b.booked_by = p_uid and b.status = 'booked'
    and s.session_date >= private.khartoum_now()::date;
  update public.pharmacy_requests set status = 'cancelled'
  where requested_by = p_uid and status in ('sent', 'available', 'partial');
  update public.home_visit_requests set status = 'cancelled'
  where requested_by = p_uid and status in ('requested', 'confirmed');
  update public.pharmacy_requests set items_text = null, photo_path = null, record_id = null
  where requested_by = p_uid;
$$;
revoke all on function private.close_open_activity(uuid) from public;

-- Step 1. Records stay until step 2, so the app can first delete their
-- files (including ones a clinic uploaded, see the policy below).
create or replace function public.prepare_account_deletion() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_deletable_account();
begin
  perform private.close_open_activity(v_uid);
  insert into private.account_deletions (user_id) values (v_uid) on conflict do nothing;
end;
$$;

-- Step 2. Only after step 1. Runs the closing again (in case something
-- was booked in between), then removes the person's details.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_deletable_account();
begin
  if not exists (select 1 from private.account_deletions where user_id = v_uid) then
    raise exception 'not_prepared';
  end if;
  perform private.close_open_activity(v_uid);
  delete from public.medical_records where owner_id = v_uid;
  update public.bookings set patient_phone = null where booked_by = v_uid;
  update public.pharmacy_requests set patient_phone = null where requested_by = v_uid;
  update public.home_visit_requests
  set patient_phone = null, reason = 'محذوف · deleted', area = 'محذوف · deleted',
      address_details = 'محذوف · deleted', latitude = null, longitude = null
  where requested_by = v_uid;
  delete from auth.users where id = v_uid;
end;
$$;

-- While deleting their account, a patient may delete the files of their
-- own medical records, wherever they are stored.
create function private.my_record_file_while_leaving(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.account_deletions where user_id = auth.uid())
    and exists (select 1 from public.medical_records where file_path = p_path and owner_id = auth.uid());
$$;
revoke all on function private.my_record_file_while_leaving(text) from public;
grant execute on function private.my_record_file_while_leaving(text) to authenticated;

create policy "medical files: delete when leaving" on storage.objects
  for delete to authenticated
  using (bucket_id = 'medical-files' and private.my_record_file_while_leaving(name));
