// Launch prep: privacy and terms pages, the team's typed sign-in code,
// and patients deleting their account. Phone-sized browser, real database.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
import { literal, runSql } from "../../scripts/supabase-api.js";
import { readFileSync } from "node:fs";
import { assertFitsScreen, cleanUp, createTestUser, phone, publicClient, sessionCookies, startApp, TEST_EMAIL_DOMAIN } from "./helpers.js";

let app;
let browser;

async function pageAs(user, lang) {
  const context = await browser.newContext(phone);
  if (user) await context.addCookies(await sessionCookies(user, app.base));
  if (lang) await context.addCookies([{ name: "lang", value: lang, url: app.base }]);
  return context.newPage();
}

before(async () => {
  await cleanUp();
  app = await startApp(3134);
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  app?.stop();
  await cleanUp();
});

test("privacy and terms are linked from every page, in both languages", async () => {
  for (const [lang, privacy, terms] of [
    ["ar", /فريق عافية ما بيشوف ملفك الطبي/, /الدفع كاش في المكان بس/],
    ["en", /The Aafia team does not see your medical file/, /Payment is cash at the place only/],
  ]) {
    const page = await pageAs(null, lang);
    await page.goto(app.base + "/book");
    await page.click('footer a[href="/privacy"]');
    await page.waitForURL(/\/privacy$/);
    assert.match(await page.innerText("main"), privacy);
    assert.match(await page.innerText("main"), /2026/);
    await assertFitsScreen(page);
    await page.click('footer a[href="/terms"]');
    await page.waitForURL(/\/terms$/);
    assert.match(await page.innerText("main"), terms);
    await assertFitsScreen(page);
    await page.goto(app.base + "/login");
    assert.equal(await page.locator('main a[href="/privacy"]').count(), 1, "login links to privacy");
    await page.context().close();
  }
});

test("the team can type the code from the sign-in email; a wrong code says so", async () => {
  const page = await pageAs(null);
  const email = `nobody@${TEST_EMAIL_DOMAIN}`;
  await page.goto(`${app.base}/admin/login?email=${encodeURIComponent(email)}`);
  await page.fill('[name="code"]', "123456");
  await page.click('form:has([name="code"]) button');
  await page.waitForURL(/error=code/);
  assert.match(await page.innerText("main"), /الكود غلط أو انتهى/);
  assert.equal(await page.locator('[name="code"]').count(), 1, "the code box stays");
  await assertFitsScreen(page);
  await page.context().close();
});

test("a patient deletes their account: details, files and family go; the clinic keeps only the name", async () => {
  const patient = await createTestUser("e2e-leaving");
  await runSql(`
    insert into public.profiles (user_id, full_name) values (${literal(patient.id)}, 'مريض مغادر E2E');
    insert into public.family_members (owner_id, full_name, relation) values (${literal(patient.id)}, 'ابن المغادر E2E', 'son');`);
  const page = await pageAs(patient);
  await page.goto(app.base + "/records");
  await page.click(".add-more.card > summary");
  await page.fill('[name="title"]', "تقرير E2E");
  await page.setInputFiles('input[name="file"]', "tests/app/rx-sample.jpg");
  await page.click(".add-more.card form button.button-solid");
  await page.waitForURL(/ok=added/);
  const [{ files }] = await runSql(`select count(*)::int as files from storage.objects where name like ${literal(patient.id + "/%")}`);
  assert.equal(files, 1);

  // A lab result the clinic added to their file (stored in the clinic's folder).
  const desk = await createTestUser("e2e-leaving-desk");
  await runSql(`
    insert into public.places (kind, name_ar, name_en, area_ar, area_en) values ('lab', 'معمل E2E', 'E2E Leaving Lab', 'أ', 'A');
    insert into public.team_members (user_id, role, place_id) values (${literal(desk.id)}, 'reception', (select id from public.places where name_en = 'E2E Leaving Lab'));`);
  const [{ id: lab }] = await runSql("select id from public.places where name_en = 'E2E Leaving Lab'");
  const deskClient = publicClient();
  await deskClient.auth.signInWithPassword({ email: desk.email, password: desk.password });
  const labFile = `place-${lab}/e2e-leaving.jpg`;
  const { error: uploadError } = await deskClient.storage
    .from("medical-files")
    .upload(labFile, readFileSync("tests/app/rx-sample.jpg"), { contentType: "image/jpeg" });
  assert.equal(uploadError, null);
  await runSql(`insert into public.medical_records (owner_id, patient_name, kind, title, file_path, uploaded_by, place_id)
    values (${literal(patient.id)}, 'مريض مغادر E2E', 'lab_result', 'نتيجة E2E', ${literal(labFile)}, ${literal(desk.id)}, ${lab})`);

  await page.goto(app.base + "/account");
  await page.click(".delete-account > summary");
  assert.match(await page.innerText(".delete-account"), /ما بيترجع/);
  await assertFitsScreen(page);
  await page.click(".delete-account button");
  await page.waitForURL(/\/\?deleted=1$/);
  assert.match(await page.innerText("main"), /حسابك اتمسح/);

  const [left] = await runSql(`
    select (select count(*)::int from auth.users where id = ${literal(patient.id)}) as users,
           (select count(*)::int from public.family_members where owner_id = ${literal(patient.id)}) as family,
           (select count(*)::int from storage.objects where name like ${literal(patient.id + "/%")}) as files,
           (select count(*)::int from storage.objects where name = ${literal(labFile)}) as lab_files`);
  assert.deepEqual(left, { users: 0, family: 0, files: 0, lab_files: 0 });
  // Signed out: the account page asks to sign in again.
  await page.goto(app.base + "/account");
  await page.waitForURL(/\/login/);
  await page.context().close();
});

test("reception accounts can't delete themselves", async () => {
  const desk = await createTestUser("e2e-desk-stays");
  await runSql(`
    insert into public.places (kind, name_ar, name_en, area_ar, area_en) values ('clinic', 'عيادة E2E', 'E2E Stay Clinic', 'أ', 'A');
    insert into public.team_members (user_id, role, place_id) values (${literal(desk.id)}, 'reception', (select id from public.places where name_en = 'E2E Stay Clinic'));
    insert into public.profiles (user_id, full_name) values (${literal(desk.id)}, 'استقبال E2E');`);
  const page = await pageAs(desk);
  await page.goto(app.base + "/account");
  await page.click(".delete-account > summary");
  await page.click(".delete-account button");
  await page.waitForURL(/error=team/);
  assert.match(await page.innerText("main"), /فريق عافية أو استقبال/);
  const [{ users }] = await runSql(`select count(*)::int as users from auth.users where id = ${literal(desk.id)}`);
  assert.equal(users, 1);
  await page.context().close();
});
