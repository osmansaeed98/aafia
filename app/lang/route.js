import { NextResponse } from "next/server";
import { LANG_COOKIE, normalizeLang } from "@/lib/i18n";
import { isSafePath } from "@/lib/safe-path";

// /lang?to=en&next=/emergency : remember the language, then go back.
// A plain link (no JavaScript needed), so it works on any phone.
export function GET(request) {
  const url = new URL(request.url);
  const lang = normalizeLang(url.searchParams.get("to"));
  const next = url.searchParams.get("next") ?? "/";
  // Only same-site paths, so the link can't send people elsewhere.
  const safeNext = isSafePath(next) ? next : "/";

  const response = NextResponse.redirect(new URL(safeNext, url.origin));
  response.cookies.set(LANG_COOKIE, lang, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return response;
}
