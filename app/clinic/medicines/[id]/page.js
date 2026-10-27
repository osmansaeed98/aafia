import { notFound } from "next/navigation";
import { canManage, getStaff } from "@/lib/clinic/auth";
import { formatDateTime } from "@/lib/datetime";
import { formatMoney, telHref } from "@/lib/format";
import { getDictionary, getLang } from "@/lib/i18n";
import { formatSudanPhone } from "@/lib/phone";
import { answerMedicines } from "../../actions";

export const metadata = { robots: { index: false } };

export default async function MedicineRequestDesk({ params, searchParams }) {
  const lang = await getLang();
  const dict = getDictionary(lang);
  const t = dict.clinic;
  const tp = dict.pharmacy;
  const { id } = await params;
  const { ok, error } = await searchParams;
  if (!/^\d+$/.test(id)) notFound();
  const { supabase, team } = await getStaff(`/clinic/medicines/${id}`);
  const { data: r } = await supabase
    .from("pharmacy_requests")
    .select("id, place_id, status, patient_name, patient_phone, items_text, photo_path, record_id, total_sdg, ready_at, pharmacy_note, created_at, medical_records(title)")
    .eq("id", id)
    .maybeSingle();
  if (!r || !canManage(team, r.place_id)) notFound();
  const { data: signed } = r.photo_path
    ? await supabase.storage.from("prescriptions").createSignedUrl(r.photo_path, 600)
    : { data: null };
  const open = ["sent", "available", "partial"].includes(r.status);

  return (
    <div className="admin narrow">
      <a href={`/clinic?place=${r.place_id}`} className="back-link">
        {t.back}
      </a>
      <h1>{r.patient_name}</h1>
      {ok && <p className="alert alert-ok">{t.done}</p>}
      {error && <p className="alert alert-error">{t.error}</p>}
      <p className={`status-banner status-${r.status}`}>{tp.statuses[r.status]}</p>
      <p className="muted">{formatDateTime(r.created_at, lang)}</p>
      {r.patient_phone && (
        <a href={telHref(r.patient_phone)} className="button" dir="ltr">
          {t.call} {formatSudanPhone(r.patient_phone)}
        </a>
      )}
      {r.items_text && (
        <section className="card">
          <h2>{tp.yourList}</h2>
          <p className="pre">{r.items_text}</p>
        </section>
      )}
      {signed?.signedUrl && (
        <a href={signed.signedUrl} className="photo-link">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={signed.signedUrl} alt={tp.photo} />
        </a>
      )}
      {r.record_id && (
        <a href={`/records/${r.record_id}/file`} className="button" target="_blank" rel="noopener">
          {dict.records.fromRecord}
          {r.medical_records?.title && ` · ${r.medical_records.title}`}
        </a>
      )}
      {(r.total_sdg !== null || r.pharmacy_note) && (
        <p className="muted">
          {r.total_sdg !== null && formatMoney(r.total_sdg, lang)} {r.pharmacy_note && `· ${r.pharmacy_note}`}
        </p>
      )}
      {open && (
        <form action={answerMedicines} className="form card">
          <h2>{t.reply}</h2>
          <input type="hidden" name="request_id" value={r.id} />
          <div className="slots">
            {["available", "partial", "unavailable", "collected"].map((s, i) => (
              <label key={s} className="slot">
                <input type="radio" name="status" value={s} defaultChecked={i === 0} />
                <span>
                  <strong>{t.replyOptions[s]}</strong>
                </span>
              </label>
            ))}
          </div>
          <div className="pair">
            <label className="field">
              <span>{t.total}</span>
              <input name="total" inputMode="numeric" dir="ltr" defaultValue={r.total_sdg ?? ""} placeholder="4500" />
            </label>
            <label className="field">
              <span>{t.readyAt}</span>
              <input name="ready_at" type="datetime-local" dir="ltr" />
            </label>
          </div>
          <label className="field">
            <span>{t.note}</span>
            <input name="note" maxLength={300} defaultValue={r.pharmacy_note ?? ""} />
          </label>
          <button className="button button-solid">{t.reply}</button>
        </form>
      )}
    </div>
  );
}
