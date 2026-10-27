// Patient profiles and family members are private: each person sees and
// changes only their own. Runs in transactions that are rolled back.
import { test } from "node:test";
import { runSql } from "../../scripts/supabase-api.js";

const ALICE = "00000000-0000-4000-8000-00000000b001";
const BOB = "00000000-0000-4000-8000-00000000b002";
const ADMIN = "00000000-0000-4000-8000-00000000b003";

const fixtures = `
  insert into auth.users (id, instance_id, aud, role, phone) values
    ('${ALICE}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '249900000001'),
    ('${BOB}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '249900000002'),
    ('${ADMIN}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '249900000003');
  insert into public.team_members (user_id, role) values ('${ADMIN}', 'admin');
  insert into public.profiles (user_id, full_name) values ('${ALICE}', 'Alice Test'), ('${BOB}', 'Bob Test');
  insert into public.family_members (owner_id, full_name, relation) values
    ('${ALICE}', 'Alice Child', 'son'), ('${BOB}', 'Bob Mother', 'mother');
`;

const as = (who) =>
  who === "anon"
    ? "reset role; set local role anon; select set_config('request.jwt.claims', '{\"role\":\"anon\"}', true);"
    : `reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"${who}","role":"authenticated"}', true);`;

const scenario = (steps) => runSql(`begin;\n${fixtures}\n${steps}\nrollback;`);

const expectCount = (sql, n, message) => `
  do $$ begin if (${sql}) <> ${n} then raise exception '${message}'; end if; end $$;`;
const expectDenied = (sql, message) => `
  do $$ begin begin ${sql}; raise exception '${message}';
  exception when insufficient_privilege then null; end; end $$;`;
const expectNoRowsChanged = (sql, message) => `
  do $$ declare n int; begin ${sql}; get diagnostics n = row_count;
  if n <> 0 then raise exception '${message}'; end if; end $$;`;

test("patients see only their own profile and family", async () => {
  await scenario(`${as(ALICE)}
    ${expectCount("select count(*) from public.profiles", 1, "Alice should see only her profile")}
    ${expectCount("select count(*) from public.family_members", 1, "Alice should see only her family")}
    ${expectCount("select count(*) from public.family_members where full_name = 'Bob Mother'", 0, "Alice sees the family of Bob")}
  `);
});

test("patients cannot change or add to someone else's details", async () => {
  await scenario(`${as(ALICE)}
    ${expectNoRowsChanged("update public.profiles set full_name = 'hacked' where user_id = '" + BOB + "'", "Alice changed the profile of Bob")}
    ${expectNoRowsChanged("delete from public.family_members where owner_id = '" + BOB + "'", "Alice deleted the family of Bob")}
    ${expectDenied("insert into public.family_members (owner_id, full_name, relation) values ('" + BOB + "', 'Planted', 'son')", "Alice added to the family of Bob")}
    ${expectDenied("insert into public.profiles (user_id, full_name) values ('" + ADMIN + "', 'Planted')", "Alice created a profile for someone else")}
  `);
});

test("signed-out visitors and the admin team cannot read patient details", async () => {
  await scenario(`${as("anon")}
    ${expectDenied("perform count(*) from public.profiles", "anon read profiles")}
    ${expectDenied("perform count(*) from public.family_members", "anon read family")}
    ${as(ADMIN)}
    ${expectCount("select count(*) from public.profiles where full_name like '% Test'", 0, "admins can read patient profiles")}
    ${expectCount("select count(*) from public.family_members", 0, "admins can read patient families")}
  `);
});

test("a family can have at most 20 members", async () => {
  await scenario(`${as(ALICE)}
    insert into public.family_members (owner_id, full_name, relation)
      select '${ALICE}', 'Member ' || g, 'other' from generate_series(1, 19) g;
    do $$ begin
      begin
        insert into public.family_members (owner_id, full_name, relation) values ('${ALICE}', 'One too many', 'other');
        raise exception '21st member was accepted';
      exception when check_violation then null; end;
    end $$;
  `);
});
