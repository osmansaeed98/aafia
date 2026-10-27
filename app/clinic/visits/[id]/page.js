import { notFound } from "next/navigation";
import { formatDay } from "@/lib/booking";
import { canManage, getStaff } from "@/lib/clinic/auth";
import { formatDateTime } from "@/lib/datetime";
import { formatMoney, telHref } from "@/lib/format";
import { getDictionary, getLang } from "@/lib/i18n";
import { formatSudanPhone } from "@/lib/phone";
import { answerHomeVisit } from "../../actions";

export const metadata = { robots: { index: false } };

export default async function VisitRequestDesk({ params, searchParams }) {
  const lang = await getLang();
  const dict = getDictionary(lang);
  const t = dict.clinic;
  const tv = dict.visits;
  const { id } = await params;
  const { ok, error } = await searchParams;
  if (!/^\d+$/.test(id)) notFound();
  const { supabase, team } = await getStaff(`/clinic/visits/${id}`);
  const { data: r } = await supabase
    .from("home_visit_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!r || !canManage(team, r.place_id)) notFound();

  return (
    <div className="admin narrow">
      <a href={`/clinic?place=${r.place_id}`} className="back-link">
        {t.back}
      </a>
      <h1>{r.patient_name}</h1>
      {ok && <p className="alert alert-ok">{t.done}</p>}
      {error && <p className="alert alert-error">{t.error}</p>}
      <p className={`status-banner status-${r.status}`}>{tv.statuses[r.status]}</p>
      <dl className="details">
        <dt>{tv.reason}</dt>
        <dd>{r.reason}</dd>
        <dt>{tv.preferred}</dt>
        <dd>
          {formatDay(r.preferred_date, lang)} · {tv.times[r.preferred_time]}
        </dd>
        <dt>{tv.address}</dt>
        <dd>
          {r.area} · {r.address_details}
        </dd>
        {r.visit_at && (
          <>
            <dt>{tv.when}</dt>
            <dd>{formatDateTime(r.visit_at, lang)}</dd>
          </>
        )}
        {r.fee_sdg !== null && (
          <>
            <dt>{tv.fee}</dt>
            <dd>{formatMoney(r.fee_sdg, lang)}</dd>
          </>
        )}
      </dl>
      <div className="dept-actions">
        {r.patient_phone && (
          <a href={telHref(r.patient_phone)} className="button" dir="ltr">
            {t.call} {formatSudanPhone(r.patient_phone)}
          </a>
        )}
        {r.latitude !== null && (
          <a href={`https://www.google.com/maps/search/?api=1&query=${r.latitude},${r.longitude}`} className="button">
            {t.openMap}
          </a>
        )}
      </div>

      {r.status === "requested" && (
        <>
          <form action={answerHomeVisit} className="form card">
            <h2>{t.confirmVisit}</h2>
            <input type="hidden" name="request_id" value={r.id} />
            <input type="hidden" name="status" value="confirmed" />
            <div className="pair">
              <label className="field">
                <span>{t.visitAt}</span>
                <input name="visit_at" type="datetime-local" required dir="ltr" defaultValue={`${r.preferred_date}T${{ morning: "10:00", afternoon: "14:00", evening: "18:00" }[r.preferred_time]}`} />
              </label>
              <label className="field">
                <span>{t.fee}</span>
                <input name="fee" inputMode="numeric" dir="ltr" placeholder="20000" />
              </label>
            </div>
            <label className="field">
              <span>{t.note}</span>
              <input name="note" maxLength={300} />
            </label>
            <button className="button button-solid">{t.confirmVisit}</button>
          </form>
          <details className="confirm-delete">
            <summary>{t.declineVisit}</summary>
            <form action={answerHomeVisit} className="form">
              <input type="hidden" name="request_id" value={r.id} />
              <input type="hidden" name="status" value="declined" />
              <label className="field">
                <span>{t.declineReason}</span>
                <input name="note" maxLength={300} required />
              </label>
              <button className="button button-danger">{t.declineVisit}</button>
            </form>
          </details>
        </>
      )}
      {r.status === "confirmed" && (
        <form action={answerHomeVisit}>
          <input type="hidden" name="request_id" value={r.id} />
          <input type="hidden" name="status" value="done" />
          <button className="button button-solid">{t.visitDone}</button>
        </form>
      )}
    </div>
  );
}
