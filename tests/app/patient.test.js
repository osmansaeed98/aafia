// Patient login and account pages in a phone-sized browser. No real
// WhatsApp message is ever sent: tests stop before Supabase would send
// one, or sign in a temporary test account directly.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
import { cleanUp, createTestUser, phone, sessionCookies, startApp } from "./helpers.js";

let app;
let browser;
let patient;

before(async () => {
  await cleanUp();
  app = await startApp(3128);
  browser = await chromium.launch();
  patient = await createTestUser("e2e-patient");
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

async function until(check, message) {
  for (let i = 0; i < 40; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.fail(message);
}

test("the header offers sign-in, and the account page needs it", async () => {
  const page = await pageAs(null);
  await page.goto(app.base + "/");
  const link = page.locator('.header-links a[href="/login"]');
  assert.match(await link.innerText(), /دخول/);
  await page.goto(app.base + "/account");
  assert.equal(new URL(page.url()).pathname, "/login");
  assert.equal(new URL(page.url()).searchParams.get("next"), "/account");
  await page.context().close();
});

test("the login page explains a number that isn't a Sudanese mobile", async () => {
  const page = await pageAs(null);
  await page.goto(app.base + "/login");
  assert.equal(await page.getAttribute('[name="phone"]', "placeholder"), "0912 345 678");
  await page.fill('[name="phone"]', "+44 7700 900123");
  await page.click("form button");
  await page.waitForURL(/error=phone/);
  assert.match(await page.innerText(".alert-error"), /ما رقم موبايل سوداني/);
  await page.context().close();
});

test("the code step shows the number and rejects a wrong code", async () => {
  const context = await browser.newContext(phone);
  await context.addCookies([{ name: "aafia_login_phone", value: "+249912345678", url: app.base }]);
  const page = await context.newPage();
  await page.goto(app.base + "/login?step=code");
  assert.match(await page.innerText("main"), /0912 345 678/);
  await page.fill('[name="code"]', "٠٠٠٠٠٠");
  await page.click('form:has([name="code"]) button');
  await page.waitForURL(/error=code/);
  assert.match(await page.innerText(".alert-error"), /الكود غلط/);
  await context.close();
});

test("an expired login sends people back to enter their number", async () => {
  const page = await pageAs(null);
  await page.goto(app.base + "/login?step=code");
  assert.equal(await page.locator('[name="phone"]').count(), 1);
  await page.context().close();
});

test("a new patient gives their name, then manages their family", async () => {
  const page = await pageAs(patient);
  await page.goto(app.base + "/");
  assert.match(await page.locator('.header-links a[href="/account"]').innerText(), /حسابي/);

  await page.goto(app.base + "/account");
  assert.match(await page.innerText("h1"), /اسمك شنو/);
  await page.fill('[name="full_name"]', "مريم اختبار E2E");
  await page.fill('[name="birth_year"]', "١٩٩٠");
  await page.selectOption('[name="sex"]', "female");
  await page.click("form button");
  await page.locator("h1", { hasText: "أهلاً مريم اختبار E2E" }).waitFor();

  // Add a son.
  await page.click(".add-more > summary");
  const add = page.locator(".add-more form");
  await add.locator('[name="relation"]').selectOption("son");
  await add.locator('[name="full_name"]').fill("عمر اختبار E2E");
  await add.locator('[name="birth_year"]').fill("2018");
  await add.locator("button").click();
  const row = page.locator(".rows > li", { hasText: "عمر اختبار E2E" });
  await row.waitFor();
  assert.match(await row.innerText(), /ابن/);
  assert.match(await row.innerText(), /2018/);

  // Edit him.
  await row.locator("summary.row").click();
  await row.locator('form:has([name="relation"]) [name="full_name"]').fill("عمر محمد E2E");
  await row.locator('form:has([name="relation"]) button').click();
  await page.locator(".rows > li", { hasText: "عمر محمد E2E" }).waitFor();

  // A wrong year is refused with a clear message.
  await page.click(".add-more > summary");
  await add.locator('[name="relation"]').selectOption("mother");
  await add.locator('[name="full_name"]').fill("أم اختبار E2E");
  await add.locator('[name="birth_year"]').fill("1800");
  await add.locator("button").click();
  await page.locator(".alert-error").waitFor();
  assert.match(await page.innerText(".alert-error"), /ناقصة أو غلط/);

  // Remove him (asks for confirmation).
  const edited = page.locator(".rows > li", { hasText: "عمر محمد E2E" });
  await edited.locator("summary.row").click();
  await edited.locator(".confirm-delete > summary").click();
  await edited.locator(".confirm-delete button").click();
  await until(async () => (await page.locator(".rows > li", { hasText: "E2E" }).count()) === 0, "family member not removed");

  // No sideways scrolling on a phone.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert.ok(overflow <= 0, `account page is ${overflow}px too wide`);

  // Sign out goes home and shows "sign in" again.
  await page.click('form:has(button:text("خروج")) button');
  await page.waitForURL(app.base + "/");
  await page.locator('.header-links a[href="/login"]').waitFor();
  await page.context().close();
});
