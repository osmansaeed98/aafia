import { notFound } from "next/navigation";
import AutoRefresh from "@/components/AutoRefresh";
import { formatDay } from "@/lib/booking";
import { canManage, getStaff } from "@/lib/clinic/auth";
import { formatClock, formatMoney, telHref } from "@/lib/format";
import { getDictionary, getLang } from "@/lib/i18n";
import { formatSudanPhone } from "@/lib/phone";
import { addWalkIn, callNext, markPaid, setBookingStatus, updateSession } from "../../actions";

export const metadata = { robots: { index: false } };

const DELAYS = [15, 30, 45, 60, 90, 120];

function Hidden({ sessionId, bookingId }) {
  return (
    <>
      <input type="hidden" name="session_id" value={sessionId} />
      {bookingId && <input type="hidden" name="booking_id" value={bookingId} />}
    </>
  );
}

export default async function ClinicSession({ params, searchParams }) {
  const lang = await getLang();
  const t = getDictionary(lang).clinic;
  const tb = getDictionary(lang).booking;
  const { id } = await params;
  const { ok, error } = await searchParams;
  if (!/^\d+$/.test(id)) notFound();
  const { supabase, team } = await getStaff(`/clinic/sessions/${id}`);

  const { data: session } = await supabase
    .from("sessions")
    .select("id, session_date, starts_at, ends_at, status, delay_minutes, notice, now_serving, doctors(name_ar, name_en, fee_sdg, place_id)")
    .eq("id", id)
    .maybeSingle();
  if (!session || !canManage(team, session.doctors?.place_id)) notFound();

  const { data: bookingsData } = await supabase
    .from("bookings")
    .select("id, queue_number, patient_name, patient_phone, source, status, paid_amount")
    .eq("session_id", id)
    .order("queue_number");
  const bookings = (bookingsData ?? []).filter((b) => b.status !== "cancelled");
  const fee = session.doctors?.fee_sdg;
  const running = !["cancelled", "closed"].includes(session.status);

  return (
    <div className="admin">
      <AutoRefresh seconds={30} />
      <a href="/clinic" className="back-link">
        {t.back}
      </a>
      <h1>{lang === "en" ? session.doctors?.name_en : session.doctors?.name_ar}</h1>
      <p className="muted">
        {formatDay(session.session_date, lang)} · {formatClock(session.starts_at, lang)} – {formatClock(session.ends_at, lang)} ·{" "}
        <span className="chip">{t.statuses[session.status]}</span>
      </p>
      {ok && (
        <p className="alert alert-ok" role="status">
          {ok === "nobody" ? t.nobodyWaiting : t.done}
        </p>
      )}
      {error && <p className="alert alert-error">{error === "phone" ? t.phoneError : t.error}</p>}

      <section className="queue-card">
        <span className="queue-label">{t.nowServing}</span>
        <strong className="queue-big queue-serving" data-testid="now-serving">
          {session.now_serving > 0 ? session.now_serving : "–"}
        </strong>
        {running && (
          <form action={callNext}>
            <Hidden sessionId={session.id} />
            <button className="button button-solid call-next">{t.callNext}</button>
          </form>
        )}
      </section>

      <section className="card">
        <h2>
          {t.queue} ({bookings.length})
        </h2>
        {bookings.length === 0 ? (
          <p className="muted">{t.empty}</p>
        ) : (
          <ul className="rows queue-list">
            {bookings.map((b) => (
              <li key={b.id} className={`queue-row ${b.queue_number === session.now_serving ? "queue-row-now" : ""}`}>
                <div className="row">
                  <span>
                    <strong className="queue-no">{b.queue_number}</strong> <strong>{b.patient_name}</strong>
                    {b.source === "walk_in" && <span className="chip chip-muted">{t.walkIn}</span>}
                    <br />
                    {b.patient_phone && (
                      <a href={telHref(b.patient_phone)} dir="ltr" className="muted">
                        {formatSudanPhone(b.patient_phone)}
                      </a>
                    )}
                  </span>
                  <span className={["booked", "arrived"].includes(b.status) ? "chip" : "chip chip-muted"}>{tb.statuses[b.status]}</span>
                </div>
                <div className="queue-actions">
                  {[
                    ["arrived", t.arrived],
                    ["seen", t.seen],
                    ["no_show", t.noShow],
                  ]
                    .filter(([status]) => status !== b.status)
                    .map(([status, label]) => (
                      <form key={status} action={setBookingStatus}>
                        <Hidden sessionId={session.id} bookingId={b.id} />
                        <input type="hidden" name="status" value={status} />
                        <button className="button button-small">{label}</button>
                      </form>
                    ))}
                  {b.status !== "booked" && (
                    <form action={setBookingStatus}>
                      <Hidden sessionId={session.id} bookingId={b.id} />
                      <input type="hidden" name="status" value="booked" />
                      <button className="button button-small">{t.undo}</button>
                    </form>
                  )}
                </div>
                {b.paid_amount === null ? (
                  <form action={markPaid} className="pay-form">
                    <Hidden sessionId={session.id} bookingId={b.id} />
                    <input name="amount" inputMode="numeric" defaultValue={fee ?? ""} aria-label={t.amount} dir="ltr" required />
                    <button className="button button-small">{t.markPaid}</button>
                  </form>
                ) : (
                  <form action={markPaid} className="pay-form">
                    <Hidden sessionId={session.id} bookingId={b.id} />
                    <span className="chip">
                      {t.paid} {formatMoney(b.paid_amount, lang)}
                    </span>
                    <button className="button button-small">{t.undo}</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {running && (
      <details className="add-more card">
        <summary className="button button-solid">{t.addWalkIn}</summary>
        <form action={addWalkIn} className="form">
          <Hidden sessionId={session.id} />
          <label className="field">
            <span>{t.name}</span>
            <input name="name" required maxLength={100} />
          </label>
          <label className="field">
            <span>
              {t.phone} <small>({t.optional})</small>
            </span>
            <input name="phone" type="tel" dir="ltr" placeholder="0912 345 678" />
          </label>
          <button className="button button-solid">{t.addWalkIn}</button>
        </form>
      </details>
      )}

      <details className="add-more card">
        <summary className="button">{t.postDelay}</summary>
        <form action={updateSession} className="form">
          <Hidden sessionId={session.id} />
          <input type="hidden" name="status" value="delayed" />
          <label className="field">
            <span>{t.delay}</span>
            <select name="delay" defaultValue={session.delay_minutes || 30}>
              {DELAYS.map((m) => (
                <option key={m} value={m}>
                  {m} {t.minutes}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>
              {t.notice} <small>({t.optional})</small>
            </span>
            <input name="notice" maxLength={200} defaultValue={session.notice ?? ""} placeholder={t.noticeExample} />
          </label>
          <button className="button button-solid">{t.postDelay}</button>
        </form>
      </details>

      <div className="queue-actions session-actions">
        {session.status !== "open" && (
          <form action={updateSession}>
            <Hidden sessionId={session.id} />
            <input type="hidden" name="status" value="open" />
            <button className="button">{t.reopen}</button>
          </form>
        )}
        {session.status !== "closed" && (
          <form action={updateSession}>
            <Hidden sessionId={session.id} />
            <input type="hidden" name="status" value="closed" />
            <button className="button">{t.closeSession}</button>
          </form>
        )}
      </div>
      {session.status !== "cancelled" && (
        <details className="confirm-delete">
          <summary>{t.cancelSession}</summary>
          <form action={updateSession}>
            <Hidden sessionId={session.id} />
            <input type="hidden" name="status" value="cancelled" />
            <p>{t.confirmCancel}</p>
            <button className="button button-danger">{t.cancelSession}</button>
          </form>
        </details>
      )}
      <p className="footnote">{t.refresh}</p>
    </div>
  );
}
