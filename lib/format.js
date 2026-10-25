// Numbers, times and dates always use Western digits (0-9), in both
// languages. "-u-nu-latn" forces Latin digits inside Arabic formatting.
function locale(lang) {
  return lang === "en" ? "en-GB-u-nu-latn" : "ar-SD-u-nu-latn";
}

export function formatNumber(value, lang = "ar") {
  return new Intl.NumberFormat(locale(lang)).format(value);
}

export function formatTime(date, lang = "ar") {
  return new Intl.DateTimeFormat(locale(lang), {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Africa/Khartoum",
  }).format(date);
}

export function formatDate(date, lang = "ar") {
  return new Intl.DateTimeFormat(locale(lang), {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Africa/Khartoum",
  }).format(date);
}

// "0912 345 678" -> "tel:0912345678"
export function telHref(phone) {
  return `tel:${String(phone).replace(/[^\d+]/g, "")}`;
}

// Staff may type on an Arabic keyboard: "٠٩١٢" -> "0912".
export function normalizeDigits(text) {
  return String(text)
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

// Opening hours are stored as "17:30:00" (Khartoum time) -> "5:30 م".
export function formatClock(time, lang = "ar") {
  const [h, m] = String(time).split(":").map(Number);
  return new Intl.DateTimeFormat(locale(lang), {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  }).format(Date.UTC(2000, 0, 1, h, m));
}

export function formatMoney(amount, lang = "ar") {
  return `${formatNumber(amount, lang)} ${lang === "en" ? "SDG" : "ج.س"}`;
}
