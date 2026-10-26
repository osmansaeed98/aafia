// Runs the built app (npm run build first) in a phone-sized browser.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { after, before, test } from "node:test";
import { chromium } from "playwright";

const PORT = 3123;
const BASE = `http://localhost:${PORT}`;
const phone = { viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true };
let server;
let browser;

before(async () => {
  server = spawn("npx", ["next", "start", "-p", String(PORT)], { stdio: "ignore", detached: true });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  if (server) process.kill(-server.pid);
});

test("home page is Arabic, right to left, with Western digits only", async () => {
  const page = await browser.newPage(phone);
  await page.goto(BASE);
  assert.equal(await page.getAttribute("html", "lang"), "ar");
  assert.equal(await page.getAttribute("html", "dir"), "rtl");
  const text = await page.innerText("body");
  assert.match(text, /عافية/);
  assert.doesNotMatch(text, /[٠-٩۰-۹]/);
  await page.close();
});

test("every tap target is at least 48px tall", async () => {
  const page = await browser.newPage(phone);
  for (const path of ["/", "/emergency"]) {
    await page.goto(BASE + path);
    const small = await page.$$eval("a, button", (els) =>
      els.filter((el) => el.getBoundingClientRect().height < 48).map((el) => el.outerHTML),
    );
    assert.deepEqual(small, [], path);
  }
  await page.close();
});

test("emergency page has a 999 call button", async () => {
  const page = await browser.newPage(phone);
  await page.goto(BASE + "/emergency");
  const call = page.locator('a[href="tel:999"]');
  assert.equal(await call.count(), 1);
  assert.match(await call.innerText(), /999/);
  await page.close();
});

test("language switch moves to English, left to right, and back", async () => {
  const context = await browser.newContext(phone);
  const page = await context.newPage();
  await page.goto(BASE + "/emergency");
  await page.click(".lang-switch");
  await page.waitForURL(BASE + "/emergency");
  assert.equal(await page.getAttribute("html", "dir"), "ltr");
  assert.match(await page.innerText("h1"), /Emergency/);
  await page.click(".lang-switch");
  await page.waitForURL(BASE + "/emergency");
  assert.equal(await page.getAttribute("html", "dir"), "rtl");
  await context.close();
});

test("language switch never redirects to another site", async () => {
  const res = await fetch(`${BASE}/lang?to=en&next=//evil.example`, { redirect: "manual" });
  assert.equal(res.headers.get("location"), `${BASE}/`);
});

test("emergency page works offline after one visit", async () => {
  const context = await browser.newContext(phone);
  const page = await context.newPage();
  await page.goto(BASE);
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    // Wait until the emergency page is stored.
    for (let i = 0; i < 40 && !(await caches.match("/emergency")); i++) {
      await new Promise((r) => setTimeout(r, 250));
    }
    return reg.active?.state;
  });
  await context.setOffline(true);

  await page.goto(BASE + "/emergency");
  assert.equal(await page.locator('a[href="tel:999"]').count(), 1);
  // Styles still load offline: the 999 button stays red.
  const bg = await page.$eval(".call-999", (el) => getComputedStyle(el).backgroundColor);
  assert.equal(bg, "rgb(180, 35, 24)");

  // Any other page falls back to the emergency page when offline.
  await page.goto(BASE + "/some-page");
  assert.equal(await page.locator('a[href="tel:999"]').count(), 1);
  await context.close();
});
