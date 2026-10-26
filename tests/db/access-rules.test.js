// Checks the database's access rules on the real Aafia database. Each
// test runs in a transaction that is rolled back, so nothing is kept.
import assert from "node:assert/strict";
import { test } from "node:test";
import { runSql } from "../../scripts/supabase-api.js";

const ADMIN = "00000000-0000-4000-8000-00000000a001";
const USER = "00000000-0000-4000-8000-00000000a002";

const fixtures = `
  insert into auth.users (id, instance_id, aud, role, email) values
    ('${ADMIN}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-admin@aafia-test.invalid'),
    ('${USER}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-user@aafia-test.invalid');
  insert into public.team_members (user_id, role) values ('${ADMIN}', 'admin');
  insert into public.places (kind, name_ar, name_en, area_ar, area_en, is_active) values
    ('clinic', 'ظاهر', 'RLS Shown', 'أ', 'A', true),
    ('clinic', 'مخفي', 'RLS Hidden', 'أ', 'A', false);
  insert into public.doctors (place_id, specialty_id, name_ar, name_en, is_active)
    select p.id, (select min(id) from public.specialties), 'د', n.name, n.active
    from public.places p
    cross join (values ('RLS Doc Active', true), ('RLS Doc Inactive', false)) as n(name, active)
    where p.name_en = 'RLS Shown';
  insert into public.doctors (place_id, specialty_id, name_ar, name_en)
    select id, (select min(id) from public.specialties), 'د', 'RLS Doc At Hidden'
    from public.places where name_en = 'RLS Hidden';
  insert into public.emergency_departments (name_ar, name_en, area_ar, area_en, phone, is_active) values
    ('ط', 'RLS ED Shown', 'أ', 'A', '999', true),
    ('ط', 'RLS ED Hidden', 'أ', 'A', '999', false);
`;

const as = (who) =>
  who === "anon"
    ? "reset role; set local role anon; select set_config('request.jwt.claims', '{\"role\":\"anon\"}', true);"
    : `reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"${who}","role":"authenticated"}', true);`;

// Runs checks (a PL/pgSQL body that raises on failure) and rolls back.
async function scenario(steps) {
  await runSql(`begin;\n${fixtures}\n${steps}\nrollback;`);
}

const expectCount = (sql, n, message) => `
  do $$ begin
    if (${sql}) <> ${n} then raise exception '${message}'; end if;
  end $$;`;

const expectDenied = (sql, message) => `
  do $$ begin
    begin ${sql}; raise exception '${message}';
    exception when insufficient_privilege then null; end;
  end $$;`;

const expectNoRowsChanged = (sql, message) => `
  do $$ declare n int; begin
    ${sql}; get diagnostics n = row_count;
    if n <> 0 then raise exception '${message}'; end if;
  end $$;`;

test("the public sees only active listings", async () => {
  await scenario(`${as("anon")}
    ${expectCount("select count(*) from public.places where name_en like 'RLS %'", 1, "anon should see only the shown place")}
    ${expectCount("select count(*) from public.places where name_en = 'RLS Hidden'", 0, "anon sees a hidden place")}
    ${expectCount("select count(*) from public.doctors where name_en like 'RLS %'", 1, "anon should see only the active doctor at a shown place")}
    ${expectCount("select count(*) from public.emergency_departments where name_en like 'RLS %'", 1, "anon should see only the shown ED")}
    ${expectCount("select count(*) from public.specialties", 16, "anon should see the specialties")}
    ${expectCount("select count(*) from public.team_members", 0, "anon sees team members")}
  `);
});

