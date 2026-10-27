// The whole booking flow in phone-sized browsers, against the real
// database: a patient books, reception runs the queue, and the patient's
// page follows along live. All "E2E" data and test accounts are removed.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
import { literal, runSql } from "../../scripts/supabase-api.js";
import { cleanUp, createTestUser, phone, sessionCookies, startApp } from "./helpers.js";

let app;
let browser;
let patient;
let stranger;
let desk;
let doctorId;
const pages = {};

async function pageAs(user) {
  const context = await browser.newContext(phone);
  if (user) await context.addCookies(await sessionCookies(user, app.base));
  return context.newPage();
}

async function until(check, message, tries = 160) {
  for (let i = 0; i < tries; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.fail(message);
}

const noSideways = async (page) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert.ok(overflow <= 0, `${page.url()} is ${overflow}px too wide`);
};

before(async () => {
  await cleanUp();
  app = await startApp(3130);
  browser = await chromium.launch();
  patient = await createTestUser("e2e-booker");
  stranger = await createTestUser("e2e-stranger");
  desk = await createTestUser("e2e-desk");
  const [{ id }] = await runSql(`
    with place as (
      insert into public.places (kind, name_ar, name_en, area_ar, area_en, phone, is_active)
      values ('clinic', 'عيادة الحجز E2E', 'E2E Booking Clinic', 'بحري', 'Bahri', '0912 000 111', true) returning id
    ), doc as (
      insert into public.doctors (place_id, specialty_id, name_ar, name_en, fee_sdg, daily_limit, minutes_per_patient)
      select place.id, (select id from public.specialties where name_en = 'Paediatrics'), 'د. الصف E2E', 'E2E Dr Queue', 12000, 5, 10
      from place returning id, place_id
    ), hours as (
      insert into public.opening_hours (doctor_id, weekday, opens, closes)
      select doc.id, g, '00:00', '23:59' from doc, generate_series(0, 6) g
    ), staff as (
      insert into public.team_members (user_id, role, place_id) select ${literal(desk.id)}, 'reception', place_id from doc
    )
    select id from doc;
    insert into public.profiles (user_id, full_name) values (${literal(patient.id)}, 'مريض E2E'), (${literal(stranger.id)}, 'غريب E2E');
    insert into public.family_members (owner_id, full_name, relation) values (${literal(patient.id)}, 'طفل E2E', 'son');
  `).then(async () => runSql("select id from public.doctors where name_en = 'E2E Dr Queue'"));
  doctorId = id;
});

after(async () => {
  await browser?.close();
  app?.stop();
  await cleanUp();
});

test("anyone can find the doctor; booking asks people to sign in", async () => {
  const page = await pageAs(null);
  await page.goto(app.base + "/");
  await page.click('a.action-primary[href="/book"]');
  await page.fill('[name="q"]', "E2E Dr");
  await page.click('form[role="search"] button');
  await page.locator(".doctor-row", { hasText: "د. الصف E2E" }).click();
  await page.waitForURL(new RegExp(`/book/${doctorId}$`));
  assert.match(await page.innerText("main"), /12,000 ج\.س/);
  assert.match(await page.innerText("main"), /الدفع كاش في الاستقبال/);
  assert.ok((await page.locator(".slot input:not([disabled])").count()) >= 1, "bookable days shown");
  assert.match(await page.innerText("main"), /سجل دخول عشان تحجز/);
  await noSideways(page);
  await page.context().close();
});

test("a patient books numbers for a child and for themselves", async () => {
  const page = await pageAs(patient);
  pages.patient = page;
  await page.goto(`${app.base}/book/${doctorId}`);
  await page.locator(".slot", { hasText: "طفل E2E" }).click();
  await page.click('form button.button-solid');
  await page.waitForURL(/\/bookings\/\d+\?ok=booked/);
  assert.match(await page.innerText(".alert-ok"), /اتحجزت/);
  assert.equal((await page.locator(".queue-big").first().innerText()).trim(), "1");
  pages.childBooking = page.url().split("?")[0];

  await page.goto(`${app.base}/book/${doctorId}`);
  await page.click('form button.button-solid'); // "me" is preselected
  await page.waitForURL(/\/bookings\/\d+\?ok=booked/);
  assert.equal((await page.locator(".queue-big").first().innerText()).trim(), "2");
  pages.myBooking = page.url().split("?")[0];
  assert.match(await page.innerText(".queue-card"), /قدامك 1/);
  await noSideways(page);

  // The same person twice in one session is refused, in plain words.
  await page.goto(`${app.base}/book/${doctorId}`);
  await page.locator(".slot", { hasText: "طفل E2E" }).click();
  await page.click('form button.button-solid');
  await page.waitForURL(/error=duplicate/);
  assert.match(await page.innerText(".alert-error"), /عندو حجز في نفس اليوم/);

  // Both show in "My bookings".
  await page.goto(app.base + "/account");
  assert.equal(await page.locator(".rows a[href^='/bookings/']").count(), 2);
});

