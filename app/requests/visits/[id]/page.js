import { notFound } from "next/navigation";
import { formatDay } from "@/lib/booking";
import { formatDateTime } from "@/lib/datetime";
import { formatMoney, telHref } from "@/lib/format";
import { getDictionary, getLang } from "@/lib/i18n";
import { requirePatient } from "@/lib/patient/auth";
import { cancelHomeVisit } from "@/app/home-visits/actions";

export const metadata = { robots: { index: false } };

export default async function VisitRequest({ params, searchParams }) {
  const lang = await getLang();
  const t = getDictionary(lang).visits;
  const { id } = await params;
  const { ok, error } = await searchParams;
  if (!/^\d+$/.test(id)) notFound();
  const { supabase } = await requirePatient(`/requests/visits/${id}`);
  const { data: r } = await supabase
    .from("home_visit_requests")
    .select("id, status, patient_name, reason, preferred_date, preferred_time, area, address_details, visit_at, fee_sdg, clinic_note, places(name_ar, name_en, phone)")
    .eq("id", id)
    .maybeSingle();
  if (!r) notFound();
  const open = ["requested", "confirmed"].includes(r.status);

  return (
    <div className="admin narrow">
      <h1>{t.title2}</h1>
      {ok && (
        <p className="alert alert-ok" role="status">
          {ok === "cancelled" ? t.cancelled : t.sent}
        </p>
      )}
      {error && <p className="alert alert-error">{t.errors.invalid}</p>}
      <p className={`status-banner status-${r.status}`}>{t.statuses[r.status]}</p>
      <dl className="details">
        <dt>{t.forWhom}</dt>
        <dd>{r.patient_name}</dd>
        <dt>{t.title}</dt>
        <dd>{lang === "en" ? r.places?.name_en : r.places?.name_ar}</dd>
        {r.visit_at ? (
          <>
            <dt>{t.when}</dt>
            <dd>{formatDateTime(r.visit_at, lang)}</dd>
          </>
        ) : (
          <>
            <dt>{t.preferred}</dt>
            <dd>
              {formatDay(r.preferred_date, lang)} · {t.times[r.preferred_time]}
            </dd>
          </>
        )}
        {r.fee_sdg !== null && (
          <>
            <dt>{t.fee}</dt>
            <dd>
              {formatMoney(r.fee_sdg, lang)} · {t.cash}
            </dd>
          </>
        )}
        {r.clinic_note && (
          <>
            <dt>{t.note}</dt>
            <dd>{r.clinic_note}</dd>
          </>
        )}
        <dt>{t.reason}</dt>
        <dd>{r.reason}</dd>
        <dt>{t.address}</dt>
        <dd>
          {r.area} · {r.address_details}
        </dd>
      </dl>
      {r.places?.phone && (
        <a href={telHref(r.places.phone)} className="button">
          {getDictionary(lang).clinic.call}
        </a>
      )}
      <p className="notice">{t.emergencyNote}</p>
      {open && (
        <details className="confirm-delete">
          <summary>{t.cancel}</summary>
          <form action={cancelHomeVisit}>
            <input type="hidden" name="id" value={r.id} />
            <p>{t.confirmCancel}</p>
            <button className="button button-danger">{t.cancel}</button>
          </form>
        </details>
      )}
      <a href="/account" className="back-link">
        {getDictionary(lang).booking.myBookings}
      </a>
    </div>
  );
}
