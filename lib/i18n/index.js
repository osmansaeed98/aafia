import { cookies } from "next/headers";
import ar from "./ar.js";
import en from "./en.js";

export const LANG_COOKIE = "lang";
const dictionaries = { ar, en };

export function normalizeLang(value) {
  return value === "en" ? "en" : "ar";
}

// Arabic is the default; English only when the visitor chose it.
export async function getLang() {
  const store = await cookies();
  return normalizeLang(store.get(LANG_COOKIE)?.value);
}

export function getDictionary(lang) {
  return dictionaries[normalizeLang(lang)];
}

export function getDir(lang) {
  return normalizeLang(lang) === "ar" ? "rtl" : "ltr";
}
