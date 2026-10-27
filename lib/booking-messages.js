// WhatsApp messages about bookings: a confirmation when booking, and
// "your turn is coming" when the patient is 3 numbers away.
// SWITCHED OFF until the owner approves the cost (about $0.0046 per
// message, ~$0.01 per booking). To switch on, set in Vercel:
//   BOOKING_MESSAGES_ENABLED=true
// and have these "utility" templates approved in WhatsApp Manager:
//   aafia_booking_confirmed  {{1}} name, {{2}} doctor, {{3}} day, {{4}} number
//   aafia_turn_soon          {{1}} number, {{2}} doctor
import { sendWhatsAppTemplate } from "./whatsapp.js";

export const TURN_SOON_AHEAD = 3;

export function bookingMessagesEnabled(env = process.env) {
  return env.BOOKING_MESSAGES_ENABLED === "true";
}

function send(phone, template, params, options) {
  if (!phone || !bookingMessagesEnabled(options?.env)) return Promise.resolve({ skipped: true });
  return sendWhatsAppTemplate(phone, template, params, options).catch((error) => {
    // A message that fails must never break the booking itself.
    console.error("Booking message not sent:", error.message);
    return { failed: true };
  });
}

export function sendBookingConfirmed({ phone, name, doctor, day, number }, options) {
  return send(phone, "aafia_booking_confirmed", [name, doctor, day, String(number)], options);
}

export function sendTurnSoon({ phone, number, doctor }, options) {
  return send(phone, "aafia_turn_soon", [String(number), doctor], options);
}
