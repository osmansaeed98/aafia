// Booking rules on the real database, in transactions that are rolled
// back. Covers queue numbers, limits, privacy and reception access.
import { test } from "node:test";
import { runSql } from "../../scripts/supabase-api.js";

const ALICE = "00000000-0000-4000-8000-00000000c001";
const BOB = "00000000-0000-4000-8000-00000000c002";
const DESK = "00000000-0000-4000-8000-00000000c003"; // reception at the test clinic
const OTHER_DESK = "00000000-0000-4000-8000-00000000c004"; // reception elsewhere

// A clinic open every day 00:00–23:59, with one doctor (2 numbers a day).
const fixtures = `
  insert into auth.users (id, instance_id, aud, role, phone) values
    ('${ALICE}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '249900000011'),
    ('${BOB}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '249900000012'),
    ('${DESK}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '249900000013'),
    ('${OTHER_DESK}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '249900000014');
  insert into public.places (kind, name_ar, name_en, area_ar, area_en, is_active) values
    ('clinic', 'ع', 'BK Clinic', 'أ', 'A', true), ('clinic', 'ع', 'BK Other', 'أ', 'A', true);
  insert into public.doctors (place_id, specialty_id, name_ar, name_en, fee_sdg, daily_limit)
    select id, (select min(id) from public.specialties), 'د', 'BK Doctor', 10000, 2
    from public.places where name_en = 'BK Clinic';
  insert into public.opening_hours (doctor_id, weekday, opens, closes)
    select d.id, g, '00:00', '23:59' from public.doctors d, generate_series(0, 6) g where d.name_en = 'BK Doctor';
  insert into public.team_members (user_id, role, place_id) values
    ('${DESK}', 'reception', (select id from public.places where name_en = 'BK Clinic')),
    ('${OTHER_DESK}', 'reception', (select id from public.places where name_en = 'BK Other'));
  insert into public.profiles (user_id, full_name) values ('${ALICE}', 'Alice BK'), ('${BOB}', 'Bob BK');
  insert into public.family_members (owner_id, full_name, relation) values
    ('${ALICE}', 'Alice Son', 'son'), ('${ALICE}', 'Alice Daughter', 'daughter'), ('${ALICE}', 'Alice Mother', 'mother');
  create temp table t_ids on commit drop as select
    (select id from public.doctors where name_en = 'BK Doctor') as doctor,
    (private.khartoum_now())::date as today,
    (select id from public.family_members where full_name = 'Alice Son') as son,
    (select id from public.family_members where full_name = 'Alice Daughter') as daughter,
    (select id from public.family_members where full_name = 'Alice Mother') as mother;
  grant select on t_ids to authenticated, anon;
`;

const as = (who) =>
  who === "anon"
    ? "reset role; set local role anon; select set_config('request.jwt.claims', '{\"role\":\"anon\"}', true);"
    : `reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"${who}","role":"authenticated"}', true);`;

const scenario = (steps) => runSql(`begin;\n${fixtures}\n${steps}\nrollback;`);

const BOOK = (family = "null", day = "t.today") =>
  `public.book(t.doctor, ${day}, '00:00', ${family}) from t_ids t`;

const q = (text) => text.replaceAll("'", "''");

// Runs sql once, compares the result as text.
const expectValue = (sql, value, message) => `
  do $$ declare v text; begin
    v := (${sql})::text;
    if v is distinct from (${value})::text then raise exception '${q(message)}: got %', v; end if;
  end $$;`;
// Books once (sql returns a booking id) and checks the queue number.
const expectNumber = (bookSql, number, message) => `
  do $$ declare v bigint; n integer; begin
    select ${bookSql} into v;
    select queue_number into n from public.bookings where id = v;
    if n is distinct from ${number} then raise exception '${q(message)}: got %', n; end if;
  end $$;`;
const expectError = (sql, error, message) => `
  do $$ begin
    begin ${sql}; raise exception 'expected error ${error}: ${q(message)}';
    exception when others then
      if sqlerrm <> '${error}' and sqlstate <> '${error}' then raise; end if;
    end;
  end $$;`;

