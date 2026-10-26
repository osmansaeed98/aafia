"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";

function cleanEmail(form) {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

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
  if (error) params.set("error", "send");
  redirect(`/admin/login?${params}`);
}

export async function signOut() {
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
