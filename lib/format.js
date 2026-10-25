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
