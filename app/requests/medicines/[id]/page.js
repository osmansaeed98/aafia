import { notFound } from "next/navigation";
import RatingForm from "@/components/RatingForm";
import { formatDateTime } from "@/lib/datetime";
import { formatMoney } from "@/lib/format";
import { getDictionary, getLang } from "@/lib/i18n";
import { requirePatient } from "@/lib/patient/auth";
import { cancelMedicines } from "@/app/pharmacies/actions";

export const metadata = { robots: { index: false } };

export default async function MedicineRequest({ params, searchParams }) {
  const lang = await getLang();
  const t = getDictionary(lang).pharmacy;
  const { id } = await params;
  const { ok, error, rating } = await searchParams;
  if (!/^\d+$/.test(id)) notFound();
  const { supabase } = await requirePatient(`/requests/medicines/${id}`);
  const { data: r } = await supabase
    .from("pharmacy_requests")
    .select("id, status, patient_name, items_text, photo_path, record_id, total_sdg, ready_at, pharmacy_note, created_at, place_id, places(name_ar, name_en, area_ar, area_en, phone)")
    .eq("id", id)
    .maybeSingle();
  if (!r) notFound();
  const done = r.status === "collected";
  const { data: myRating } = done
    ? await supabase.from("ratings").select("stars, comment").eq("pharmacy_request_id", r.id).maybeSingle()
    : { data: null };
  const { data: signed } = r.photo_path
    ? await supabase.storage.from("prescriptions").createSignedUrl(r.photo_path, 600)
    : { data: null };
  const open = ["sent", "available", "partial"].includes(r.status);

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
        <dd>
          {lang === "en" ? r.places?.name_en : r.places?.name_ar} · {lang === "en" ? r.places?.area_en : r.places?.area_ar}
        </dd>
        {r.items_text && (
          <>
            <dt>{t.yourList}</dt>
            <dd className="pre">{r.items_text}</dd>
          </>
        )}
        {r.total_sdg !== null && (
          <>
            <dt>{t.total}</dt>
            <dd>{formatMoney(r.total_sdg, lang)}</dd>
          </>
        )}
        {r.ready_at && (
          <>
            <dt>{t.readyAt}</dt>
            <dd>{formatDateTime(r.ready_at, lang)}</dd>
          </>
        )}
        {r.pharmacy_note && (
          <>
            <dt>{t.note}</dt>
            <dd>{r.pharmacy_note}</dd>
          </>
        )}
      </dl>
      {signed?.signedUrl && (
        <a href={signed.signedUrl} className="button">
          {t.photo}
        </a>
      )}
      {r.record_id && (
        <a href={`/records/${r.record_id}/file`} className="button" target="_blank" rel="noopener">
          {getDictionary(lang).records.fromRecord}
        </a>
      )}
      <p className="muted">{t.cash}</p>
      {open && (
        <details className="confirm-delete">
          <summary>{t.cancel}</summary>
          <form action={cancelMedicines}>
            <input type="hidden" name="id" value={r.id} />
            <p>{t.confirmCancel}</p>
            <button className="button button-danger">{t.cancel}</button>
          </form>
        </details>
      )}
      {done && (
        <RatingForm kind="medicines" id={r.id} existing={myRating} note={rating} title={getDictionary(lang).ratings.titleMedicines} t={getDictionary(lang).ratings} />
      )}
      <a href="/account" className="back-link">
        {getDictionary(lang).booking.myBookings}
      </a>
    </div>
  );
}
