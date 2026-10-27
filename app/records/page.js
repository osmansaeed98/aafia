import PersonChoice from "@/components/PersonChoice";
import PrescriptionPhoto from "@/components/PrescriptionPhoto";
import { formatDateTime } from "@/lib/datetime";
import { getDictionary, getLang } from "@/lib/i18n";
import { MAX_MEDICAL_FILE, RECORD_KINDS } from "@/lib/medical-files";
import { requirePatient } from "@/lib/patient/auth";
import { requestMedicines } from "@/app/pharmacies/actions";
import { addMyRecord, deleteMyRecord } from "./actions";

export const metadata = { robots: { index: false } };

export default async function Records({ searchParams }) {
  const lang = await getLang();
  const dict = getDictionary(lang);
  const t = dict.records;
  const { ok, error, from } = await searchParams;
  const { supabase, user } = await requirePatient("/records");
  const [{ data: profile }, { data: familyData }, { data: recordsData }, { data: pharmaciesData }, { data: sentData }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle(),
    supabase.from("family_members").select("id, full_name").order("created_at"),
    supabase
      .from("medical_records")
      .select("id, family_member_id, patient_name, kind, title, notes, uploaded_by, place_id, created_at, places(name_ar, name_en)")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("places").select("id, name_ar, name_en, area_ar, area_en").eq("kind", "pharmacy").eq("is_active", true).order("name_ar"),
    supabase.from("pharmacy_requests").select("record_id").eq("requested_by", user.id).not("record_id", "is", null),
  ]);
  // Prescriptions already sent to a pharmacy are kept.
  const sent = new Set((sentData ?? []).map((r) => r.record_id));
  const family = familyData ?? [];
  const pharmacies = pharmaciesData ?? [];

  // One group per person, the account holder first. Records of a family
  // member who was later removed stay with the account holder's.
  const groups = new Map([["me", { name: profile?.full_name, records: [] }]]);
  for (const m of family) groups.set(m.id, { name: m.full_name, records: [] });
  for (const r of recordsData ?? []) {
    (groups.get(r.family_member_id) ?? groups.get("me")).records.push(r);
  }
  const people = [...groups].filter(([, g]) => g.records.length > 0);
  const errors = from === "pharmacy" ? dict.pharmacy.errors : t.errors;

  return (
    <div className="admin narrow">
      <h1>{t.title}</h1>
      <p className="muted">{t.subtitle}</p>
      {ok && (
        <p className="alert alert-ok" role="status">
          {ok === "deleted" ? t.deleted : t.added}
        </p>
      )}
      {error && (
        <p className="alert alert-error" role="alert">
          {errors[error] ?? errors.generic}
        </p>
      )}

      {people.length === 0 ? (
        <p className="muted">{t.empty}</p>
      ) : (
        people.map(([key, { name, records }]) => (
          <section key={key} className="card">
            <h2>{name ?? records[0].patient_name}</h2>
            <ul className="rows">
              {records.map((r) => (
                <li key={r.id} className="record">
                  <div className="row">
                    <span>
                      <strong>{r.title}</strong>
                      <br />
                      <small className="muted">
                        {r.patient_name !== (name ?? records[0].patient_name) && `${r.patient_name} · `}
                        {r.uploaded_by === user.id
                          ? `${t.byYou} · `
                          : r.places && `${t.from} ${lang === "en" ? r.places.name_en : r.places.name_ar} · `}
                        {formatDateTime(r.created_at, lang)}
                      </small>
                    </span>
                    <span className={r.kind === "prescription" ? "chip" : "chip chip-muted"}>{t.kinds[r.kind]}</span>
                  </div>
                  {r.notes && <p className="pre muted">{r.notes}</p>}
                  <div className="queue-actions">
                    <a href={`/records/${r.id}/file`} className="button button-small" target="_blank" rel="noopener">
                      {t.open}
                    </a>
                  </div>
                  {r.kind === "prescription" && (
                    <details className="add-more">
                      <summary className="button button-small">{t.sendToPharmacy}</summary>
                      {pharmacies.length === 0 ? (
                        <p className="muted">{t.noPharmacies}</p>
                      ) : (
                        <form action={requestMedicines} className="form">
                          <input type="hidden" name="record_id" value={r.id} />
                          <label className="field">
                            <span>{t.choosePharmacy}</span>
                            <select name="place_id" required defaultValue="">
                              <option value="" disabled />
                              {pharmacies.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {lang === "en" ? `${p.name_en} · ${p.area_en}` : `${p.name_ar} · ${p.area_ar}`}
                                </option>
                              ))}
                            </select>
                          </label>
                          <p className="muted">{t.pharmacyNote}</p>
                          <button className="button button-solid">{t.sendToPharmacy}</button>
                        </form>
                      )}
                    </details>
                  )}
                  {r.uploaded_by === user.id && !r.place_id && !sent.has(r.id) && (
                    <details className="confirm-delete">
                      <summary>{t.delete}</summary>
                      <form action={deleteMyRecord}>
                        <input type="hidden" name="id" value={r.id} />
                        <p>{t.confirmDelete}</p>
                        <button className="button button-danger">{t.delete}</button>
                      </form>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {profile ? (
        <details className="add-more card">
          <summary className="button button-solid">{t.add}</summary>
          <form action={addMyRecord} className="form">
            <PersonChoice title={t.forWhom} meLabel={t.me} profile={profile} family={family} />
            <label className="field">
              <span>{t.kind}</span>
              <select name="kind" defaultValue="lab_result">
                {RECORD_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t.kinds[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{t.name}</span>
              <input name="title" required minLength={2} maxLength={120} placeholder={t.nameExample} />
            </label>
            <PrescriptionPhoto
              name="file"
              accept="image/*,application/pdf"
              maxBytes={MAX_MEDICAL_FILE}
              maxSide={2400}
              quality={0.85}
              required
              label={t.file}
              hint={t.fileHint}
              readyLabel={t.fileReady}
              tooBigLabel={t.errors.file}
            />
            <label className="field">
              <span>
                {t.notes} <small>({t.optional})</small>
              </span>
              <textarea name="notes" rows={2} maxLength={500} />
            </label>
            <button className="button button-solid">{t.save}</button>
          </form>
        </details>
      ) : (
        <a href="/account" className="button button-solid">
          {dict.book.setupFirst}
        </a>
      )}
      <p className="notice">{t.notDoctor}</p>
      <p className="footnote">{t.private}</p>
    </div>
  );
}
