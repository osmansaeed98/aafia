import { normalizeDigits } from "./format.js";

// Sudanese mobile numbers only (+249 then 9 digits starting 1 or 9).
// Limiting codes to Sudan also blocks fraud that sends codes to
// expensive foreign numbers to run up the bill.
const SUDAN_MOBILE = /^\+249[19]\d{8}$/;

// Accepts what people actually type: "0912 345 678", "912345678",
// "+249 912 345 678", "00249912345678", Arabic-keyboard digits.
// Returns "+249912345678", or null if it isn't a Sudanese mobile.
export function normalizeSudanPhone(input) {
  let digits = normalizeDigits(String(input ?? "")).replace(/[\s\-().]/g, "");
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  if (/^\+?2490\d{9}$/.test(digits)) digits = `+249${digits.slice(-9)}`; // "+249 0912…"
  if (/^249\d{9}$/.test(digits)) digits = `+${digits}`;
  if (/^0\d{9}$/.test(digits)) digits = `+249${digits.slice(1)}`;
  if (/^[19]\d{8}$/.test(digits)) digits = `+249${digits}`;
  return SUDAN_MOBILE.test(digits) ? digits : null;
}

export function isSudanMobile(phone) {
  return SUDAN_MOBILE.test(phone);
}

// "+249912345678" (or "249912345678") -> "0912 345 678"
export function formatSudanPhone(phone) {
  const e164 = normalizeSudanPhone(phone);
  if (!e164) return phone ?? "";
  const local = `0${e164.slice(4)}`;
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}
