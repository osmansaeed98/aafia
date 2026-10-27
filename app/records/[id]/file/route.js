import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

// Opens a medical file through a link that works for 5 minutes. The
// database decides who may see the record: the patient, the place that
// added it, or the pharmacy a prescription was sent to.
export async function GET(request, { params }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return new NextResponse(null, { status: 404 });
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=/records/${id}/file`, request.url));
  const { data: record } = await supabase.from("medical_records").select("file_path").eq("id", id).maybeSingle();
  if (!record) return new NextResponse(null, { status: 404 });
  const { data } = await supabase.storage.from("medical-files").createSignedUrl(record.file_path, 300);
  if (!data?.signedUrl) return new NextResponse(null, { status: 404 });
  return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "no-store" } });
}
