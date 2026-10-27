"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { normalizeDigits } from "@/lib/format";
import { safeNext } from "@/lib/patient/auth";
import { PHONE_COOKIE } from "@/lib/patient/login-cookie";
import { normalizeSudanPhone } from "@/lib/phone";
import { createSupabaseServer } from "@/lib/supabase/server";


// Supabase's reasons for refusing, in plain words on the page.
const SEND_ERRORS = {
  phone_provider_disabled: "notReady",
  sms_send_failed: "send",
  hook_timeout: "send",
  hook_timeout_after_retry: "send",
  unexpected_failure: "send",
  over_sms_send_rate_limit: "rate",
  over_request_rate_limit: "rate",
};

function loginUrl(params) {
  return `/login?${new URLSearchParams(params)}`;
}

export async function sendCode(form) {
  const store = await cookies();
  const next = safeNext(form.get("next"));
  const phone = form.get("resend")
    ? store.get(PHONE_COOKIE)?.value
    : normalizeSudanPhone(form.get("phone"));
  if (!phone) redirect(loginUrl({ next, error: form.get("resend") ? "expired" : "phone" }));

  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.signInWithOtp({ phone });
  if (error) {
    console.error("Login code not requested:", error.code, error.status, error.message);
    redirect(loginUrl({ next, error: SEND_ERRORS[error.code] ?? "send", reason: String(error.code ?? error.status ?? "unknown").slice(0, 60) }));
  }

  store.set(PHONE_COOKIE, phone, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 15 * 60,
  });
  redirect(loginUrl({ next, step: "code" }));
}

export async function verifyCode(form) {
  const store = await cookies();
  const next = safeNext(form.get("next"));
  const phone = store.get(PHONE_COOKIE)?.value;
  if (!phone) redirect(loginUrl({ next, error: "expired" }));

  const token = normalizeDigits(String(form.get("code") ?? "")).replace(/\D/g, "");
  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.verifyOtp({ phone, token, type: "sms" });
  if (error) redirect(loginUrl({ next, step: "code", error: "code" }));

  store.delete(PHONE_COOKIE);
  redirect(next);
}
