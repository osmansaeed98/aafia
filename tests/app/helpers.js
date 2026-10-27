// Shared setup for the browser tests: runs the built app, and creates
// temporary sign-in accounts on the real database (removed afterwards).
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { literal, runSql } from "../../scripts/supabase-api.js";

// Read .env.local the same way Next.js does, for the Supabase settings.
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const TEST_EMAIL_DOMAIN = "aafia-test.invalid";

export const phone = { viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true };

export async function startApp(port) {
  const server = spawn("npx", ["next", "start", "-p", String(port)], {
    stdio: "ignore",
    detached: true,
  });
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return { base, stop: () => process.kill(-server.pid) };
}

// Deletes a test account's uploaded prescription photos through
// Supabase's file API (the database refuses direct deletes).
export async function removeOwnPhotos(user) {
  const client = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) return;
  const { data } = await client.storage.from("prescriptions").list(user.id);
  if (data?.length) await client.storage.from("prescriptions").remove(data.map((f) => `${user.id}/${f.name}`));
}

// The public's view of the database (what anyone on the internet sees).
export function publicClient() {
  return createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
}

// Creates a confirmed email+password account. Returns its details.
export async function createTestUser(name, { admin = false, id = randomUUID() } = {}) {
  const email = `${name}-${id.slice(0, 8)}@${TEST_EMAIL_DOMAIN}`;
  const password = randomBytes(18).toString("base64url");
  await runSql(`
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token
    ) values (
      '${id}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      ${literal(email)}, extensions.crypt(${literal(password)}, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{}', now(), now(),
      '', '', '', '', '', '', '', ''
    );
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), '${id}', '${id}',
      jsonb_build_object('sub', '${id}', 'email', ${literal(email)}, 'email_verified', true),
      'email', now(), now(), now());
    ${admin ? `insert into public.team_members (user_id, role) values ('${id}', 'admin');` : ""}
  `);
  return { id, email, password };
}

// Signs in like the app does and returns the session cookies, ready for
// the browser. (The real login uses an emailed code; tests use a password.)
export async function sessionCookies(user, base) {
  const jar = new Map();
  const client = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => {
        for (const { name, value } of cookies) {
          if (value) jar.set(name, value);
          else jar.delete(name);
        }
      },
    },
  });
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw error;
  return [...jar].map(([name, value]) => ({ name, value, url: base }));
}

// Removes everything the tests created.
export async function cleanUp() {
  await runSql(`
    delete from public.places where name_en like 'E2E %';
    delete from public.emergency_departments where name_en like 'E2E %';
    delete from public.specialties where name_en like 'E2E %';
    delete from auth.users where email like '%@${TEST_EMAIL_DOMAIN}';
  `);
}

// Nothing on the page sticks out past either edge of a phone screen
// (right-to-left pages overflow to the left, which scrollWidth misses).
export async function assertFitsScreen(page) {
  const offenders = await page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    return [...document.querySelectorAll("body *")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.left < -1 || r.right > w + 1);
      })
      .slice(0, 3)
      .map((el) => `${el.tagName.toLowerCase()}.${el.className}`);
  });
  if (offenders.length) throw new Error(`${page.url()} doesn't fit the screen: ${offenders.join(", ")}`);
}
