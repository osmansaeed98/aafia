import { createSupabaseServer } from "@/lib/supabase/server";

// Who is signed in (if anyone), their name and family: for pages that
// anyone can open but only signed-in patients can act on.
export async function patientContext() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null, family: [] };
  const [{ data: profile }, { data: family }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle(),
    supabase.from("family_members").select("id, full_name").order("created_at"),
  ]);
  return { supabase, user, profile, family: family ?? [] };
}

// The form's "who" field -> family member id, or null for "me".
export function familyIdFrom(form) {
  const who = String(form.get("who") ?? "me");
  if (who === "me") return null;
  const id = Number(who);
  return Number.isInteger(id) && id > 0 ? id : NaN;
}
