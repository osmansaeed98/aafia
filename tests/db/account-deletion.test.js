// Deleting a patient account: what goes, what clinics keep, and who may.
// Runs in transactions that are rolled back.
import { test } from "node:test";
import { runSql } from "../../scripts/supabase-api.js";

const ALICE = "00000000-0000-4000-8000-00000000f001";
const BOB = "00000000-0000-4000-8000-00000000f002";
const DESK = "00000000-0000-4000-8000-00000000f003";

const fixtures = `
  insert into auth.users (id, instance_id, aud, role, phone) values
    ('${ALICE}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '249900000041'),
    ('${BOB}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '249900000042'),
    ('${DESK}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '249900000043');
  insert into public.places (kind, name_ar, name_en, area_ar, area_en, is_active, home_visits) values
    ('clinic', 'ع', 'AD Clinic', 'أ', 'A', true, true), ('pharmacy', 'ص', 'AD Pharmacy', 'أ', 'A', true, false);
  insert into public.doctors (place_id, specialty_id, name_ar, name_en)
    select id, (select min(id) from public.specialties), 'د', 'AD Doctor' from public.places where name_en = 'AD Clinic';
  insert into public.opening_hours (doctor_id, weekday, opens, closes)
    select d.id, g, '00:00', '23:59' from public.doctors d, generate_series(0, 6) g where d.name_en = 'AD Doctor';
  insert into public.team_members (user_id, role, place_id) values
    ('${DESK}', 'reception', (select id from public.places where name_en = 'AD Clinic'));
  insert into public.profiles (user_id, full_name) values ('${ALICE}', 'Alice AD'), ('${BOB}', 'Bob AD');
  insert into public.family_members (owner_id, full_name, relation) values ('${ALICE}', 'Son AD', 'son');
  create temp table t on commit drop as select
    (select id from public.doctors where name_en = 'AD Doctor') as doctor,
    (select id from public.places where name_en = 'AD Clinic') as clinic,
    (select id from public.places where name_en = 'AD Pharmacy') as pharmacy,
    private.khartoum_now()::date as today;
  grant select on t to authenticated, anon;
`;

const as = (who) =>
  who === "anon"
    ? "reset role; set local role anon; select set_config('request.jwt.claims', '{\"role\":\"anon\"}', true);"
    : `reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"${who}","role":"authenticated"}', true);`;
const scenario = (steps) => runSql(`begin;\n${fixtures}\n${steps}\nrollback;`);
const q = (text) => text.replaceAll("'", "''");
const expectValue = (sql, value, message) => `
  do $$ declare v text; begin
    v := (${sql})::text;
    if v is distinct from (${value})::text then raise exception '${q(message)}: got %', v; end if;
  end $$;`;
const expectError = (sql, error, message) => `
  do $$ begin
    begin ${sql}; raise exception 'expected error ${error}: ${q(message)}';
    exception when others then
      if sqlerrm <> '${error}' and sqlstate <> '${error}' then raise; end if;
    end;
  end $$;`;

// Alice and Bob each book, ask a pharmacy and request a home visit.
const activity = (who) => `
  ${as(who)}
  select public.book(t.doctor, t.today, '00:00', null) from t;
  select public.request_medicines(t.pharmacy, null, 'بندول', null) from t;
  select public.request_home_visit(t.clinic, null, 'كبير سن', t.today + 1, 'evening', 'الرياض', 'شارع 15 بيت أبيض', 15.6, 32.5) from t;
`;

test("deleting an account removes the person's details; clinics keep only name and number", async () => {
  await scenario(`
    ${activity(ALICE)}
    ${activity(BOB)}
    reset role;
    insert into storage.objects (bucket_id, name, owner_id) values ('medical-files', '${ALICE}/a.pdf', '${ALICE}');
    ${as(ALICE)}
    select public.add_my_record(null, 'report', 'تقرير', null, '${ALICE}/a.pdf');
    select public.prepare_account_deletion();
    ${expectValue("select count(*)::int from public.bookings where status = 'cancelled'", 1, "her upcoming booking is cancelled")}
    ${expectValue("select count(*)::int from public.medical_records", 1, "records stay until their files are deleted")}
    ${expectValue("select count(*)::int from public.pharmacy_requests where status = 'cancelled' and items_text is null", 1, "her medicine request is cancelled and cleared")}
    select public.delete_my_account();
    reset role;
    ${expectValue(`select count(*)::int from public.medical_records where owner_id = '${ALICE}'`, 0, "her medical file is emptied")}
    ${expectValue(`select count(*)::int from auth.users where id = '${ALICE}'`, 0, "the account is gone")}
    ${expectValue(`select count(*)::int from public.profiles where user_id = '${ALICE}'`, 0, "the profile is gone")}
    ${expectValue("select count(*)::int from public.family_members where full_name = 'Son AD'", 0, "family members are gone")}
    ${expectValue("select count(*)::int from public.bookings where patient_name = 'Alice AD' and booked_by is null and patient_phone is null", 1, "the clinic keeps the name and number only")}
    ${expectValue("select count(*)::int from public.home_visit_requests where patient_name = 'Alice AD' and latitude is null and patient_phone is null and address_details = 'محذوف · deleted' and area = 'محذوف · deleted'", 1, "the home address is removed")}
    ${expectValue(`select count(*)::int from public.bookings where booked_by = '${BOB}' and status = 'booked' and patient_phone is not null`, 1, "Bob is untouched")}
    ${expectValue(`select count(*)::int from public.pharmacy_requests where requested_by = '${BOB}' and items_text = 'بندول'`, 1, "Bob's request is untouched")}
  `);
});

test("reception, signed-out visitors and skipped steps can't delete an account", async () => {
  await scenario(`
    ${as(DESK)}
    ${expectError("perform public.prepare_account_deletion()", "team", "a reception account")}
    ${expectError("perform public.delete_my_account()", "team", "a reception account")}
    ${as(BOB)}
    ${expectError("perform public.delete_my_account()", "not_prepared", "the last step on its own")}
    ${as("anon")}
    ${expectError("perform public.delete_my_account()", "42501", "a signed-out visitor")}
  `);
});
