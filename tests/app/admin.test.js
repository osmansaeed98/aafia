// Walks through the admin area in a phone-sized browser against the
// real database, with temporary accounts and "E2E" entries that are
// deleted at the end.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
import { runSql } from "../../scripts/supabase-api.js";
import { cleanUp, createTestUser, phone, publicClient, sessionCookies, startApp } from "./helpers.js";

let app;
let browser;
let admin;
let outsider;

before(async () => {
  await cleanUp();
  app = await startApp(3125);
  browser = await chromium.launch();
  admin = await createTestUser("e2e-admin", { admin: true });
  outsider = await createTestUser("e2e-outsider");
});

after(async () => {
  await browser?.close();
  app?.stop();
  await cleanUp();
});

async function pageAs(user) {
  const context = await browser.newContext(phone);
  if (user) await context.addCookies(await sessionCookies(user, app.base));
  return context.newPage();
}

// Waits (up to 10s) until check() returns true.
async function until(check, message) {
  for (let i = 0; i < 40; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.fail(message);
}

const visibleToPublic = async (table, nameEn) =>
  (await publicClient().from(table).select("id").eq("name_en", nameEn)).data.length;

test("people who aren't signed in are sent to the login page", async () => {
  const page = await pageAs(null);
  await page.goto(app.base + "/admin/places");
  assert.equal(new URL(page.url()).pathname, "/admin/login");
  assert.equal(await page.locator('input[name="email"]').count(), 1);
  await page.context().close();
});

test("signed-in people who aren't on the team see no admin pages", async () => {
  const page = await pageAs(outsider);
  await page.goto(app.base + "/admin");
  assert.match(await page.innerText("h1"), /ما عندك صلاحية/);
  assert.equal(await page.locator(".admin-nav").count(), 0);
  await page.context().close();
});

test("an admin adds a place, a doctor and hours, and shows the place", async () => {
  const page = await pageAs(admin);
  await page.goto(app.base + "/admin/places/new");
  await page.selectOption('select[name="kind"]', "clinic");
  await page.fill('[name="name_ar"]', "عيادة اختبار E2E");
  await page.fill('[name="name_en"]', "E2E Test Clinic");
  await page.fill('[name="area_ar"]', "الخرطوم 2");
  await page.fill('[name="area_en"]', "Khartoum 2");
  await page.fill('[name="phone"]', "٠٩١٢ ٣٤٥ ٦٧٨"); // Arabic-keyboard digits
  await page.fill('[name="latitude"]', "15.5880");
  await page.fill('[name="longitude"]', "32.5340");
  await page.click('form:has([name="kind"]) button');
  await page.waitForURL(/\/admin\/places\/\d+\?ok=saved/);
  assert.equal(await page.locator(".alert-ok").count(), 1);

  const [saved] = await runSql("select * from public.places where name_en = 'E2E Test Clinic'");
  assert.equal(saved.phone, "0912 345 678", "digits are stored as Western digits");
  assert.equal(saved.is_active, false, "new places start hidden");
  assert.equal(await visibleToPublic("places", "E2E Test Clinic"), 0, "hidden place is not public");

  // Show it to the public.
  await page.check('[name="is_active"]');
  await page.click('form:has([name="kind"]) button');
  await until(async () => (await visibleToPublic("places", "E2E Test Clinic")) === 1, "shown place is public");

  // Add a doctor with a fee typed in Arabic digits.
  await page.click(".add-more > summary");
  const doctorForm = page.locator('form:has([name="specialty_id"])');
  await doctorForm.locator('[name="name_ar"]').fill("د. اختبار E2E");
  await doctorForm.locator('[name="name_en"]').fill("E2E Dr Test");
  await doctorForm.locator('select[name="specialty_id"]').selectOption({ index: 1 });
  await doctorForm.locator('[name="fee_sdg"]').fill("١٥٠٠٠");
  await doctorForm.locator("button").click();
  const doctorRow = page.locator(".row-link", { hasText: "د. اختبار E2E" });
  await doctorRow.waitFor();
  assert.match(await doctorRow.innerText(), /15,000 ج\.س/);
  assert.doesNotMatch(await page.innerText("main"), /[٠-٩]/, "no Arabic-Indic digits on the page");

  // Evening hours that run past midnight.
  const hoursForm = page.locator('form:has([name="weekday"])');
  await hoursForm.locator('[name="opens"]').fill("17:00");
  await hoursForm.locator('[name="closes"]').fill("02:00");
  await hoursForm.locator("button").click();
  await page.locator(".rows .row", { hasText: "السبت" }).waitFor();
  const hoursText = await page.locator("section.card", { hasText: "مواعيد المكان" }).innerText();
  assert.match(hoursText, /السبت/);
  assert.match(hoursText, /5:00/);
  assert.match(hoursText, /لليوم الجاي/);

  // Delete the place (asks for confirmation first).
  await page.click(".confirm-delete > summary");
  await page.click(".confirm-delete button");
  await page.waitForURL(/\/admin\/places\?ok=deleted/);
  const left = await runSql("select count(*)::int as n from public.places where name_en = 'E2E Test Clinic'");
  assert.equal(left[0].n, 0);
  await page.context().close();
});

test("an emergency department added by an admin appears on the public emergency page", async () => {
  const page = await pageAs(admin);
  await page.goto(app.base + "/admin/emergency");
  await page.click(".add-more > summary");
  const form = page.locator(".add-more form");
  await form.locator('[name="name_ar"]').fill("طوارئ اختبار E2E");
  await form.locator('[name="name_en"]').fill("E2E Test ED");
  await form.locator('[name="area_ar"]').fill("أم درمان");
  await form.locator('[name="area_en"]').fill("Omdurman");
  await form.locator('[name="phone"]').fill("0183 000 000");
  await form.locator("button").click();
  await page.waitForURL(/\?ok=saved/);

  const visitor = await pageAs(null);
  await visitor.goto(app.base + "/emergency");
  const entry = visitor.locator(".dept", { hasText: "طوارئ اختبار E2E" });
  assert.equal(await entry.count(), 1);
  assert.equal(await entry.locator('a[href="tel:0183000000"]').count(), 1);
  assert.equal(await visitor.locator('a[href="tel:999"]').count(), 1);

  // Delete it again from the admin page.
  const item = page.locator(".rows > li", { hasText: "طوارئ اختبار E2E" });
  await item.locator("summary.row").click();
  await item.locator(".confirm-delete > summary").click();
  await item.locator(".confirm-delete button").click();
  await page.waitForURL(/\?ok=deleted/);
  await visitor.reload();
  assert.equal(await visitor.locator(".dept", { hasText: "E2E" }).count(), 0);
  await visitor.context().close();
  await page.context().close();
});

test("the team page lists members and explains unknown emails", async () => {
  const page = await pageAs(admin);
  await page.goto(app.base + "/admin/team");
  assert.match(await page.innerText("main"), new RegExp(admin.email.replace(".", "\\.")));
  await page.fill('form [name="email"]', "nobody@aafia-test.invalid");
  await page.click('form:has([name="role"]) button');
  await page.waitForURL(/error=notFound/);
  assert.match(await page.innerText(".alert-error"), /ما سجل دخول لسه/);

  // Reception staff must be linked to a place.
  await page.fill('form [name="email"]', outsider.email);
  await page.selectOption('[name="role"]', "reception");
  await page.click('form:has([name="role"]) button');
  await page.waitForURL(/error=invalid/);
  await page.context().close();
});

test("a broken or expired sign-in link explains what to do", async () => {
  const page = await pageAs(null);
  await page.goto(app.base + "/admin/auth/callback?code=not-a-real-code");
  assert.equal(new URL(page.url()).pathname, "/admin/login");
  assert.match(await page.innerText(".alert-error"), /رابط جديد/);
  await page.goto(app.base + "/admin/auth/callback");
  assert.match(await page.innerText(".alert-error"), /رابط جديد/);
  assert.match(await page.innerText("form button"), /رسل رابط الدخول/);
  await page.context().close();
});

test("the login page names the reason when a link can't be sent", async () => {
  const page = await pageAs(null);
  await page.goto(app.base + "/admin/login?email=a%40b.com&error=rate");
  assert.match(await page.innerText(".alert-error"), /استنى ساعة/);
  await page.goto(app.base + "/admin/login?email=a%40b.com&error=notAuthorized");
  assert.match(await page.innerText(".alert-error"), /أعضاء حساب Supabase/);
  await page.context().close();
});
