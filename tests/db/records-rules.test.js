// Medical records, prescriptions sent to pharmacies and ratings: who can
// see and change what. Runs in transactions that are rolled back.
import { test } from "node:test";
import { runSql } from "../../scripts/supabase-api.js";

const ALICE = "00000000-0000-4000-8000-00000000e001";
const BOB = "00000000-0000-4000-8000-00000000e002";
const DESK = "00000000-0000-4000-8000-00000000e003"; // reception at the clinic
const OTHER_DESK = "00000000-0000-4000-8000-00000000e004"; // another clinic
const PHARMACIST = "00000000-0000-4000-8000-00000000e005";
const ADMIN = "00000000-0000-4000-8000-00000000e006"; // Aafia team

const fixtures = `
  insert into auth.users (id, instance_id, aud, role, phone) values
    ('${ALICE}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '249900000031'),
    ('${BOB}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '249900000032'),
    ('${DESK}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '249900000033'),
    ('${OTHER_DESK}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '249900000034'),
    ('${PHARMACIST}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '249900000035'),
    ('${ADMIN}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '249900000036');
  insert into public.places (kind, name_ar, name_en, area_ar, area_en, is_active) values
    ('clinic', 'ع', 'RR Clinic', 'أ', 'A', true), ('clinic', 'ع', 'RR Other', 'أ', 'A', true),
    ('pharmacy', 'ص', 'RR Pharmacy', 'أ', 'A', true);
  insert into public.doctors (place_id, specialty_id, name_ar, name_en)
    select id, (select min(id) from public.specialties), 'د', 'RR Doctor' from public.places where name_en = 'RR Clinic';
  insert into public.opening_hours (doctor_id, weekday, opens, closes)
    select d.id, g, '00:00', '23:59' from public.doctors d, generate_series(0, 6) g where d.name_en = 'RR Doctor';
  insert into public.team_members (user_id, role, place_id) values
    ('${DESK}', 'reception', (select id from public.places where name_en = 'RR Clinic')),
    ('${OTHER_DESK}', 'reception', (select id from public.places where name_en = 'RR Other')),
    ('${PHARMACIST}', 'reception', (select id from public.places where name_en = 'RR Pharmacy')),
    ('${ADMIN}', 'admin', null);
  insert into public.profiles (user_id, full_name) values ('${ALICE}', 'Alice RR'), ('${BOB}', 'Bob RR');
  create temp table t on commit drop as select
    (select id from public.doctors where name_en = 'RR Doctor') as doctor,
    (select id from public.places where name_en = 'RR Clinic') as clinic,
    (select id from public.places where name_en = 'RR Pharmacy') as pharmacy,
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
const upload = (owner, path, bucket = "medical-files") =>
  `insert into storage.objects (bucket_id, name, owner_id) values ('${bucket}', '${path}', '${owner}');`;

// Alice books, reception calls her in (seen), and reception adds a result.
const visit = `
  ${as(ALICE)}
  select public.book(t.doctor, t.today, '00:00', null) from t;
  ${as(DESK)}
  select public.call_next(s.id) from public.sessions s join t on s.doctor_id = t.doctor;
  select public.call_next(s.id) from public.sessions s join t on s.doctor_id = t.doctor;
  ${upload(DESK, "place-' || (select clinic from t) || '/result.pdf")}
