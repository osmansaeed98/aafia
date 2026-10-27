import { redirect } from "next/navigation";
import { isSafePath } from "@/lib/safe-path";
import { createSupabaseServer } from "@/lib/supabase/server";

// The signed-in patient, or a redirect to the login page.
export async function requirePatient(next = "/account") {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return { supabase, user };
}

export function safeNext(value, fallback = "/account") {
  return isSafePath(value) ? value : fallback;
}
