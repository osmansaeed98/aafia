"use server";

import { redirect } from "next/navigation";
import { recordFields, uploadMedicalFile } from "@/lib/medical-files";
import { familyIdFrom } from "@/lib/patient/context";
import { requirePatient } from "@/lib/patient/auth";

export async function addMyRecord(form) {
  const { supabase, user } = await requirePatient("/records");
  const familyId = familyIdFrom(form);
  const fields = recordFields(form);
  if (Number.isNaN(familyId) || fields.p_title.length < 2) redirect("/records?error=invalid");
  const path = await uploadMedicalFile(supabase, form, user.id);
  if (!path) redirect("/records?error=file");
  const { error } = await supabase.rpc("add_my_record", { p_family_member_id: familyId, p_file_path: path, ...fields });
  if (error) {
    await supabase.storage.from("medical-files").remove([path]);
    redirect("/records?error=generic");
  }
  redirect("/records?ok=added");
}

export async function deleteMyRecord(form) {
  const { supabase } = await requirePatient("/records");
  const { data: path, error } = await supabase.rpc("delete_record", { p_record_id: Number(form.get("id")) });
  if (error) redirect(`/records?error=${error.message === "sent" ? "sent" : "invalid"}`);
  await supabase.storage.from("medical-files").remove([path]);
  redirect("/records?ok=deleted");
}