test("the public cannot add, change or delete anything", async () => {
  await scenario(`${as("anon")}
    ${expectDenied("insert into public.places (kind, name_ar, name_en, area_ar, area_en) values ('clinic','x','x','x','x')", "anon inserted a place")}
    ${expectDenied("insert into public.emergency_departments (name_ar, name_en, area_ar, area_en, phone) values ('x','x','x','x','999')", "anon inserted an ED")}
    ${expectDenied(`insert into public.team_members (user_id, role) values ('${USER}', 'admin')`, "anon made someone admin")}
    ${expectNoRowsChanged("update public.places set name_en = 'hacked' where name_en like 'RLS %'", "anon changed a place")}
    ${expectNoRowsChanged("delete from public.emergency_departments where name_en like 'RLS %'", "anon deleted an ED")}
    ${expectDenied("perform public.list_team_members()", "anon listed the team")}
  `);
});

test("a signed-in person who is not on the team can only read", async () => {
  await scenario(`${as(USER)}
    ${expectCount("select count(*) from public.places where name_en = 'RLS Hidden'", 0, "user sees a hidden place")}
    ${expectDenied("insert into public.places (kind, name_ar, name_en, area_ar, area_en) values ('clinic','x','x','x','x')", "user inserted a place")}
    ${expectDenied(`insert into public.team_members (user_id, role) values ('${USER}', 'admin')`, "user made themselves admin")}
    ${expectNoRowsChanged("update public.doctors set fee_sdg = 1 where name_en like 'RLS %'", "user changed a doctor")}
    ${expectNoRowsChanged("delete from public.specialties", "user deleted specialties")}
    ${expectDenied("perform public.list_team_members()", "user listed the team")}
    ${expectDenied("perform public.add_team_member('rls-user@aafia-test.invalid', 'admin')", "user added a team member")}
    ${expectCount("select public.is_admin()::int", 0, "user counted as admin")}
  `);
});

test("an admin can see and change everything", async () => {
  await scenario(`${as(ADMIN)}
    ${expectCount("select public.is_admin()::int", 1, "admin not recognised")}
    ${expectCount("select count(*) from public.places where name_en like 'RLS %'", 2, "admin should see hidden places")}
    ${expectCount("select count(*) from public.doctors where name_en like 'RLS %'", 3, "admin should see all doctors")}
    insert into public.places (kind, name_ar, name_en, area_ar, area_en) values ('lab', 'م', 'RLS New', 'أ', 'A');
    ${expectCount("select count(*) from public.places where name_en = 'RLS New'", 1, "admin could not add a place")}
    update public.emergency_departments set is_active = true where name_en = 'RLS ED Hidden';
    ${expectCount("select count(*) from public.emergency_departments where name_en like 'RLS ED%' and is_active", 2, "admin could not update an ED")}
    ${expectCount("select count(*) from public.list_team_members() where email like 'rls-%'", 1, "admin could not list the team")}
    ${expectCount("select (public.add_team_member('rls-user@aafia-test.invalid', 'reception', (select id from public.places where name_en = 'RLS Shown')) = 'added')::int", 1, "admin could not add a member")}
    ${expectCount("select (public.add_team_member('nobody@aafia-test.invalid', 'admin') = 'not_found')::int", 1, "unknown email should be not_found")}
    ${expectDenied(`perform public.remove_team_member('${ADMIN}')`, "admin removed themselves")}
    delete from public.places where name_en = 'RLS New';
  `);
});

test("bad data is refused by the database", async () => {
  await scenario(`${as(ADMIN)}
    do $$ begin
      begin
        insert into public.places (kind, name_ar, name_en, area_ar, area_en, latitude)
          values ('clinic', 'x', 'x', 'x', 'x', 15.5);
        raise exception 'latitude without longitude was accepted';
      exception when check_violation then null; end;
      begin
        insert into public.doctors (place_id, specialty_id, name_ar, name_en, fee_sdg)
          select id, (select min(id) from public.specialties), 'x', 'x', -5 from public.places limit 1;
        raise exception 'negative fee was accepted';
      exception when check_violation then null; end;
      begin
        insert into public.opening_hours (weekday, opens, closes) values (1, '09:00', '17:00');
        raise exception 'hours without a place or doctor were accepted';
      exception when check_violation then null; end;
    end $$;
  `);
});
