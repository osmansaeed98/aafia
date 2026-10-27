// Labs, pharmacy requests (with a prescription photo) and home visits,
// in phone-sized browsers on the real database. "E2E" data and test
// accounts are removed afterwards; uploaded test photos too.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
import { literal, runSql } from "../../scripts/supabase-api.js";
import { assertFitsScreen, cleanUp, createTestUser, phone, removeOwnPhotos, sessionCookies, startApp } from "./helpers.js";

let app;
let browser;
let patient;
let pharmacist;
let nurse;
const ids = {};
const urls = {};

async function pageAs(user) {
  const context = await browser.newContext(phone);
  if (user) await context.addCookies(await sessionCookies(user, app.base));
  return context.newPage();
}

const noSideways = assertFitsScreen;

before(async () => {
  await cleanUp();
  app = await startApp(3132);
  browser = await chromium.launch();
  patient = await createTestUser("e2e-services");
  pharmacist = await createTestUser("e2e-pharmacist");
  nurse = await createTestUser("e2e-nurse");
  await runSql(`
    insert into public.places (kind, name_ar, name_en, area_ar, area_en, is_active, home_visits) values
      ('lab', 'معمل E2E', 'E2E Lab', 'أمدرمان', 'Omdurman', true, false),
      ('pharmacy', 'صيدلية E2E', 'E2E Pharmacy', 'بحري', 'Bahri', true, false),
      ('clinic', 'عيادة البيت E2E', 'E2E Home Clinic', 'الرياض', 'Riyadh', true, true);
    insert into public.opening_hours (place_id, weekday, opens, closes)
      select id, g, '00:00', '23:59' from public.places, generate_series(0, 6) g where name_en = 'E2E Lab';
    insert into public.lab_tests (place_id, name_ar, name_en, price_sdg, notes_ar)
      select id, 'صورة دم كاملة E2E', 'E2E CBC', 8000, 'ما محتاج صيام' from public.places where name_en = 'E2E Lab';
    insert into public.team_members (user_id, role, place_id) values
      (${literal(pharmacist.id)}, 'reception', (select id from public.places where name_en = 'E2E Pharmacy')),
      (${literal(nurse.id)}, 'reception', (select id from public.places where name_en = 'E2E Home Clinic'));
    insert into public.profiles (user_id, full_name) values (${literal(patient.id)}, 'مريض الخدمات E2E');
    insert into public.family_members (owner_id, full_name, relation) values (${literal(patient.id)}, 'أب E2E', 'father');
  `);
  const rows = await runSql("select name_en, id from public.places where name_en like 'E2E %'");
  for (const r of rows) ids[r.name_en] = r.id;
});

after(async () => {
  await browser?.close();
  app?.stop();
  // Requests first (sent photos are protected), then the photos, then the rest.
  if (patient) {
    await runSql(`delete from public.pharmacy_requests where requested_by = ${literal(patient.id)}`);
    await removeOwnPhotos(patient);
  }
  await cleanUp();
});

test("the home page leads to labs, pharmacies and home visits", async () => {
  const page = await pageAs(null);
  await page.goto(app.base + "/");
  for (const href of ["/labs", "/pharmacies", "/home-visits"]) {
    assert.equal(await page.locator(`a.action-small[href="${href}"]`).count(), 1, href);
  }
  await noSideways(page);
  await page.context().close();
});

test("a lab shows its prices and gives queue numbers", async () => {
  const page = await pageAs(patient);
  await page.goto(app.base + "/labs");
  await page.locator(".row-link", { hasText: "معمل E2E" }).click();
  await page.waitForURL(/\/book\/\d+$/);
  assert.match(await page.innerText("h1"), /معمل E2E/);
  const prices = await page.innerText(".price-list");
  assert.match(prices, /صورة دم كاملة E2E/);
  assert.match(prices, /8,000 ج\.س/);
  assert.match(prices, /ما محتاج صيام/);
  await page.click("form button.button-solid");
  await page.waitForURL(/\/bookings\/\d+\?ok=booked/);
  assert.equal((await page.locator(".queue-big").first().innerText()).trim(), "1");
  await noSideways(page);
  await page.context().close();
});