test("patients get queue numbers in order, once per person, up to the daily limit", async () => {
  await scenario(`${as(ALICE)}
    ${expectNumber(BOOK(), 1, "first number")}
    ${expectNumber(BOOK("t.son"), 2, "second number")}
    ${expectError(`perform ${BOOK()}`, "duplicate", "same person twice")}
    ${as(BOB)}
    ${expectError(`perform ${BOOK()}`, "full", "over the daily limit")}
  `);
});

test("an account can hold at most 3 upcoming bookings", async () => {
  await scenario(`
    update public.doctors set daily_limit = 50 where name_en = 'BK Doctor';
    ${as(ALICE)}
    select ${BOOK()};
    select ${BOOK("t.son")};
    select ${BOOK("t.daughter")};
    ${expectError(`perform ${BOOK("t.mother")}`, "limit", "fourth booking")}
  `);
});

test("bookings only for your own family, at real session times, by signed-in people", async () => {
  await scenario(`${as(BOB)}
    ${expectError(`perform ${BOOK("t.son")}`, "invalid", "booking for someone else's son")}
    ${expectError("perform public.book(t.doctor, t.today, '03:15', null) from t_ids t", "invalid", "made-up time")}
    ${expectError("perform public.book(t.doctor, t.today + 20, '00:00', null) from t_ids t", "invalid", "too far ahead")}
    ${as("anon")}
    ${expectError("perform public.book(1, current_date, '00:00', null)", "42501", "anon booking")}
  `);
});

test("patients see only their own bookings; the public sees only queue status", async () => {
  await scenario(`${as(ALICE)}
    select ${BOOK()};
    ${as(BOB)}
    select ${BOOK()};
    ${expectValue("select count(*)::int from public.bookings", 1, "Bob should see only his booking")}
    ${expectError("insert into public.bookings (session_id, patient_name, queue_number) select id, 'x', 99 from public.sessions limit 1", "42501", "direct insert")}
    ${as("anon")}
    ${expectError("perform count(*) from public.bookings", "42501", "anon reading bookings")}
    ${expectValue("select now_serving from public.sessions s join t_ids t on s.doctor_id = t.doctor", 0, "anon reads queue status")}
  `);
});

test("reception runs the queue: call next, walk-ins, cash, delays", async () => {
  await scenario(`
    update public.doctors set daily_limit = 50 where name_en = 'BK Doctor';
    ${as(ALICE)}
    select ${BOOK()};
    select ${BOOK("t.son")};
    ${as(DESK)}
    ${expectValue("select count(*)::int from public.bookings", 2, "reception sees its clinic's bookings")}
    ${expectValue("select public.add_walk_in(s.id, 'Walk In BK', '0912345678') from public.sessions s join t_ids t on s.doctor_id = t.doctor", 3, "walk-in number")}
    ${expectValue("select public.call_next(s.id) from public.sessions s join t_ids t on s.doctor_id = t.doctor", 1, "first call")}
    select public.set_booking_status(b.id, 'no_show') from public.bookings b where b.queue_number = 2;
    ${expectValue("select public.call_next(s.id) from public.sessions s join t_ids t on s.doctor_id = t.doctor", 3, "skips the no-show")}
    ${expectValue("select status from public.bookings where queue_number = 1", "'seen'", "previous marked seen")}
    select public.mark_paid(b.id, 10000) from public.bookings b where b.queue_number = 3;
    ${expectValue("select paid_amount from public.bookings where queue_number = 3", 10000, "cash recorded")}
    select public.update_session(s.id, 'delayed', 30, 'الدكتور متأخر') from public.sessions s join t_ids t on s.doctor_id = t.doctor;
    ${as("anon")}
    ${expectValue("select delay_minutes from public.sessions s join t_ids t on s.doctor_id = t.doctor", 30, "delay is public")}
    ${as(ALICE)}
    ${expectValue("select count(*)::int from public.bookings where paid_amount = 10000", 0, "Alice cannot see the walk-in")}
  `);
});

test("reception at another clinic, and patients, cannot touch this queue", async () => {
  await scenario(`${as(ALICE)}
    select ${BOOK()};
    ${as(OTHER_DESK)}
    ${expectValue("select count(*)::int from public.bookings", 0, "other clinic sees no bookings")}
    ${expectError("perform public.call_next(s.id) from public.sessions s join t_ids t on s.doctor_id = t.doctor", "42501", "other clinic calling next")}
    ${expectError("perform public.open_session(t.doctor, t.today, '00:00') from t_ids t", "42501", "other clinic opening a session")}
    ${as(ALICE)}
    ${expectError("perform public.add_walk_in(s.id, 'x') from public.sessions s join t_ids t on s.doctor_id = t.doctor", "42501", "patient adding walk-in")}
    ${expectError("perform public.mark_paid(b.id, 0) from public.bookings b", "42501", "patient marking paid")}
  `);
});

