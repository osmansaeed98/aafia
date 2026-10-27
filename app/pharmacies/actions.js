"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { familyIdFrom } from "@/lib/patient/context";
import { requirePatient } from "@/lib/patient/auth";

const MAX_PHOTO = 1024 * 1024; // matches the storage bucket's limit
const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const KNOWN = ["empty", "limit", "invalid", "no_profile"];

// From a pharmacy's page (photo and/or list), or from the medical file
// (a prescription already there: "record_id").
export async function requestMedicines(form) {
  const placeId = Number(form.get("place_id"));
  const recordId = Number(form.get("record_id")) || null;
  const pharmacyPage = `/pharmacies/${Number.isInteger(placeId) ? placeId : ""}`;
  const { supabase, user } = await requirePatient(recordId ? "/records" : pharmacyPage);
  // Errors go back to where the patient came from.
  const back = recordId ? "/records" : pharmacyPage;
  const errorParam = (key) => (recordId ? `?from=pharmacy&error=${key}` : `?error=${key}`);
  const familyId = familyIdFrom(form);
  if (Number.isNaN(familyId)) redirect(`${back}${errorParam("invalid")}`);
  const items = String(form.get("items") ?? "").trim().slice(0, 1000);

  // Optional prescription photo, stored privately in the patient's folder.
  let photoPath = null;
  const photo = form.get("photo");
  if (photo && typeof photo === "object" && photo.size > 0) {
    const ext = TYPES[photo.type];
    if (!ext || photo.size > MAX_PHOTO) redirect(`${back}${errorParam("photo")}`);
    photoPath = `${user.id}/${randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("prescriptions").upload(photoPath, photo, { contentType: photo.type });
    if (error) redirect(`${back}${errorParam("photo")}`);
  }

  const { data: id, error } = await supabase.rpc("request_medicines", {
    p_place_id: placeId,
    p_family_member_id: familyId,
    p_items: items || null,
    p_photo_path: photoPath,
    p_record_id: recordId,
  });
  if (error) {
    if (photoPath) await supabase.storage.from("prescriptions").remove([photoPath]);
    redirect(`${back}${errorParam(KNOWN.includes(error.message) ? error.message : "generic")}`);
  }
  redirect(`/requests/medicines/${id}?ok=sent`);
}

export async function cancelMedicines(form) {
  const id = Number(form.get("id"));
  const { supabase } = await requirePatient(`/requests/medicines/${id}`);
  const { error } = await supabase.rpc("cancel_medicines", { p_request_id: id });
  redirect(`/requests/medicines/${id}?${error ? "error=invalid" : "ok=cancelled"}`);
}
