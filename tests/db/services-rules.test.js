// Labs, pharmacy requests and home visits: rules and privacy, on the
// real database in transactions that are rolled back.
import { test } from "node:test";
import { runSql } from "../../scripts/supabase-api.js";

const ALICE = "00000000-0000-4000-8000-00000000d001";
const BOB = "00000000-0000-4000-8000-00000000d002";
const PHARMACIST = "00000000-0000-4000-8000-00000000d003";
const OTHER_PHARMACIST = "00000000-0000-4000-8000-00000000d004";
const NURSE_DESK = "00000000-0000-4000-8000-00000000d005";

const fixtures = `
  insert into auth.users (id, instance_id, aud, role, phone) values
    ('${ALICE}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '249900000021'),
    ('${BOB}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '249900000022'),
    ('${PHARMACIST}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '249900000023'),
    ('${OTHER_PHARMACIST}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '249900000024'),
    ('${NURSE_DESK}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '249900000025');
  insert into public.places (kind, name_ar, name_en, area_ar, area_en, is_active, home_visits) values
    ('lab', 'م', 'SV Lab', 'أ', 'A', true, false),
    ('pharmacy', 'ص', 'SV Pharmacy', 'أ', 'A', true, false),
    ('pharmacy', 'ص', 'SV Other Pharmacy', 'أ', 'A', true, false),
    ('clinic', 'ع', 'SV Home Clinic', 'أ', 'A', true, true),
    ('clinic', 'ع', 'SV No Visits', 'أ', 'A', true, false);
  insert into public.opening_hours (place_id, weekday, opens, closes)
    select id, g, '00:00', '23:59' from public.places, generate_series(0, 6) g where name_en = 'SV Lab';
  insert into public.lab_tests (place_id, name_ar, name_en, price_sdg, is_active)
    select id, 'صورة دم', 'SV CBC', 8000, true from public.places where name_en = 'SV Lab'
    union all select id, 'مخفي', 'SV Hidden Test', 1, false from public.places where name_en = 'SV Lab';
  insert into public.team_members (user_id, role, place_id) values
    ('${PHARMACIST}', 'reception', (select id from public.places where name_en = 'SV Pharmacy')),
    ('${OTHER_PHARMACIST}', 'reception', (select id from public.places where name_en = 'SV Other Pharmacy')),
    ('${NURSE_DESK}', 'reception', (select id from public.places where name_en = 'SV Home Clinic'));
  insert into public.profiles (user_id, full_name) values ('${ALICE}', 'Alice SV'), ('${BOB}', 'Bob SV');
  insert into public.family_members (owner_id, full_name, relation) values ('${ALICE}', 'Alice Father', 'father');
  create temp table t on commit drop as select
    (select id from public.places where name_en = 'SV Lab') as lab,
    (select d.id from public.doctors d join public.places p on p.id = d.place_id where p.name_en = 'SV Lab' and d.is_lab_desk) as desk,
    (select id from public.places where name_en = 'SV Pharmacy') as pharmacy,
    (select id from public.places where name_en = 'SV Home Clinic') as home_clinic,
    (select id from public.places where name_en = 'SV No Visits') as no_visits,
    (select id from public.family_members where full_name = 'Alice Father') as father,
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

test("a lab gets a queue automatically, and shows only its active prices", async () => {
  await scenario(`${as("anon")}
    ${expectValue("select count(*)::int from public.lab_tests where name_en like 'SV %'", 1, "only the active test is public")}
    ${expectValue("select count(*)::int from public.available_sessions((select desk from t), 7)", 7, "lab sessions from the lab's hours")}
    ${as(ALICE)}
    do $$ declare v bigint; n int; begin
      select public.book(t.desk, t.today, '00:00', null) into v from t;
      select queue_number into n from public.bookings where id = v;
      if n is distinct from 1 then raise exception 'lab queue number: got %', n; end if;
    end $$;
  `);
});

test("medicine requests: the patient and that pharmacy only", async () => {
  await scenario(`${as(ALICE)}
    select public.request_medicines(t.pharmacy, t.father, 'Panadol 500 x2', null) from t;
    reset role;
    select set_config('test.request', (select max(id)::text from public.pharmacy_requests), true);
    ${as(ALICE)}
    ${expectValue("select patient_name from public.pharmacy_requests", "'Alice Father'", "named for the family member")}
    ${as(BOB)}
    ${expectValue("select count(*)::int from public.pharmacy_requests", 0, "Bob sees nothing")}
    ${as(OTHER_PHARMACIST)}
    ${expectValue("select count(*)::int from public.pharmacy_requests", 0, "another pharmacy sees nothing")}
    ${expectError("perform public.answer_medicines(current_setting('test.request')::bigint, 'available')", "42501", "other pharmacy answering")}
    ${as(PHARMACIST)}
    ${expectValue("select count(*)::int from public.pharmacy_requests", 1, "the pharmacy sees it")}
    select public.answer_medicines(id, 'available', 4500, now() + interval '1 hour', 'جاهز بعد ساعة') from public.pharmacy_requests;
    ${as(ALICE)}
    ${expectValue("select total_sdg from public.pharmacy_requests", 4500, "patient sees the price")}
    select public.cancel_medicines(id) from public.pharmacy_requests;
    ${expectValue("select status from public.pharmacy_requests", "'cancelled'", "patient cancels")}
  `);
});

test("medicine request rules: real pharmacy, something to send, own photo, at most 5 open", async () => {
  await scenario(`${as(ALICE)}
    ${expectError("perform public.request_medicines(t.home_clinic, null, 'x', null) from t", "invalid", "a clinic is not a pharmacy")}
    ${expectError("perform public.request_medicines(t.pharmacy, null, '  ', null) from t", "empty", "empty request")}
    ${expectError(`perform public.request_medicines(t.pharmacy, null, null, '${BOB}/x.jpg') from t`, "invalid", "someone else's photo")}
    select public.request_medicines(t.pharmacy, null, 'item ' || g, null) from t, generate_series(1, 5) g;
    ${expectError("perform public.request_medicines(t.pharmacy, null, 'one more', null) from t", "limit", "sixth open request")}
    ${as("anon")}
    ${expectError("perform count(*) from public.pharmacy_requests", "42501", "anon reading requests")}
  `);
});

test("prescription photos: upload only into your own folder", async () => {
  await scenario(`${as(ALICE)}
    insert into storage.objects (bucket_id, name, owner_id) values ('prescriptions', '${ALICE}/rx.jpg', '${ALICE}');
    ${expectError(`insert into storage.objects (bucket_id, name, owner_id) values ('prescriptions', '${BOB}/rx.jpg', '${ALICE}')`, "42501", "upload into Bob's folder")}
    ${as(BOB)}
    ${expectValue("select count(*)::int from storage.objects where bucket_id = 'prescriptions'", 0, "Bob cannot see Alice's photo")}
    ${as(ALICE)}
    ${expectValue(`select count(*)::int from storage.objects where name = '${ALICE}/rx.jpg'`, 1, "Alice sees her own photo")}
    ${as(ALICE)}
    select public.request_medicines(t.pharmacy, null, null, '${ALICE}/rx.jpg') from t;
    ${as(PHARMACIST)}
    ${expectValue(`select count(*)::int from storage.objects where name = '${ALICE}/rx.jpg'`, 1, "the pharmacy can see the photo sent to it")}
    ${as(OTHER_PHARMACIST)}
    ${expectValue(`select count(*)::int from storage.objects where name = '${ALICE}/rx.jpg'`, 0, "another pharmacy cannot")}
  `);
});

test("home visits: request, the clinic confirms with time and fee, the patient sees it", async () => {
  await scenario(`${as(ALICE)}
    ${expectError("perform public.request_home_visit(t.no_visits, null, 'كبير سن', t.today + 1, 'evening', 'الرياض', 'شارع 15 جنب الجامع') from t", "invalid", "place without home visits")}
    ${expectError("perform public.request_home_visit(t.home_clinic, null, 'كبير سن', t.today + 30, 'evening', 'الرياض', 'شارع 15 جنب الجامع') from t", "date", "too far ahead")}
    select public.request_home_visit(t.home_clinic, t.father, 'كبير سن، ما بقدر يمشي', t.today + 1, 'evening', 'الرياض', 'شارع 15 جنب الجامع', 15.58, 32.53) from t;
    ${as(BOB)}
    ${expectValue("select count(*)::int from public.home_visit_requests", 0, "Bob sees nothing")}
    ${as(NURSE_DESK)}
    ${expectError("perform public.answer_home_visit(id, 'confirmed') from public.home_visit_requests", "invalid", "confirm without a time")}
    select public.answer_home_visit(id, 'confirmed', now() + interval '1 day', 20000, 'الدكتور بيجي الساعة 6') from public.home_visit_requests;
    ${as(ALICE)}
    ${expectValue("select status || ' ' || fee_sdg from public.home_visit_requests", "'confirmed 20000'", "patient sees confirmation")}
    select public.request_home_visit(t.home_clinic, null, 'متابعة', t.today + 2, 'morning', 'الرياض', 'شارع 15 جنب الجامع') from t;
    select public.request_home_visit(t.home_clinic, null, 'متابعة تانية', t.today + 3, 'morning', 'الرياض', 'شارع 15 جنب الجامع') from t;
    ${expectError("perform public.request_home_visit(t.home_clinic, null, 'متابعة 4', t.today + 4, 'morning', 'الرياض', 'شارع 15 جنب الجامع') from t", "limit", "fourth open visit")}
  `);
});

test("replies follow a sensible order (no reopening collected or declined)", async () => {
  await scenario(`${as(ALICE)}
    select public.request_medicines(t.pharmacy, null, 'x', null) from t;
    select public.request_home_visit(t.home_clinic, null, 'متابعة', t.today + 1, 'evening', 'الرياض', 'شارع 15 جنب الجامع') from t;
    ${as(PHARMACIST)}
    ${expectError("perform public.answer_medicines(id, 'collected') from public.pharmacy_requests", "invalid", "collected before available")}
    select public.answer_medicines(id, 'available', 100) from public.pharmacy_requests;
    select public.answer_medicines(id, 'collected') from public.pharmacy_requests;
    ${expectError("perform public.answer_medicines(id, 'available') from public.pharmacy_requests", "invalid", "reopening a collected request")}
    ${as(NURSE_DESK)}
    ${expectError("perform public.answer_home_visit(id, 'done') from public.home_visit_requests", "invalid", "done before confirmed")}
    select public.answer_home_visit(id, 'declined', null, null, 'مافي دكتور') from public.home_visit_requests;
    ${expectError("perform public.answer_home_visit(id, 'confirmed', now()) from public.home_visit_requests", "invalid", "confirming a declined visit")}
  `);
});

test("a place's lab queue is on only while it is a lab; photos are capped at 30", async () => {
  await scenario(`
    update public.places set kind = 'clinic' where name_en = 'SV Lab';
    ${expectValue("select is_active from public.doctors where id = (select desk from t)", "false", "desk off when no longer a lab")}
    update public.places set kind = 'lab' where name_en = 'SV Lab';
    ${expectValue("select is_active from public.doctors where id = (select desk from t)", "true", "desk back on as a lab")}
    ${as(ALICE)}
    insert into storage.objects (bucket_id, name, owner_id)
      select 'prescriptions', '${ALICE}/' || g || '.jpg', '${ALICE}' from generate_series(1, 30) g;
    ${expectError(`insert into storage.objects (bucket_id, name, owner_id) values ('prescriptions', '${ALICE}/31.jpg', '${ALICE}')`, "42501", "31st photo")}
    ${expectError(`perform public.request_medicines(t.pharmacy, null, null, '${ALICE}/missing.jpg') from t`, "invalid", "photo that was never uploaded")}
  `);
});