test("patients can cancel their own booking, and the number is freed for the limit", async () => {
  await scenario(`${as(ALICE)}
    select ${BOOK()};
    select ${BOOK("t.son")};
    reset role;
    select set_config('test.alice_booking', (select id::text from public.bookings where queue_number = 1), true);
    ${as(BOB)}
    ${expectError("perform public.cancel_booking(current_setting('test.alice_booking')::bigint)", "invalid", "Bob cancelling Alice's")}
    ${as(ALICE)}
    select public.cancel_booking(id) from public.bookings where queue_number = 1;
    ${as(BOB)}
    ${expectNumber(BOOK(), 3, "Bob gets a place after the cancel")}
  `);
});

test("a late patient marked as arrived again is still called", async () => {
  await scenario(`
    update public.doctors set daily_limit = 50 where name_en = 'BK Doctor';
    ${as(ALICE)}
    select ${BOOK()};
    select ${BOOK("t.son")};
    ${as(DESK)}
    select public.set_booking_status(b.id, 'no_show') from public.bookings b where b.queue_number = 1;
    ${expectValue("select public.call_next(s.id) from public.sessions s join t_ids t on s.doctor_id = t.doctor", 2, "skips the absent number 1")}
    select public.set_booking_status(b.id, 'arrived') from public.bookings b where b.queue_number = 1;
    ${expectValue("select public.call_next(s.id) from public.sessions s join t_ids t on s.doctor_id = t.doctor", 1, "the late arrival is called next")}
  `);
});

test("cancelled sessions free the patient's limit, can be cancelled, and take no walk-ins", async () => {
  await scenario(`
    update public.doctors set daily_limit = 50 where name_en = 'BK Doctor';
    ${as(ALICE)}
    select ${BOOK()};
    select ${BOOK("t.son")};
    select ${BOOK("t.daughter")};
    ${as(DESK)}
    select public.update_session(s.id, 'cancelled') from public.sessions s join t_ids t on s.doctor_id = t.doctor;
    ${expectError("perform public.add_walk_in(s.id, 'x') from public.sessions s join t_ids t on s.doctor_id = t.doctor", "closed", "walk-in in a cancelled session")}
    ${expectError("perform public.call_next(s.id) from public.sessions s join t_ids t on s.doctor_id = t.doctor", "closed", "calling next in a cancelled session")}
    ${as(ALICE)}
    select public.cancel_booking(id) from public.bookings where queue_number = 1;
    ${expectValue("select status from public.bookings where queue_number = 1", "'cancelled'", "patient cancels in a cancelled session")}
    ${expectNumber("public.book(t.doctor, t.today + 1, '00:00', t.mother) from t_ids t", 1, "cancelled session no longer counts towards the limit")}
  `);
});

test("reception still sees a doctor an admin hid, and only its own clinic's day", async () => {
  await scenario(`
    update public.doctors set is_active = false where name_en = 'BK Doctor';
    ${as(DESK)}
    ${expectValue("select count(*)::int from public.doctors where name_en = 'BK Doctor'", 1, "reception sees its hidden doctor")}
    ${as(BOB)}
    ${expectValue("select count(*)::int from public.doctors where name_en = 'BK Doctor'", 0, "patients do not")}
    ${expectError("perform * from public.clinic_today((select id from public.places where name_en = 'BK Clinic'))", "42501", "patient reading the clinic day")}
    ${as(OTHER_DESK)}
    ${expectError("perform * from public.clinic_today((select id from public.places where name_en = 'BK Clinic'))", "42501", "other clinic reading this day")}
    reset role;
    update public.doctors set is_active = true where name_en = 'BK Doctor';
    ${as(DESK)}
    ${expectValue("select count(*)::int from public.clinic_today((select id from public.places where name_en = 'BK Clinic'))", 1, "today's session listed")}
  `);
});
