// Shared queue logic for the patient's booking page and its tests.

const BOOKING_ERRORS = ["full", "limit", "duplicate", "closed", "no_profile", "invalid"];

// Supabase error from public.book() -> a key the page explains.
export function bookingErrorKey(error) {
  const message = String(error?.message ?? "");
  return BOOKING_ERRORS.includes(message) ? message : "generic";
}

// "{n} numbers left" -> "18 numbers left"
export function fill(template, values) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ""));
}

// Where the patient stands in the queue, from the live session row.
export function queueState({ number, bookingStatus, session, minutesPerPatient = 15 }) {
  if (bookingStatus === "cancelled") return { kind: "bookingCancelled" };
  if (session.status === "cancelled") return { kind: "cancelled" };
  if (session.status === "closed") return { kind: "closed" };
  if (bookingStatus === "seen") return { kind: "seen" };
  const serving = session.now_serving ?? 0;
  const delay = session.status === "delayed" ? session.delay_minutes ?? 0 : 0;
  if (serving === number) return { kind: "yourTurn", delay };
  if (serving > number) return { kind: "passed", delay };
  const ahead = serving === 0 ? number - 1 : number - serving;
  return {
    kind: serving === 0 ? "notStarted" : "waiting",
    ahead,
    wait: ahead * minutesPerPatient + delay,
    delay,
  };
}

// "2026-10-31" -> "السبت 31 أكتوبر" (date only, no time zone shifts).
export function formatDay(isoDate, lang = "ar") {
  const [y, m, d] = String(isoDate).split("-").map(Number);
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB-u-nu-latn" : "ar-SD-u-nu-latn", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(Date.UTC(y, m - 1, d));
}
