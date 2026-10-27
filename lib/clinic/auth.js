import { khartoumDate } from "@/lib/datetime";
import { requirePatient } from "@/lib/patient/auth";

// The signed-in team member (reception or admin), or null if this
// account isn't on the team. Reception staff sign in with their phone.
export async function getStaff(next = "/clinic") {
  const { supabase, user } = await requirePatient(next);
  const { data: team } = await supabase.from("team_members").select("role, place_id").eq("user_id", user.id).maybeSingle();
  return { supabase, user, team };
}

export function canManage(team, placeId) {
  return Boolean(team) && (team.role === "admin" || team.place_id === placeId);
}

// Today's date in Khartoum, "2026-10-28".
export function khartoumToday() {
  return khartoumDate(0);
}
