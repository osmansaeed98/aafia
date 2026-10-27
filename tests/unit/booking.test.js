import assert from "node:assert/strict";
import { test } from "node:test";
import { bookingErrorKey, fill, formatDay, queueState } from "../../lib/booking.js";
import { bookingMessagesEnabled, sendBookingConfirmed, sendRequestUpdate, sendTurnSoon } from "../../lib/booking-messages.js";

const session = (over = {}) => ({ status: "open", now_serving: 0, delay_minutes: 0, ...over });

test("the queue page works out where the patient stands", () => {
  assert.deepEqual(queueState({ number: 5, bookingStatus: "booked", session: session() }), {
    kind: "notStarted", ahead: 4, wait: 60, delay: 0,
  });
  assert.deepEqual(queueState({ number: 12, bookingStatus: "booked", session: session({ now_serving: 7 }), minutesPerPatient: 10 }), {
    kind: "waiting", ahead: 5, wait: 50, delay: 0,
  });
  const late = queueState({ number: 9, bookingStatus: "booked", session: session({ now_serving: 7, status: "delayed", delay_minutes: 30 }) });
  assert.equal(late.wait, 2 * 15 + 30);
  assert.equal(queueState({ number: 7, bookingStatus: "arrived", session: session({ now_serving: 7 }) }).kind, "yourTurn");
  assert.equal(queueState({ number: 3, bookingStatus: "booked", session: session({ now_serving: 7 }) }).kind, "passed");
  assert.equal(queueState({ number: 3, bookingStatus: "seen", session: session({ now_serving: 7 }) }).kind, "seen");
  assert.equal(queueState({ number: 3, bookingStatus: "booked", session: session({ status: "cancelled" }) }).kind, "cancelled");
  assert.equal(queueState({ number: 3, bookingStatus: "cancelled", session: session() }).kind, "bookingCancelled");
});

test("booking errors become plain-word keys; dates and counts read naturally", () => {
  assert.equal(bookingErrorKey({ message: "full" }), "full");
  assert.equal(bookingErrorKey({ message: "something odd" }), "generic");
  assert.equal(fill("فاضل {n} نمرة", { n: 18 }), "فاضل 18 نمرة");
  assert.equal(formatDay("2026-10-31", "en"), "Saturday 31 October");
  assert.match(formatDay("2026-10-31", "ar"), /^السبت،? 31 أكتوبر$/);
  assert.doesNotMatch(formatDay("2026-10-31", "ar"), /[٠-٩]/);
});

test("booking WhatsApp messages stay off unless switched on", async () => {
  assert.equal(bookingMessagesEnabled({}), false);
  let calls = 0;
  const fetchImpl = async () => { calls++; return new Response("{}", { status: 200 }); };
  const env = { WHATSAPP_TOKEN: "t", WHATSAPP_PHONE_NUMBER_ID: "1" };
  assert.deepEqual(await sendBookingConfirmed({ phone: "249912345678", name: "a", doctor: "b", day: "c", number: 1 }, { env, fetchImpl }), { skipped: true });
  assert.equal(calls, 0);

  const on = { ...env, BOOKING_MESSAGES_ENABLED: "true" };
  let body;
  await sendTurnSoon({ phone: "+249912345678", number: 12, doctor: "د. أحمد" }, { env: on, fetchImpl: async (url, init) => { calls++; body = JSON.parse(init.body); return new Response("{}", { status: 200 }); } });
  assert.equal(calls, 1);
  assert.equal(body.template.name, "aafia_turn_soon");
  assert.deepEqual(body.template.components[0].parameters.map((p) => p.text), ["12", "د. أحمد"]);

  // A failing message never throws (the booking must still go through).
  const failed = await sendTurnSoon({ phone: "249912345678", number: 1, doctor: "x" }, { env: on, fetchImpl: async () => new Response("{}", { status: 500 }) });
  assert.deepEqual(failed, { failed: true });
});

test("pharmacy and home-visit updates use the same off switch", async () => {
  let calls = 0;
  const fetchImpl = async (url, init) => { calls++; return new Response("{}", { status: 200 }); };
  const env = { WHATSAPP_TOKEN: "t", WHATSAPP_PHONE_NUMBER_ID: "1" };
  await sendRequestUpdate({ phone: "249912345678", place: "صيدلية", update: "متوفر" }, { env, fetchImpl });
  assert.equal(calls, 0, "off by default");
  await sendRequestUpdate({ phone: "249912345678", place: "صيدلية", update: "متوفر" }, { env: { ...env, BOOKING_MESSAGES_ENABLED: "true" }, fetchImpl });
  assert.equal(calls, 1);
});
