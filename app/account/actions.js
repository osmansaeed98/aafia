"use server";

import { redirect } from "next/navigation";
import { InvalidInput, number, text } from "@/lib/admin/form";
import { requirePatient } from "@/lib/patient/auth";
import { RELATIONS } from "@/lib/patient/relations";
import { createSupabaseServer } from "@/lib/supabase/server";

const thisYear = () => new Date().getFullYear();

function sex(form) {
  const value = form.get("sex");
  if (!value) return null;
  if (value !== "male" && value !== "female") throw new InvalidInput("sex");
  return value;
}

function name(form) {
  const value = text(form, "full_name");
  if (value.length < 2 || value.length > 100) throw new InvalidInput("full_name");
  return value;
}

// Runs one change for the signed-in patient, then returns to the
// account page with a note. The database only lets people touch their
// own rows, whatever is sent.
async function patientChange(change) {
  const { supabase, user } = await requirePatient();
  let note;
  try {
    await change(supabase, user);
    note = "ok=saved";
  } catch (error) {
    if (error instanceof InvalidInput) note = "error=invalid";
    else if (error?.code === "23514" && /too many/.test(error.message)) note = "error=tooMany";
    else if (error?.code === "23514") note = "error=invalid";
    else note = "error=generic";
  }
  redirect(`/account?${note}`);
}

function check({ error }) {
  if (error) throw error;
}

export async function saveProfile(form) {
  await patientChange(async (supabase, user) => {
    check(
      await supabase.from("profiles").upsert({
        user_id: user.id,
        full_name: name(form),
        birth_year: number(form, "birth_year", { integer: true, min: 1900, max: thisYear() }),
        sex: sex(form),
      }),
    );
  });
}

function familyRow(form) {
  const relation = text(form, "relation");
  if (!RELATIONS.includes(relation)) throw new InvalidInput("relation");
  return {
    full_name: name(form),
    relation,
    birth_year: number(form, "birth_year", { integer: true, min: 1900, max: thisYear() }),
    sex: sex(form),
  };
}

export async function addFamilyMember(form) {
  await patientChange(async (supabase, user) => {
    check(await supabase.from("family_members").insert({ ...familyRow(form), owner_id: user.id }));
  });
}

export async function updateFamilyMember(form) {
  await patientChange(async (supabase) => {
    const id = number(form, "id", { required: true, integer: true });
    const { data, error } = await supabase.from("family_members").update(familyRow(form)).eq("id", id).select("id");
    check({ error });
    if (!data?.length) throw new Error("not found");
  });
}

export async function deleteFamilyMember(form) {
  const { supabase } = await requirePatient();
  const id = Number(form.get("id"));
  const { data, error } =
    Number.isInteger(id) && id > 0
      ? await supabase.from("family_members").delete().eq("id", id).select("id")
      : { error: true };
  redirect(error || !data?.length ? "/account?error=generic" : "/account?ok=deleted");
}

export async function signOutPatient() {
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  redirect("/");
}
