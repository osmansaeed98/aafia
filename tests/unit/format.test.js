import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDate, formatNumber, formatTime, telHref } from "../../lib/format.js";
import ar from "../../lib/i18n/ar.js";
import en from "../../lib/i18n/en.js";

const easternDigits = /[٠-٩۰-۹]/;

test("numbers, times and dates use Western digits in Arabic", () => {
  const date = new Date("2026-03-07T18:05:00Z");
  assert.equal(formatNumber(1234, "ar"), "1,234");
  for (const text of [formatNumber(9876543, "ar"), formatTime(date, "ar"), formatDate(date, "ar")]) {
    assert.doesNotMatch(text, easternDigits, text);
    assert.match(text, /\d/, text);
  }
});

test("times are shown in Khartoum time", () => {
  assert.match(formatTime(new Date("2026-03-07T18:05:00Z"), "en"), /^20:05$/);
});

test("phone numbers become dial links", () => {
  assert.equal(telHref("0912 345 678"), "tel:0912345678");
  assert.equal(telHref("+249 912-345-678"), "tel:+249912345678");
});

test("Arabic and English wording have the same entries", () => {
  const keys = (obj, prefix = "") =>
    Object.entries(obj).flatMap(([k, v]) => (typeof v === "object" ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
  assert.deepEqual(keys(ar).sort(), keys(en).sort());
});

test("no Arabic-Indic digits in the Arabic wording", () => {
  assert.doesNotMatch(JSON.stringify(ar), easternDigits);
});
