-- Milestone 7: patients can delete their account.
-- Step 1 (prepare_account_deletion) cancels what's still open, removes
-- medical records and clears health details from past requests, so the
-- app can then delete the person's uploaded files. Step 2
-- (delete_my_account) removes the phone number from clinics' history
-- and deletes the account itself (profile, family and ratings go with it).
-- Clinics keep only the name and queue number of past visits.

create function public.prepare_account_deletion() returns void
language plpgsql security definer set search_path = '' as $$
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
  update public.bookings b set status = 'cancelled'
  from public.sessions s
  where s.id = b.session_id and b.booked_by = v_uid and b.status = 'booked'
    and s.session_date >= private.khartoum_now()::date;
  update public.pharmacy_requests set status = 'cancelled'
  where requested_by = v_uid and status in ('sent', 'available', 'partial');
  update public.home_visit_requests set status = 'cancelled'
  where requested_by = v_uid and status in ('requested', 'confirmed');
  -- What medicines, which prescription: health details, removed.
  update public.pharmacy_requests set items_text = null, photo_path = null, record_id = null
  where requested_by = v_uid;
  delete from public.medical_records where owner_id = v_uid;
end;
$$;

create function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_signed_in';
  end if;
  if exists (select 1 from public.team_members where user_id = v_uid) then
    raise exception 'team';
  end if;
  update public.bookings set patient_phone = null where booked_by = v_uid;
  update public.pharmacy_requests set patient_phone = null where requested_by = v_uid;
  update public.home_visit_requests
  set patient_phone = null, reason = 'محذوف', address_details = 'محذوف', latitude = null, longitude = null
  where requested_by = v_uid;
  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function public.prepare_account_deletion() from public, anon;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.prepare_account_deletion() to authenticated;
grant execute on function public.delete_my_account() to authenticated;
