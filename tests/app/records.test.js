// Medical file, prescriptions sent from it, and ratings, in phone-sized
// browsers on the real database. "E2E" data, test accounts and uploaded
// test files are removed afterwards.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
import { literal, runSql } from "../../scripts/supabase-api.js";
import { assertFitsScreen, cleanUp, createTestUser, phone, removeOwnPhotos, sessionCookies, startApp } from "./helpers.js";

let app;
let browser;
let patient;
let desk;
let pharmacist;
const ids = {};

// A tiny valid PDF, standing in for a lab result.
const PDF = Buffer.from(
  "%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);

// Opens a medical file link as the page's signed-in person. The app
// redirects to a short-lived Supabase link, fetched here directly.
async function openFile(page, href) {
  const response = await page.request.get(app.base + href, { maxRedirects: 0 });
  if (response.status() !== 307) return { status: response.status() };
  const file = await fetch(response.headers().location);
  return { status: file.status, type: file.headers.get("content-type") };
}

async function pageAs(user) {
  const context = await browser.newContext(phone);
  if (user) await context.addCookies(await sessionCookies(user, app.base));
  return context.newPage();
}

before(async () => {
  await cleanUp();
  app = await startApp(3133);
  browser = await chromium.launch();
  patient = await createTestUser("e2e-records");
  desk = await createTestUser("e2e-records-desk");
  pharmacist = await createTestUser("e2e-records-pharmacy");
  await runSql(`
    insert into public.places (kind, name_ar, name_en, area_ar, area_en, is_active) values
      ('clinic', 'عيادة الملف E2E', 'E2E Records Clinic', 'العمارات', 'Amarat', true),
      ('pharmacy', 'صيدلية الملف E2E', 'E2E Records Pharmacy', 'بحري', 'Bahri', true);
    insert into public.doctors (place_id, specialty_id, name_ar, name_en, fee_sdg)
      select id, (select min(id) from public.specialties), 'د. الملف E2E', 'E2E Records Doctor', 15000
      from public.places where name_en = 'E2E Records Clinic';
    insert into public.opening_hours (doctor_id, weekday, opens, closes)
      select d.id, g, '00:00', '23:59' from public.doctors d, generate_series(0, 6) g where d.name_en = 'E2E Records Doctor';
    insert into public.team_members (user_id, role, place_id) values
      (${literal(desk.id)}, 'reception', (select id from public.places where name_en = 'E2E Records Clinic')),
      (${literal(pharmacist.id)}, 'reception', (select id from public.places where name_en = 'E2E Records Pharmacy'));
    insert into public.profiles (user_id, full_name) values (${literal(patient.id)}, 'مريض الملف E2E');
  `);
  const [row] = await runSql(`
    select d.id as doctor, d.place_id as clinic, (select id from public.places where name_en = 'E2E Records Pharmacy') as pharmacy
    from public.doctors d where d.name_en = 'E2E Records Doctor'`);
  Object.assign(ids, row);
});

after(async () => {
  await browser?.close();
  app?.stop();
  // Records and requests first (files in use are protected), then the files.
  if (patient) {
    await runSql(`
      delete from public.pharmacy_requests where requested_by = ${literal(patient.id)};
      delete from public.medical_records where owner_id = ${literal(patient.id)};`);
    await removeOwnPhotos(patient, "medical-files");
    if (ids.clinic) await removeOwnPhotos(desk, "medical-files", `place-${ids.clinic}`);
  }
  await cleanUp();
});

test("reception adds a lab result to a booking; only the patient and that clinic can open it", async () => {
  // The patient books.
  const page = await pageAs(patient);
  await page.goto(`${app.base}/book/${ids.doctor}`);
  await page.click("form button.button-solid");
  await page.waitForURL(/\/bookings\/\d+\?ok=booked/);
  ids.booking = page.url().match(/bookings\/(\d+)/)[1];
  assert.equal(await page.locator(".rating-form").count(), 0, "no rating before the visit");

  // Reception adds the result and marks the patient as seen.
  const [{ session_id }] = await runSql(`select session_id from public.bookings where id = ${Number(ids.booking)}`);
  const staff = await pageAs(desk);
  await staff.goto(`${app.base}/clinic/sessions/${session_id}`);
  await staff.click(".queue-row .add-more > summary");
  await staff.selectOption('.queue-row [name="kind"]', "lab_result");
  await staff.fill('.queue-row [name="title"]', "صورة دم E2E");
  await staff.setInputFiles('.queue-row input[name="file"]', { name: "cbc.pdf", mimeType: "application/pdf", buffer: PDF });
  await staff.fill('.queue-row [name="notes"]', "النتيجة جاهزة E2E");
  await staff.click(".queue-row .add-more form button.button-solid");
  await staff.waitForURL(/ok=record/);
  assert.match(await staff.innerText(".record-files"), /صورة دم E2E/);
  // A file added by mistake can be removed, and is deleted from storage.
  await staff.click(".queue-row .add-more > summary");
  await staff.fill('.queue-row [name="title"]', "ملف غلط E2E");
  await staff.setInputFiles('.queue-row input[name="file"]', { name: "oops.pdf", mimeType: "application/pdf", buffer: PDF });
  await staff.click(".queue-row .add-more form button.button-solid");
  await staff.locator(".record-files li", { hasText: "ملف غلط E2E" }).waitFor();
  const [{ file_path }] = await runSql(`select file_path from public.medical_records where title = 'ملف غلط E2E'`);
  const wrong = staff.locator(".record-files li", { hasText: "ملف غلط E2E" });
  await wrong.locator(".confirm-delete > summary").click();
  await wrong.locator(".confirm-delete button").click();
  await wrong.waitFor({ state: "detached" });
  assert.match(await staff.innerText(".record-files"), /صورة دم E2E/);
  const [{ left }] = await runSql(`select count(*)::int as left from storage.objects where name = ${literal(file_path)}`);
  assert.equal(left, 0, "the removed file is gone from storage");
  await staff.locator(".queue-row form", { hasText: "اتكشف" }).locator("button").click();
  await staff.locator(".queue-row form", { hasText: "اتكشف" }).waitFor({ state: "detached" });
  await assertFitsScreen(staff);
  await staff.context().close();

  // The patient finds it in "My medical file" and opens the file.
  await page.goto(`${app.base}/records`);
  const text = await page.innerText("main");
  assert.match(text, /مريض الملف E2E/);
  assert.match(text, /صورة دم E2E/);
  assert.match(text, /من عيادة الملف E2E/);
  assert.match(text, /نتيجة تحليل/);
  assert.equal(await page.locator(".record .confirm-delete").count(), 0, "a clinic's result can't be deleted by the patient");
  const href = await page.locator(".record a", { hasText: "افتح الملف" }).getAttribute("href");
  assert.deepEqual(await openFile(page, href), { status: 200, type: "application/pdf" });
  await assertFitsScreen(page);
  ids.resultHref = href;

  // Nobody else can.
  const other = await pageAs(pharmacist);
  assert.equal((await openFile(other, href)).status, 404);
  await other.context().close();
  await page.context().close();
});

test("after the visit the patient rates it once; the comment stays private", async () => {
  const page = await pageAs(patient);
  await page.goto(`${app.base}/bookings/${ids.booking}`);
  await page.locator(".star-choice .slot", { hasText: "كويسة" }).first().click();
  await page.fill('.rating-form [name="comment"]', "الدكتور كويس E2E");
  await page.click(".rating-form button.button-solid");
  await page.waitForURL(/rating=thanks/);
  assert.match(await page.innerText("main"), /شكراً/);
  assert.match(await page.innerText("main"), /4 من 5/);
  assert.equal(await page.locator(".rating-form").count(), 0, "can't rate twice");
  await assertFitsScreen(page);
  await page.context().close();

  // One rating isn't enough for public stars.
  const visitor = await pageAs(null);
  await visitor.goto(`${app.base}/book/${ids.doctor}`);
  assert.equal(await visitor.locator(".stars").count(), 0);
  await visitor.context().close();
});

test("the patient adds a prescription, sends it to a pharmacy, and deletes another document", async () => {
  const page = await pageAs(patient);
  await page.goto(`${app.base}/records`);
  await page.click(".add-more.card > summary");
  await page.selectOption('[name="kind"]', "prescription");
  await page.fill('[name="title"]', "روشتة قديمة E2E");
  await page.setInputFiles('input[name="file"]', "tests/app/rx-sample.jpg");
  await page.click(".add-more.card form button.button-solid");
  await page.waitForURL(/ok=added/);

  // Send it to the pharmacy.
  const record = page.locator(".record", { hasText: "روشتة قديمة E2E" });
  await record.locator(".add-more > summary").click();
  await record.locator('[name="place_id"]').selectOption(String(ids.pharmacy));
  await record.locator(".add-more form button.button-solid").click();
  await page.waitForURL(/\/requests\/medicines\/\d+\?ok=sent/);
  const requestId = page.url().match(/medicines\/(\d+)/)[1];
  assert.equal(await page.locator("a", { hasText: "روشتة من الملف الطبي" }).count(), 1);

  // The pharmacy opens just that prescription; not the lab result.
  const shop = await pageAs(pharmacist);
  await shop.goto(`${app.base}/clinic/medicines/${requestId}`);
  const link = shop.locator("a", { hasText: "روشتة من الملف الطبي" });
  assert.match(await link.innerText(), /روشتة قديمة E2E/);
  const file = await openFile(shop, await link.getAttribute("href"));
  assert.equal(file.status, 200);
  assert.match(file.type, /^image\/jpeg/);
  assert.equal((await openFile(shop, ids.resultHref)).status, 404);
  await assertFitsScreen(shop);
  await shop.context().close();

  // Once sent, it can't be deleted. Another document can.
  await page.goto(`${app.base}/records`);
  assert.equal(await page.locator(".record", { hasText: "روشتة قديمة E2E" }).locator(".confirm-delete").count(), 0);
  await page.click(".add-more.card > summary");
  await page.selectOption('[name="kind"]', "report");
  await page.fill('[name="title"]', "تقرير للمسح E2E");
  await page.setInputFiles('input[name="file"]', { name: "report.pdf", mimeType: "application/pdf", buffer: PDF });
  await page.click(".add-more.card form button.button-solid");
  await page.waitForURL(/ok=added/);
  const [{ file_path }] = await runSql(`select file_path from public.medical_records where title = 'تقرير للمسح E2E'`);
  assert.match(file_path, new RegExp(`^${patient.id}/.+\\.pdf$`));
  const doomed = page.locator(".record", { hasText: "تقرير للمسح E2E" });
  await doomed.locator(".confirm-delete > summary").click();
  await doomed.locator(".confirm-delete button").click();
  await page.waitForURL(/ok=deleted/);
  assert.doesNotMatch(await page.innerText("main"), /تقرير للمسح E2E/);
  const [{ left }] = await runSql(`select count(*)::int as left from storage.objects where name = ${literal(file_path)}`);
  assert.equal(left, 0, "the file is gone too");
  await assertFitsScreen(page);
  await page.context().close();
});

test("the home page and account link to the medical file", async () => {
  const page = await pageAs(patient);
  await page.goto(app.base + "/");
  assert.equal(await page.locator('a.action-small[href="/records"]').count(), 1);
  await assertFitsScreen(page);
  await page.goto(app.base + "/account");
  assert.equal(await page.locator('a[href="/records"]').count(), 1);
  await page.context().close();
});
