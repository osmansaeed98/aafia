// Public star averages. The database shares them only once a place or
// doctor has at least 3 ratings, so one unhappy (or friendly) visitor
// can't decide the stars alone.
export async function ratingSummary(supabase) {
  const { data } = await supabase.rpc("rating_summary");
  const places = new Map();
  const doctors = new Map();
  for (const r of data ?? []) {
    if (r.place_id) places.set(r.place_id, r);
    else if (r.doctor_id) doctors.set(r.doctor_id, r);
  }
  return { places, doctors };
}

// Where each kind of rating is made (and where to go back to).
export const RATING_PAGES = {
  booking: "/bookings/",
  medicines: "/requests/medicines/",
  visit: "/requests/visits/",
};

// The ratings table column for each kind.
export const RATING_COLUMNS = {
  booking: "booking_id",
  medicines: "pharmacy_request_id",
  visit: "visit_request_id",
};
