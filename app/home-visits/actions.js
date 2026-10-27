"use server";

import { redirect } from "next/navigation";
import { familyIdFrom } from "@/lib/patient/context";
import { requirePatient } from "@/lib/patient/auth";

const TIMES = ["morning", "afternoon", "evening"];
const KNOWN = ["date", "limit", "invalid", "no_profile"];

function coordinate(form, name, max) {
  const value = form.get(name);
  if (value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n) <= max ? n : null;
}

export async function requestHomeVisit(form) {
  const placeId = Number(form.get("place_id"));
  const back = `/home-visits/${Number.isInteger(placeId) ? placeId : ""}`;
  const { supabase } = await requirePatient(back);
  const familyId = familyIdFrom(form);
  const time = String(form.get("time") ?? "");
  const date = String(form.get("date") ?? "");
  const reason = String(form.get("reason") ?? "").trim();
  const area = String(form.get("area") ?? "").trim();
  const address = String(form.get("address") ?? "").trim();
  let latitude = coordinate(form, "latitude", 90);
  let longitude = coordinate(form, "longitude", 180);
  if (latitude === null || longitude === null) latitude = longitude = null;
  if (
    Number.isNaN(familyId) || !TIMES.includes(time) || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    reason.length < 3 || reason.length > 300 || area.length < 2 || area.length > 100 ||
    address.length < 5 || address.length > 300
  ) {
    redirect(`${back}?error=invalid`);
  }

  const { data: id, error } = await supabase.rpc("request_home_visit", {
    p_place_id: placeId,
    p_family_member_id: familyId,
    p_reason: reason,
    p_date: date,
    p_time: time,
    p_area: area,
    p_address: address,
    p_latitude: latitude,
    p_longitude: longitude,
  });
  if (error) redirect(`${back}?error=${KNOWN.includes(error.message) ? error.message : "generic"}`);
  redirect(`/requests/visits/${id}?ok=sent`);
}

export async function cancelHomeVisit(form) {
  const id = Number(form.get("id"));
  const { supabase } = await requirePatient(`/requests/visits/${id}`);
  const { error } = await supabase.rpc("cancel_home_visit", { p_request_id: id });
  redirect(`/requests/visits/${id}?${error ? "error=invalid" : "ok=cancelled"}`);
}