test("a patient sends a prescription photo; only that pharmacy sees and answers it", async () => {
  const page = await pageAs(patient);
  await page.goto(app.base + "/pharmacies");
  await page.locator(".row-link", { hasText: "صيدلية E2E" }).click();
  await page.waitForURL(/\/pharmacies\/\d+$/);
  await page.locator(".slot", { hasText: "أب E2E" }).click();
  await page.setInputFiles('input[name="photo"]', "tests/app/rx-sample.jpg");
  await page.fill('[name="items"]', "بندول 500 E2E");
  await page.click("form button.button-solid");
  await page.waitForURL(/\/requests\/medicines\/\d+\?ok=sent/);
  urls.medicines = page.url().split("?")[0];
  assert.match(await page.innerText(".status-banner"), /منتظر رد الصيدلية/);
  assert.match(await page.innerText("main"), /أب E2E/);
  // The photo is only a link for the patient (no automatic image download).
  assert.equal(await page.locator("main img").count(), 0);
  const [{ photo_path }] = await runSql("select photo_path from public.pharmacy_requests where items_text = 'بندول 500 E2E'");
  assert.match(photo_path, new RegExp(`^${patient.id}/`));
  await noSideways(page);

  // A different patient can't open it.
  const stranger = await pageAs(nurse);
  assert.equal((await stranger.goto(urls.medicines)).status(), 404);
  await stranger.context().close();

  // The pharmacy sees it on its dashboard, with the photo, and replies.
  const desk = await pageAs(pharmacist);
  await desk.goto(app.base + "/clinic");
  await desk.locator(".row-link", { hasText: "أب E2E" }).click();
  await desk.waitForURL(/\/clinic\/medicines\/\d+/);
  assert.match(await desk.innerText("main"), /بندول 500 E2E/);
  assert.equal(await desk.locator(".photo-link img").count(), 1);
  const imageLoaded = await desk.locator(".photo-link img").evaluate((img) => img.complete && img.naturalWidth > 0);
  assert.ok(imageLoaded, "the pharmacy can open the photo");
  await desk.locator(".slot", { hasText: "متوفر جزء" }).click();
  await desk.fill('[name="total"]', "٤٥٠٠");
  await desk.fill('[name="ready_at"]', "2030-01-01T18:30");
  await desk.fill('[name="note"]', "الشراب ما متوفر E2E");
  await desk.click("form.card button.button-solid");
  await desk.waitForURL(/ok=done/);
  await noSideways(desk);
  await desk.context().close();

  await page.reload();
  const text = await page.innerText("main");
  assert.match(text, /متوفر جزء منو/);
  assert.match(text, /4,500 ج\.س/);
  assert.match(text, /6:30 م/);
  assert.match(text, /الشراب ما متوفر E2E/);
  await page.context().close();
});

test("a patient requests a home visit; the clinic confirms it with a time and fee", async () => {
  const page = await pageAs(patient);
  await page.goto(app.base + "/home-visits");
  await page.locator(".row-link", { hasText: "عيادة البيت E2E" }).click();
  await page.waitForURL(/\/home-visits\/\d+$/);
  await page.fill('[name="reason"]', "كبير سن E2E، ما بقدر يمشي");
  await page.selectOption('[name="time"]', "evening");
  await page.fill('[name="area"]', "الرياض");
  await page.fill('[name="address"]', "شارع 15، بيت أبيض جنب الجامع");
  await page.click("form button.button-solid");
  await page.waitForURL(/\/requests\/visits\/\d+\?ok=sent/);
  urls.visit = page.url().split("?")[0];
  assert.match(await page.innerText(".status-banner"), /منتظر تأكيد العيادة/);
  await noSideways(page);

  const desk = await pageAs(nurse);
  await desk.goto(app.base + "/clinic");
  await desk.locator(".row-link", { hasText: "مريض الخدمات E2E" }).click();
  await desk.waitForURL(/\/clinic\/visits\/\d+/);
  assert.match(await desk.innerText("main"), /جنب الجامع/);
  await desk.fill('[name="visit_at"]', "2030-01-02T18:00");
  await desk.fill('[name="fee"]', "20000");
  await desk.click("form.card button.button-solid");
  await desk.waitForURL(/ok=done/);
  await desk.context().close();

  await page.reload();
  const text = await page.innerText("main");
  assert.match(text, /اتأكدت/);
  assert.match(text, /20,000 ج\.س/);
  assert.match(text, /6:00 م/);

  // It shows in "My account", and can be cancelled.
  await page.goto(app.base + "/account");
  assert.equal(await page.locator(`a[href="${new URL(urls.visit).pathname}"]`).count(), 1);
  assert.equal(await page.locator(`a[href="${new URL(urls.medicines).pathname}"]`).count(), 1);
  await page.goto(urls.visit);
  await page.click(".confirm-delete > summary");
  await page.click(".confirm-delete button");
  await page.waitForURL(/ok=cancelled/);
  assert.match(await page.innerText(".status-banner"), /اتلغت/);
  await page.context().close();
});