test("other people cannot open someone else's booking", async () => {
  const page = await pageAs(stranger);
  const res = await page.goto(pages.myBooking);
  assert.equal(res.status(), 404);
  await page.context().close();
});

test("reception runs the queue and the patient's page follows live", async () => {
  const deskPage = await pageAs(desk);
  await deskPage.goto(app.base + "/account");
  await deskPage.click("a.clinic-link");
  await deskPage.waitForURL(app.base + "/clinic");
  await deskPage.locator(".session-card", { hasText: "د. الصف E2E" }).locator(".button-solid").click();
  await deskPage.waitForURL(/\/clinic\/sessions\/\d+/);
  const sessionUrl = deskPage.url().split("?")[0];
  assert.match(await deskPage.innerText(".queue-list"), /طفل E2E/);
  assert.match(await deskPage.innerText(".queue-list"), /مريض E2E/);
  await noSideways(deskPage);

  // Walk-in gets number 3.
  await deskPage.click(".add-more > summary.button-solid");
  await deskPage.fill('form:has([name="name"]) [name="name"]', "حضور E2E");
  await deskPage.click('form:has([name="name"]) button');
  await deskPage.locator(".queue-row", { hasText: "حضور E2E" }).waitFor();
  assert.match(await deskPage.locator(".queue-row", { hasText: "حضور E2E" }).innerText(), /^3/);

  // The patient watches booking number 2.
  const patientPage = pages.patient;
  await patientPage.goto(pages.myBooking);
  assert.equal((await patientPage.getByTestId("now-serving").innerText()).trim(), "–");

  // Call next: number 1 goes in; the patient's page updates by itself.
  await deskPage.click("button.call-next");
  await until(async () => (await deskPage.getByTestId("now-serving").innerText()).trim() === "1", "reception shows 1");
  await until(async () => (await patientPage.getByTestId("now-serving").innerText()).trim() === "1", "patient page updated live");
  assert.match(await patientPage.innerText(".queue-card"), /قدامك 1/);

  // A delay with a message reaches the patient too.
  await deskPage.locator("details.add-more", { hasText: "أعلن تأخير" }).locator("summary").click();
  await deskPage.selectOption('[name="delay"]', "30");
  await deskPage.fill('[name="notice"]', "الدكتور في عملية E2E");
  await deskPage.locator('form:has([name="delay"]) button').click();
  await until(async () => /متأخر 30/.test(await patientPage.innerText(".queue-card")), "delay shown live");
  assert.match(await patientPage.innerText(".queue-card"), /الدكتور في عملية E2E/);

  // Cash at reception, typed with Arabic digits.
  await deskPage.goto(sessionUrl);
  const first = deskPage.locator(".queue-row", { hasText: "طفل E2E" });
  await first.locator('[name="amount"]').fill("١٢٠٠٠");
  await first.locator(".pay-form button").click();
  await until(async () => /دفع 12,000 ج\.س/.test(await deskPage.locator(".queue-row", { hasText: "طفل E2E" }).innerText()), "cash recorded");

  // Calling next again: number 2 is "your turn".
  await deskPage.click("button.call-next");
  await until(async () => /دورك هسي/.test(await patientPage.innerText(".queue-card")), "your turn shown live");
  await deskPage.context().close();
});

test("a patient can cancel a booking, which frees the number", async () => {
  const page = pages.patient;
  await page.goto(pages.childBooking);
  // Number 1 was seen: the page says so (not "your turn passed"), and it
  // can no longer be cancelled.
  assert.match(await page.innerText(".queue-card"), /اتكشفت/);
  assert.doesNotMatch(await page.innerText(".queue-card"), /دورك فات/);
  assert.equal(await page.locator(".confirm-delete").count(), 0);

  await page.goto(`${app.base}/book/${doctorId}`);
  const [{ n: before }] = await runSql("select count(*)::int n from public.bookings b join public.sessions s on s.id = b.session_id join public.doctors d on d.id = s.doctor_id where d.name_en = 'E2E Dr Queue' and b.status <> 'cancelled'");
  // Book for the child on another day, then cancel it.
  const slots = page.locator(".slot:has(input[name='session']:not([disabled]))");
  await slots.nth(1).click();
  await page.locator(".slot", { hasText: "طفل E2E" }).click();
  await page.click("form button.button-solid");
  await page.waitForURL(/ok=booked/);
  await page.click(".confirm-delete > summary");
  await page.click(".confirm-delete button");
  await page.waitForURL(/ok=cancelled/);
  assert.match(await page.innerText(".alert-ok"), /اتلغى/);
  const [{ n: after }] = await runSql("select count(*)::int n from public.bookings b join public.sessions s on s.id = b.session_id join public.doctors d on d.id = s.doctor_id where d.name_en = 'E2E Dr Queue' and b.status <> 'cancelled'");
  assert.equal(after, before);
  await page.context().close();
});