`;

test("a clinic adds a result to its patient's booking; only the patient and that clinic see it", async () => {
  await scenario(`${visit}
    reset role;
    select set_config('test.path', 'place-' || (select clinic from t) || '/result.pdf', true);
    ${as(DESK)}
    select public.staff_add_record(b.id, 'lab_result', 'صورة دم', 'طبيعي', current_setting('test.path')) from public.bookings b;
    ${as(ALICE)}
    ${expectValue("select count(*)::int from public.medical_records", 1, "Alice sees her result")}
    ${expectValue("select count(*)::int from storage.objects where name = current_setting('test.path')", 1, "Alice can open the file")}
    ${as(BOB)}
    ${expectValue("select count(*)::int from public.medical_records", 0, "Bob sees nothing")}
    ${expectValue("select count(*)::int from storage.objects where name = current_setting('test.path')", 0, "Bob cannot open the file")}
    ${as(OTHER_DESK)}
    ${expectValue("select count(*)::int from public.medical_records", 0, "another clinic sees nothing")}
    ${expectValue("select count(*)::int from storage.objects where name = current_setting('test.path')", 0, "another clinic cannot open the file")}
    ${expectError(`insert into storage.objects (bucket_id, name, owner_id) select 'medical-files', 'place-' || t.clinic || '/x.pdf', '${OTHER_DESK}' from t`, "42501", "another clinic uploading into this clinic's folder")}
    ${as(ADMIN)}
    ${expectValue("select count(*)::int from public.medical_records", 0, "the Aafia team does not see patients' files")}
    ${expectValue("select count(*)::int from storage.objects where name = current_setting('test.path')", 0, "the Aafia team cannot open the file")}
  `);
});

test("records can only be added with the right file, to the right patient", async () => {
  await scenario(`${visit}
    reset role;
    select set_config('test.booking', (select max(id)::text from public.bookings), true);
    ${as(OTHER_DESK)}
    ${expectError("perform public.staff_add_record(current_setting('test.booking')::bigint, 'report', 'x', null, 'place-1/x.pdf')", "42501", "other clinic adding to this booking")}
    ${as(DESK)}
    ${expectError("perform public.staff_add_record(b.id, 'report', 'تقرير', null, 'place-' || t.clinic || '/missing.pdf') from public.bookings b, t", "invalid", "file never uploaded")}
    ${as(ALICE)}
    ${upload(ALICE, `${ALICE}/old.pdf`)}
    select public.add_my_record(null, 'report', 'تقرير قديم', null, '${ALICE}/old.pdf');
    reset role;
    select set_config('test.record', (select max(id)::text from public.medical_records), true);
    ${as(ALICE)}
    ${expectError(`perform public.add_my_record(null, 'report', 'x', null, '${BOB}/old.pdf')`, "invalid", "someone else's file")}
    ${expectError(`insert into storage.objects (bucket_id, name, owner_id) values ('medical-files', '${BOB}/x.pdf', '${ALICE}')`, "42501", "uploading into Bob's folder")}
    ${as(BOB)}
    ${expectError("perform public.delete_record(current_setting('test.record')::bigint)", "invalid", "Bob deleting Alice's document")}
    ${as(ALICE)}
    ${expectValue("select public.delete_record(id) from public.medical_records", `'${ALICE}/old.pdf'`, "Alice deletes her own document")}
  `);
});

test("a prescription sent from the record: that pharmacy sees just that one", async () => {
  await scenario(`${visit}
    reset role;
    select set_config('test.path', 'place-' || (select clinic from t) || '/result.pdf', true);
    ${as(DESK)}
    select public.staff_add_record(b.id, 'prescription', 'روشتة', null, current_setting('test.path')) from public.bookings b;
    ${as(PHARMACIST)}
    ${expectValue("select count(*)::int from public.medical_records", 0, "pharmacy sees nothing before it is sent")}
    ${as(ALICE)}
    select public.request_medicines(t.pharmacy, null, null, null, m.id) from t, public.medical_records m;
    ${as(DESK)}
    ${expectError("perform public.delete_record(id) from public.medical_records", "sent", "the clinic deleting a prescription already sent")}
    ${as(PHARMACIST)}
    ${expectValue("select count(*)::int from public.medical_records", 1, "pharmacy sees the sent prescription")}
    ${expectValue("select count(*)::int from storage.objects where name = current_setting('test.path')", 1, "pharmacy can open its file")}
    reset role;
    select set_config('test.record', (select max(id)::text from public.medical_records), true);
    ${as(BOB)}
    ${expectError("perform public.request_medicines(t.pharmacy, null, null, null, current_setting('test.record')::bigint) from t", "invalid", "Bob sending Alice's prescription")}
    ${expectError("perform public.delete_record(current_setting('test.record')::bigint)", "invalid", "Bob can't learn it was sent")}
    reset role;
    delete from auth.users where id = '${ALICE}';
    set constraints all immediate;
    ${expectValue("select count(*)::int from public.pharmacy_requests where record_id is null and items_text is null and photo_path is null", 1, "deleting the account keeps the pharmacy's request")}
  `);
});

test("ratings: only after a completed visit, once, and only averages are public", async () => {
  await scenario(`
    ${as(ALICE)}
    select public.book(t.doctor, t.today, '00:00', null) from t;
    ${expectError("perform public.rate('booking', id, 5) from public.bookings", "invalid", "rating before being seen")}
    ${as(DESK)}
    select public.call_next(s.id) from public.sessions s join t on s.doctor_id = t.doctor;
    select public.call_next(s.id) from public.sessions s join t on s.doctor_id = t.doctor;
    ${as(ALICE)}
    select public.rate('booking', id, 4, 'كويس بس الانتظار طويل') from public.bookings;
    reset role;
    select set_config('test.booking', (select max(id)::text from public.bookings), true);
    ${as(ALICE)}
    ${expectError("perform public.rate('booking', id, 5) from public.bookings", "already", "rating twice")}
    ${as(BOB)}
    ${expectError("perform public.rate('booking', current_setting('test.booking')::bigint, 1)", "invalid", "rating someone else's visit")}
    ${expectValue("select count(*)::int from public.ratings", 0, "Bob cannot read comments")}
    ${as(DESK)}
    ${expectValue("select comment from public.ratings", "'كويس بس الانتظار طويل'", "the clinic reads its comments")}
    ${as(OTHER_DESK)}
    ${expectValue("select count(*)::int from public.ratings", 0, "another clinic cannot")}
    ${as("anon")}
    ${expectValue("select count(*)::int from public.rating_summary() s join t on s.place_id = t.clinic", 0, "no public stars before 3 ratings")}
    ${expectError("perform count(*) from public.ratings", "42501", "anon reading ratings")}
    reset role;
    insert into public.ratings (rater, place_id, stars) select '${BOB}', t.clinic, 5 from t;
    insert into public.ratings (rater, place_id, stars) select '${BOB}', t.clinic, 3 from t;
    ${as("anon")}
    ${expectValue("select s.average || ' ' || s.ratings from public.rating_summary() s join t on s.place_id = t.clinic", "'4.0 3'", "public average after 3 ratings")}
  `);
});
