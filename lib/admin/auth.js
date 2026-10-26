import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";

// Signed-in user and whether they're an Aafia admin. Sends people who
// aren't signed in to the login page.
export async function getAdminSession() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const { data: isAdmin } = await supabase.rpc("is_admin");
  return { supabase, user, isAdmin: isAdmin === true };
}

// For actions: stops anyone who isn't an admin. The database's access
// rules block them too; this just fails early with a clear redirect.
export async function requireAdmin() {
  const session = await getAdminSession();
  if (!session.isAdmin) redirect("/admin");
  return session;
}
