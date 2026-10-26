import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

// Where the emailed sign-in link lands: swaps the one-time code in the
// link for a signed-in session, then opens the admin area.
export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) {
    const supabase = await createSupabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/admin", url.origin));
  }
  // Expired, already used, or opened in a different browser.
  return NextResponse.redirect(new URL("/admin/login?error=link", url.origin));
}
