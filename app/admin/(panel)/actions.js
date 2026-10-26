"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import {
  InvalidInput,
  checkbox,
  coordinates,
  number,
  phone,
  returnPath,
  text,
  time,
  withParam,
} from "@/lib/admin/form";

const PLACE_KINDS = ["clinic", "hospital", "lab", "pharmacy"];

// Runs one admin change, then goes back with a "saved" or error note.
// The database's access rules check again that the person is an admin.
async function adminChange(form, fallback, change) {
  const { supabase } = await requireAdmin();
  const back = returnPath(form, fallback);
  let next;
  try {
    next = (await change(supabase, back)) ?? withParam(back, "ok", "saved");
  } catch (error) {
    if (error instanceof InvalidInput) next = withParam(back, "error", "invalid");
    else if (error?.code === "23503") next = withParam(back, "error", "inUse");
    else if (error?.code === "23514") next = withParam(back, "error", "invalid");
    else next = withParam(back, "error", "generic");
  }
  redirect(next);
}

function check({ error }) {
  if (error) throw error;
}

// Places ---------------------------------------------------------------

export async function savePlace(form) {
  await adminChange(form, "/admin/places", async (supabase) => {
    const kind = text(form, "kind");
    if (!PLACE_KINDS.includes(kind)) throw new InvalidInput("kind");
    const row = {
      kind,
      name_ar: text(form, "name_ar"),
      name_en: text(form, "name_en"),
      area_ar: text(form, "area_ar"),
      area_en: text(form, "area_en"),
      address_ar: text(form, "address_ar", { required: false }),
      address_en: text(form, "address_en", { required: false }),
      phone: phone(form, "phone"),
      ...coordinates(form),
      home_visits: checkbox(form, "home_visits"),
      open_24h: checkbox(form, "open_24h"),
      is_active: checkbox(form, "is_active"),
    };
    const id = number(form, "id", { integer: true });
    if (id) {
      check(await supabase.from("places").update(row).eq("id", id));
      return `/admin/places/${id}?ok=saved`;
    }
    const { data, error } = await supabase.from("places").insert(row).select("id").single();
    check({ error });
    return `/admin/places/${data.id}?ok=saved`;
  });
}

export async function deletePlace(form) {
  await adminChange(form, "/admin/places", async (supabase) => {
    const id = number(form, "id", { required: true, integer: true });
    check(await supabase.from("places").delete().eq("id", id));
    return "/admin/places?ok=deleted";
  });
}

// Doctors --------------------------------------------------------------

export async function saveDoctor(form) {
  await adminChange(form, "/admin/places", async (supabase) => {
    const row = {
      place_id: number(form, "place_id", { required: true, integer: true }),
      specialty_id: number(form, "specialty_id", { required: true, integer: true }),
      name_ar: text(form, "name_ar"),
      name_en: text(form, "name_en"),
      fee_sdg: number(form, "fee_sdg", { integer: true, min: 0 }),
      is_active: checkbox(form, "is_active"),
    };
    const id = number(form, "id", { integer: true });
    if (id) {
      check(await supabase.from("doctors").update(row).eq("id", id));
      return `/admin/doctors/${id}?ok=saved`;
    }
    check(await supabase.from("doctors").insert(row));
    return `/admin/places/${row.place_id}?ok=saved`;
  });
}

export async function deleteDoctor(form) {
  await adminChange(form, "/admin/places", async (supabase) => {
    const id = number(form, "id", { required: true, integer: true });
    const placeId = number(form, "place_id", { required: true, integer: true });
    check(await supabase.from("doctors").delete().eq("id", id));
    return `/admin/places/${placeId}?ok=deleted`;
  });
}

// Hours ----------------------------------------------------------------

export async function addHours(form) {
  await adminChange(form, "/admin/places", async (supabase) => {
    const owner = text(form, "owner");
    const ownerId = number(form, "owner_id", { required: true, integer: true });
    if (owner !== "place" && owner !== "doctor") throw new InvalidInput("owner");
    const opens = time(form, "opens");
    const closes = time(form, "closes");
    if (opens === closes) throw new InvalidInput("closes");
    check(
      await supabase.from("opening_hours").insert({
        [owner === "place" ? "place_id" : "doctor_id"]: ownerId,
        weekday: number(form, "weekday", { required: true, integer: true, min: 0, max: 6 }),
        opens,
        closes,
      }),
    );
  });
}

export async function deleteHours(form) {
  await adminChange(form, "/admin/places", async (supabase) => {
    const id = number(form, "id", { required: true, integer: true });
    check(await supabase.from("opening_hours").delete().eq("id", id));
    return withParam(returnPath(form, "/admin/places"), "ok", "deleted");
  });
}

// Specialties ----------------------------------------------------------

export async function saveSpecialty(form) {
  await adminChange(form, "/admin/specialties", async (supabase) => {
    const row = { name_ar: text(form, "name_ar"), name_en: text(form, "name_en") };
    const id = number(form, "id", { integer: true });
    check(
      id
        ? await supabase.from("specialties").update(row).eq("id", id)
        : await supabase.from("specialties").insert(row),
    );
  });
}

export async function deleteSpecialty(form) {
  await adminChange(form, "/admin/specialties", async (supabase) => {
    const id = number(form, "id", { required: true, integer: true });
    check(await supabase.from("specialties").delete().eq("id", id));
    return "/admin/specialties?ok=deleted";
  });
}

// Emergency departments ------------------------------------------------

export async function saveEmergency(form) {
  await adminChange(form, "/admin/emergency", async (supabase) => {
    const row = {
      name_ar: text(form, "name_ar"),
      name_en: text(form, "name_en"),
      area_ar: text(form, "area_ar"),
      area_en: text(form, "area_en"),
      phone: phone(form, "phone", { required: true }),
      ...coordinates(form),
      open_24h: checkbox(form, "open_24h"),
      is_active: checkbox(form, "is_active"),
      sort_order: number(form, "sort_order", { integer: true }) ?? 0,
    };
    const id = number(form, "id", { integer: true });
    check(
      id
        ? await supabase.from("emergency_departments").update(row).eq("id", id)
        : await supabase.from("emergency_departments").insert(row),
    );
  });
}

export async function deleteEmergency(form) {
  await adminChange(form, "/admin/emergency", async (supabase) => {
    const id = number(form, "id", { required: true, integer: true });
    check(await supabase.from("emergency_departments").delete().eq("id", id));
    return "/admin/emergency?ok=deleted";
  });
}

// Team -----------------------------------------------------------------

export async function addTeamMember(form) {
  await adminChange(form, "/admin/team", async (supabase) => {
    const role = text(form, "role");
    if (role !== "admin" && role !== "reception") throw new InvalidInput("role");
    const placeId = number(form, "place_id", { integer: true });
    if (role === "reception" && !placeId) throw new InvalidInput("place_id");
    const { data, error } = await supabase.rpc("add_team_member", {
      member_email: text(form, "email"),
      member_role: role,
      member_place_id: placeId,
    });
    check({ error });
    return data === "not_found" ? "/admin/team?error=notFound" : `/admin/team?ok=${data}`;
  });
}

export async function removeTeamMember(form) {
  await adminChange(form, "/admin/team", async (supabase) => {
    check(await supabase.rpc("remove_team_member", { member_user_id: text(form, "user_id") }));
    return "/admin/team?ok=deleted";
  });
}
