import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDateTime, khartoumDate, khartoumInputToIso } from "../../lib/datetime.js";

test("staff times are read as Khartoum time", () => {
  assert.equal(khartoumInputToIso("2026-10-30T18:00"), "2026-10-30T18:00:00+02:00");
  assert.equal(new Date(khartoumInputToIso("2026-10-30T18:00")).toISOString(), "2026-10-30T16:00:00.000Z");
  assert.equal(khartoumInputToIso("tomorrow 6pm"), null);
  assert.equal(khartoumInputToIso(""), null);
});

test("dates and times show in Khartoum time with Western digits", () => {
  assert.equal(formatDateTime("2026-10-30T16:00:00Z", "en"), "Friday 30 October · 6:00 pm");
  const ar = formatDateTime("2026-10-30T16:00:00Z", "ar");
  assert.match(ar, /30 أكتوبر · 6:00 م$/);
  assert.doesNotMatch(ar, /[٠-٩]/);
  assert.match(khartoumDate(), /^\d{4}-\d{2}-\d{2}$/);
});
