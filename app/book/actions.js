"use server";

import { redirect } from "next/navigation";
import { bookingErrorKey, formatDay } from "@/lib/booking";
import { sendBookingConfirmed } from "@/lib/booking-messages";
import { requirePatient } from "@/lib/patient/auth";

export async function bookNumber(form) {
  const doctorId = Number(form.get("doctor_id"));
  const back = `/book/${Number.isInteger(doctorId) ? doctorId : ""}`;
  const { supabase, user } = await requirePatient(back);

  const [date, starts] = String(form.get("session") ?? "").split("|");
  const who = String(form.get("who") ?? "me");
  const familyId = who === "me" ? null : Number(who);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") || !/^\d{2}:\d{2}/.test(starts ?? "") || (familyId !== null && !Number.isInteger(familyId))) {
    redirect(`${back}?error=invalid`);
  }

  const { data: bookingId, error } = await supabase.rpc("book", {
    p_doctor_id: doctorId,
    p_date: date,
    p_starts: starts,
    p_family_member_id: familyId,
  });
  if (error) redirect(`${back}?error=${bookingErrorKey(error)}`);

  // Switched off until the owner approves the cost; never blocks booking.
  const { data: b } = await supabase
    .from("bookings")
    .select("patient_name, queue_number, sessions(session_date, doctors(name_ar))")
    .eq("id", bookingId)
    .maybeSingle();
  if (b) {
    await sendBookingConfirmed({
      phone: user.phone,
      name: b.patient_name,
      doctor: b.sessions?.doctors?.name_ar ?? "",
      day: formatDay(b.sessions?.session_date, "ar"),
      number: b.queue_number,
    });
  }
  redirect(`/bookings/${bookingId}?ok=booked`);
}

export async function cancelBooking(form) {
  const id = Number(form.get("id"));
  const { supabase } = await requirePatient(`/bookings/${id}`);
  const { error } = await supabase.rpc("cancel_booking", { p_booking_id: id });
  redirect(`/bookings/${id}?${error ? "error=cannotCancel" : "ok=cancelled"}`);
}
