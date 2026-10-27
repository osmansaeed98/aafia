// Times typed by staff are Khartoum time (UTC+2 all year, no summer time).
const KHARTOUM_OFFSET = "+02:00";

// "2026-10-30T18:00" (from a date-time field) -> "2026-10-30T18:00:00+02:00"
export function khartoumInputToIso(value) {
  const text = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) return null;
  const iso = `${text}:00${KHARTOUM_OFFSET}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

// "2026-10-30T16:00:00Z" -> "الخميس 30 أكتوبر · 6:00 م"
export function formatDateTime(value, lang = "ar") {
  if (!value) return "";
  const locale = lang === "en" ? "en-GB-u-nu-latn" : "ar-SD-u-nu-latn";
  const date = new Date(value);
  const day = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Khartoum" }).format(date);
  const time = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Africa/Khartoum" }).format(date);
  return `${day} · ${time}`;
}

// Today's date in Khartoum plus some days, as "2026-10-30".
export function khartoumDate(plusDays = 0) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Khartoum" }).format(new Date(Date.now() + plusDays * 86400000));
}
