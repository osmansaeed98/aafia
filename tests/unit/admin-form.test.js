import assert from "node:assert/strict";
import { test } from "node:test";
import { InvalidInput, coordinates, number, phone, returnPath, time } from "../../lib/admin/form.js";
import { formatClock, formatMoney, normalizeDigits } from "../../lib/format.js";

const form = (entries) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};

test("Arabic-keyboard digits become Western digits", () => {
  assert.equal(normalizeDigits("٠٩١٢ ٣٤٥ ٦٧٨"), "0912 345 678");
  assert.equal(normalizeDigits("۱۵۰۰۰"), "15000");
  assert.equal(number(form({ fee: "١٥٬٠٠٠".replace("٬", ",") }), "fee", { integer: true }), 15000);
  assert.equal(phone(form({ p: "+٢٤٩ ٩١٢-٣٤٥-٦٧٨" }), "p"), "+249 912 345 678");
  assert.equal(time(form({ t: "١٧:٣٠" }), "t"), "17:30");
});

test("bad numbers, phones and times are refused", () => {
  assert.throws(() => number(form({ fee: "-5" }), "fee", { min: 0 }), InvalidInput);
  assert.throws(() => number(form({ fee: "12.5" }), "fee", { integer: true }), InvalidInput);
  assert.throws(() => phone(form({ p: "call me" }), "p"), InvalidInput);
  assert.throws(() => time(form({ t: "25:00" }), "t"), InvalidInput);
  assert.throws(() => coordinates(form({ latitude: "15.5", longitude: "" })), InvalidInput);
  assert.throws(() => coordinates(form({ latitude: "95", longitude: "32" })), InvalidInput);
});

test("after saving, only admin pages are allowed as the next page", () => {
  assert.equal(returnPath(form({ back: "/admin/places/3" })), "/admin/places/3");
  assert.equal(returnPath(form({ back: "https://evil.example" })), "/admin");
  assert.equal(returnPath(form({ back: "//evil.example" })), "/admin");
});

test("clock times and money show Western digits", () => {
  assert.equal(formatClock("17:30:00", "en"), "5:30 pm");
  assert.match(formatClock("17:30:00", "ar"), /^5:30 م$/);
  assert.equal(formatMoney(15000, "ar"), "15,000 ج.س");
  assert.equal(formatMoney(15000, "en"), "15,000 SDG");
});
