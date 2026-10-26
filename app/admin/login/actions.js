"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";

function cleanEmail(form) {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

// Supabase's reasons for not sending, shown to the person in plain words.
const SEND_ERRORS = {
  over_email_send_rate_limit: "rate",
  over_request_rate_limit: "rate",
  email_address_not_authorized: "notAuthorized",
};

// The address this site is running on, e.g. https://aafia.vercel.app
async function siteOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

// Emails a sign-in link. Opening it lands on /admin/auth/callback, which
// finishes the sign-in. (A typed code comes later, with our own email
// service: Supabase's built-in email can only send its standard link.)
export async function sendLink(form) {
  const email = cleanEmail(form);
  if (!email) redirect("/admin/login?error=send");
  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${await siteOrigin()}/admin/auth/callback`,
    },
  });
  const params = new URLSearchParams({ email });
  if (error) {
    // Shows up in Vercel's logs, to see exactly why Supabase refused.
    console.error("Sign-in link not sent:", error.code, error.status, error.message);
    params.set("error", SEND_ERRORS[error.code] ?? "send");
    // Technical reason, shown small under the message to help fix it.
    params.set("reason", String(error.code ?? error.name ?? error.status ?? "unknown").slice(0, 60));
  }
  redirect(`/admin/login?${params}`);
}

export async function signOut() {
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
