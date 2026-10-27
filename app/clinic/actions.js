"use server";

import { redirect } from "next/navigation";
import { sendRequestUpdate, sendTurnSoon, TURN_SOON_AHEAD } from "@/lib/booking-messages";
import { formatDateTime } from "@/lib/datetime";
import { formatMoney } from "@/lib/format";
import ar from "@/lib/i18n/ar";
import { getStaff } from "@/lib/clinic/auth";
import { khartoumInputToIso } from "@/lib/datetime";
import { normalizeDigits } from "@/lib/format";
import { normalizeSudanPhone } from "@/lib/phone";

const id = (form, name) => {
  const value = Number(form.get(name));
  return Number.isInteger(value) && value > 0 ? value : null;
};

function back(sessionId, note) {
  redirect(`/clinic/sessions/${sessionId}?${note}`);
}

export async function openSession(form) {
  const { supabase } = await getStaff();
  const { data, error } = await supabase.rpc("open_session", {
    p_doctor_id: id(form, "doctor_id"),
    p_date: String(form.get("date")),
    p_starts: String(form.get("starts")),
  });
  if (error) redirect("/clinic?error=1");
  redirect(`/clinic/sessions/${data}`);
}

export async function callNext(form) {
  const { supabase } = await getStaff();
  const sessionId = id(form, "session_id");
  const { data: next, error } = await supabase.rpc("call_next", { p_session_id: sessionId });
  if (error) back(sessionId, "error=1");
  if (next === null) back(sessionId, "ok=nobody");

  // "Your turn is coming" for whoever is 3 numbers away (switched off
  // until the owner approves the cost).
  const { data: soon } = await supabase
    .from("bookings")
    .select("patient_phone, queue_number, sessions(doctors(name_ar))")
    .eq("session_id", sessionId)
    .eq("source", "app")
    .eq("status", "booked")
    .eq("queue_number", next + TURN_SOON_AHEAD)
    .maybeSingle();
  if (soon) {
    await sendTurnSoon({ phone: soon.patient_phone, number: soon.queue_number, doctor: soon.sessions?.doctors?.name_ar ?? "" });
  }
  back(sessionId, "ok=done");
}

export async function setBookingStatus(form) {
  const { supabase } = await getStaff();
  const sessionId = id(form, "session_id");
  const { error } = await supabase.rpc("set_booking_status", {
    p_booking_id: id(form, "booking_id"),
    p_status: String(form.get("status")),
  });
  back(sessionId, error ? "error=1" : "ok=done");
}

export async function markPaid(form) {
  const { supabase } = await getStaff();
  const sessionId = id(form, "session_id");
  const raw = form.get("amount");
  const amount = raw === null || raw === "" ? null : Number(normalizeDigits(String(raw)).replace(/[,\s]/g, ""));
  if (amount !== null && (!Number.isInteger(amount) || amount < 0)) back(sessionId, "error=1");
  const { error } = await supabase.rpc("mark_paid", { p_booking_id: id(form, "booking_id"), p_amount: amount });
  back(sessionId, error ? "error=1" : "ok=done");
}

export async function addWalkIn(form) {
  const { supabase } = await getStaff();
  const sessionId = id(form, "session_id");
  // Same format as app bookings ("249912345678"); optional.
  const typed = String(form.get("phone") ?? "").trim();
  const phone = typed ? normalizeSudanPhone(typed) : null;
  if (typed && !phone) back(sessionId, "error=phone");
  const { error } = await supabase.rpc("add_walk_in", {
    p_session_id: sessionId,
    p_name: String(form.get("name") ?? ""),
    p_phone: phone ? phone.slice(1) : null,
  });
  back(sessionId, error ? "error=1" : "ok=done");
}

export async function updateSession(form) {
  const { supabase } = await getStaff();
  const sessionId = id(form, "session_id");
  const { error } = await supabase.rpc("update_session", {
    p_session_id: sessionId,
    p_status: String(form.get("status")),
    p_delay_minutes: Number(normalizeDigits(String(form.get("delay") ?? "0"))) || 0,
    p_notice: String(form.get("notice") ?? ""),
  });
  back(sessionId, error ? "error=1" : "ok=done");
}

// Pharmacy: reply to a medicine request.
export async function answerMedicines(form) {
  const { supabase } = await getStaff();
  const requestId = id(form, "request_id");
  const total = String(form.get("total") ?? "").trim();
  const amount = total ? Number(normalizeDigits(total).replace(/[,\s]/g, "")) : null;
  const readyAt = khartoumInputToIso(form.get("ready_at"));
  if (amount !== null && (!Number.isInteger(amount) || amount < 0)) redirect(`/clinic/medicines/${requestId}?error=1`);
  const { error } = await supabase.rpc("answer_medicines", {
    p_request_id: requestId,
    p_status: String(form.get("status")),
    p_total: amount,
    p_ready_at: readyAt,
    p_note: String(form.get("note") ?? ""),
  });
  if (!error) await notifyPatient(supabase, "pharmacy_requests", requestId);
  redirect(`/clinic/medicines/${requestId}?${error ? "error=1" : "ok=done"}`);
}

// Home visits: confirm (time + fee), decline (reason) or mark done.
export async function answerHomeVisit(form) {
  const { supabase } = await getStaff();
  const requestId = id(form, "request_id");
  const status = String(form.get("status"));
  const fee = String(form.get("fee") ?? "").trim();
  const amount = fee ? Number(normalizeDigits(fee).replace(/[,\s]/g, "")) : null;
  const visitAt = khartoumInputToIso(form.get("visit_at"));
  if ((amount !== null && (!Number.isInteger(amount) || amount < 0)) || (status === "confirmed" && !visitAt)) {
    redirect(`/clinic/visits/${requestId}?error=1`);
  }
  const { error } = await supabase.rpc("answer_home_visit", {
    p_request_id: requestId,
    p_status: status,
    p_visit_at: visitAt,
    p_fee: amount,
    p_note: String(form.get("note") ?? ""),
  });
  if (!error) await notifyPatient(supabase, "home_visit_requests", requestId);
  redirect(`/clinic/visits/${requestId}?${error ? "error=1" : "ok=done"}`);
}

// WhatsApp update to the patient (switched off until approved; never
// blocks the reply).
async function notifyPatient(supabase, table, requestId) {
  const pharmacy = table === "pharmacy_requests";
  const { data: r } = await supabase
    .from(table)
    .select(pharmacy ? "status, total_sdg, patient_phone, places(name_ar)" : "status, visit_at, fee_sdg, patient_phone, places(name_ar)")
    .eq("id", requestId)
    .maybeSingle();
  if (!r?.patient_phone || r.status === "collected" || r.status === "done") return;
  const statuses = pharmacy ? ar.pharmacy.statuses : ar.visits.statuses;
  const extra = pharmacy
    ? r.total_sdg !== null ? ` – ${formatMoney(r.total_sdg, "ar")}` : ""
    : r.visit_at ? ` – ${formatDateTime(r.visit_at, "ar")}` : "";
  await sendRequestUpdate({ phone: r.patient_phone, place: r.places?.name_ar ?? "", update: `${statuses[r.status]}${extra}` });
}
