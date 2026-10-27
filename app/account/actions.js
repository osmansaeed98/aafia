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

// Deletes the patient's account for good, in three steps that can be
// retried: (1) the database cancels open bookings and requests and clears
// health details; (2) the files they uploaded, and those clinics added to
// their medical file, are deleted; (3) the database removes the records,
// the phone number from clinics' history, and the account.
export async function deleteMyAccount() {
  const { supabase, user } = await requirePatient();
  const { error } = await supabase.rpc("prepare_account_deletion");
  if (error) redirect(`/account?error=${error.message === "team" ? "team" : "generic"}`);
  const { data: records } = await supabase.from("medical_records").select("file_path").eq("owner_id", user.id);
  const results = await Promise.all(
    ["prescriptions", "medical-files"].map(async (bucket) => {
      const { data, error: listError } = await supabase.storage.from(bucket).list(user.id, { limit: 1000 });
      if (listError) return false;
      const paths = (data ?? []).map((f) => `${user.id}/${f.name}`);
      if (bucket === "medical-files") paths.push(...(records ?? []).map((r) => r.file_path));
      const unique = [...new Set(paths)];
      if (!unique.length) return true;
      const { error: removeError } = await supabase.storage.from(bucket).remove(unique);
      return !removeError;
    }),
  );
  if (results.includes(false)) redirect("/account?error=deleteUnfinished");
  const { error: deleteError } = await supabase.rpc("delete_my_account");
  if (deleteError) redirect("/account?error=deleteUnfinished");
  await supabase.auth.signOut({ scope: "local" });
  redirect("/?deleted=1");
}
