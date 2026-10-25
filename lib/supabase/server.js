import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// For pages and actions of a signed-in team member: carries their
// session, so the database's access rules apply to them.
export async function createSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a page render; the proxy refreshes the session.
        }
      },
    },
  });
}

// For public pages: no session, sees only what anyone may see.
export function createSupabasePublic() {
  if (!url || !key) throw new Error("Supabase settings are missing");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
