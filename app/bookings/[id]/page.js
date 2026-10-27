import { notFound } from "next/navigation";
import RatingForm from "@/components/RatingForm";
import LiveQueue from "@/components/LiveQueue";
import { formatDay } from "@/lib/booking";
import { formatClock, formatMoney } from "@/lib/format";
import { getDictionary, getLang } from "@/lib/i18n";
import { requirePatient } from "@/lib/patient/auth";
import { cancelBooking } from "@/app/book/actions";

export const metadata = { robots: { index: false } };

export default async function BookingPage({ params, searchParams }) {
  const lang = await getLang();
  const t = getDictionary(lang).booking;
  const { id } = await params;
  const { ok, error, rating } = await searchParams;
  if (!/^\d+$/.test(id)) notFound();
  const { supabase } = await requirePatient(`/bookings/${id}`);

  const { data: booking } = await supabase
    .from("bookings")
    .select(
      "id, queue_number, status, patient_name, session_id, sessions(session_date, starts_at, ends_at, status, now_serving, delay_minutes, notice, doctors(name_ar, name_en, fee_sdg, minutes_per_patient, places(name_ar, name_en, area_ar, area_en)))",
    )
    .eq("id", id)
    .maybeSingle();
  if (!booking) notFound();
  const done = booking.status === "seen";
  const { data: myRating } = done
    ? await supabase.from("ratings").select("stars, comment").eq("booking_id", booking.id).maybeSingle()
    : { data: null };
  const s = booking.sessions;
  const doctor = s.doctors;
  const place = doctor?.places;
  const canCancel = booking.status === "booked" && !["closed", "cancelled"].includes(s.status);

  return (
    <div className="admin narrow">
      <h1>{t.title}</h1>
      {ok && (
        <p className="alert alert-ok" role="status">
          {ok === "cancelled" ? t.cancelled : t.booked}
        </p>
      )}
      {error && (
        <p className="alert alert-error" role="alert">
          {t.cannotCancel}
        </p>
      )}

      <LiveQueue
        bookingId={booking.id}
        lang={lang}
        sessionId={booking.session_id}
        number={booking.queue_number}
        bookingStatus={booking.status}
        minutesPerPatient={doctor?.minutes_per_patient ?? 15}
        initialSession={{ status: s.status, now_serving: s.now_serving, delay_minutes: s.delay_minutes, notice: s.notice }}
        t={t}
      />

      <dl className="details">
        <dt>{t.for}</dt>
        <dd>{booking.patient_name}</dd>
        <dt>{t.doctor}</dt>
        <dd>{lang === "en" ? doctor?.name_en : doctor?.name_ar}</dd>
        <dt>{t.place}</dt>
        <dd>
          {lang === "en" ? place?.name_en : place?.name_ar} · {lang === "en" ? place?.area_en : place?.area_ar}
        </dd>
        <dt>{t.when}</dt>
        <dd>
          {formatDay(s.session_date, lang)} · {formatClock(s.starts_at, lang)} – {formatClock(s.ends_at, lang)}
        </dd>
        {doctor?.fee_sdg !== null && doctor?.fee_sdg !== undefined && (
          <>
            <dt>{t.fee}</dt>
            <dd>
              {formatMoney(doctor.fee_sdg, lang)} · {t.cash}
            </dd>
          </>
        )}
      </dl>
      <p className="chip status-chip">{t.statuses[booking.status]}</p>

      {canCancel && (
        <details className="confirm-delete">
          <summary>{t.cancel}</summary>
          <form action={cancelBooking}>
            <input type="hidden" name="id" value={booking.id} />
            <p>{t.confirmCancel}</p>
            <button className="button button-danger">{t.cancel}</button>
          </form>
        </details>
      )}
      {done && (
        <RatingForm kind="booking" id={booking.id} existing={myRating} note={rating} title={getDictionary(lang).ratings.title} t={getDictionary(lang).ratings} />
      )}
      <a href="/account" className="back-link">
        {t.myBookings}
      </a>
    </div>
  );
}
