"use server";

import { redirect } from "next/navigation";
import { RATING_PAGES } from "@/lib/ratings";
import { requirePatient } from "@/lib/patient/auth";

const KNOWN = ["already", "invalid"];

export async function rate(form) {
  const kind = String(form.get("kind"));
  const id = Number(form.get("id"));
  if (!RATING_PAGES[kind] || !Number.isInteger(id) || id <= 0) redirect("/account");
  const back = `${RATING_PAGES[kind]}${id}`;
  const { supabase } = await requirePatient(back);
  const { error } = await supabase.rpc("rate", {
    p_kind: kind,
    p_id: id,
    p_stars: Number(form.get("stars")),
    p_comment: String(form.get("comment") ?? "").trim().slice(0, 500) || null,
  });
  if (error) redirect(`${back}?rating=${KNOWN.includes(error.message) ? error.message : "generic"}`);
  redirect(`${back}?rating=thanks`);
}
