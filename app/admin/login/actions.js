"use server";

import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { normalizeDigits } from "@/lib/format";

function cleanEmail(form) {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export async function sendCode(form) {
  const email = cleanEmail(form);
  if (!email) redirect("/admin/login?error=send");
  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  const params = new URLSearchParams({ email });
  if (error) params.set("error", "send");
  redirect(`/admin/login?${params}`);
}

export async function verifyCode(form) {
  const email = cleanEmail(form);
  const token = normalizeDigits(String(form.get("code") ?? "")).replace(/\s/g, "");
  if (!email) redirect("/admin/login");
  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) redirect(`/admin/login?${new URLSearchParams({ email, error: "code" })}`);
  redirect("/admin");
}

export async function signOut() {
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
