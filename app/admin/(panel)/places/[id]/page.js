import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteLabTest, deletePlace, saveLabQueue } from "@/app/admin/(panel)/actions";
import LabTestForm from "@/components/admin/LabTestForm";
import Alerts from "@/components/admin/Alerts";
import DoctorForm from "@/components/admin/DoctorForm";
import { ConfirmDelete, Field } from "@/components/admin/Field";
import HoursEditor from "@/components/admin/HoursEditor";
import PlaceForm from "@/components/admin/PlaceForm";
import { getAdminSession } from "@/lib/admin/auth";
import { formatMoney } from "@/lib/format";
import { getDictionary, getLang } from "@/lib/i18n";

export default async function EditPlace({ params, searchParams }) {
  const lang = await getLang();
  const t = getDictionary(lang).admin;
  const { supabase } = await getAdminSession();
  const { id } = await params;
  const { ok, error } = await searchParams;

  const [{ data: place }, { data: doctorsData }, { data: hoursData }, { data: specialtiesData }] =
    await Promise.all([
      supabase.from("places").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("doctors")
        .select("id, name_ar, name_en, fee_sdg, is_active, is_lab_desk, daily_limit, minutes_per_patient, specialties(name_ar, name_en)")
        .eq("place_id", id)
        .order("name_ar"),
      supabase.from("opening_hours").select("*").eq("place_id", id),
      supabase.from("specialties").select("id, name_ar, name_en").order("name_ar"),
    ]);
  const specialties = specialtiesData ?? [];
  const hours = hoursData ?? [];
  const doctors = doctorsData ?? [];
  if (!place) notFound();
  const back = `/admin/places/${place.id}`;
  const isLab = place.kind === "lab";
  const labDesk = doctors.find((d) => d.is_lab_desk);
  // The lab desk is managed in "Lab queue", not as a doctor.
  const realDoctors = doctors.filter((d) => !d.is_lab_desk);
  const { data: testsData } = isLab
    ? await supabase.from("lab_tests").select("*").eq("place_id", place.id).order("sort_order").order("name_ar")
    : { data: [] };
  const tests = testsData ?? [];
  const f = t.fields;
  const x = t.examples;

  return (
    <>
      <Link href="/admin/places" className="back-link">
        {t.back}
      </Link>
      <h1>{lang === "en" ? place.name_en : place.name_ar}</h1>
      <Alerts t={t} ok={ok} error={error} />

      <section className="card">
        <PlaceForm t={t} place={place} />
      </section>

      <HoursEditor
        t={t}
        lang={lang}
        title={t.hours.placeTitle}
        owner="place"
        ownerId={place.id}
        hours={hours}
        back={back}
      />

      {isLab && (
        <>
          <section className="card">
            <h2>{t.labQueue.title}</h2>
            <p className="muted">{t.labQueue.hint}</p>
            <form action={saveLabQueue} className="form">
              <input type="hidden" name="place_id" value={place.id} />
              <input type="hidden" name="back" value={back} />
              <div className="pair">
                <Field label={f.dailyLimit} name="daily_limit" inputMode="numeric" defaultValue={labDesk?.daily_limit ?? 60} required dir="ltr" />
                <Field label={f.minutesPerPatient} name="minutes_per_patient" inputMode="numeric" defaultValue={labDesk?.minutes_per_patient ?? 5} required dir="ltr" />
              </div>
              <button className="button button-solid">{t.save}</button>
            </form>
          </section>

          <section className="card">
            <h2>{t.labTests.title}</h2>
            {tests.length === 0 && <p className="muted">{t.labTests.empty}</p>}
            <ul className="rows">
              {tests.map((test) => (
                <li key={test.id} className="card">
                  <details>
                    <summary className="row">
                      <span>
                        <strong>{lang === "en" ? test.name_en : test.name_ar}</strong>
                        <small className="muted"> · {test.price_sdg === null ? "–" : formatMoney(test.price_sdg, lang)}</small>
                      </span>
                      <span className={test.is_active ? "chip" : "chip chip-muted"}>{test.is_active ? t.shown : t.hidden}</span>
                    </summary>
                    <LabTestForm t={t} placeId={place.id} back={back} test={test} />
                    <ConfirmDelete t={t} action={deleteLabTest}>
                      <input type="hidden" name="id" value={test.id} />
                      <input type="hidden" name="back" value={back} />
                    </ConfirmDelete>
                  </details>
                </li>
              ))}
            </ul>
            <details className="add-more">
              <summary className="button">{t.labTests.add}</summary>
              <LabTestForm t={t} placeId={place.id} back={back} />
            </details>
          </section>
        </>
      )}

      {(!isLab || realDoctors.length > 0) && (
      <section className="card">
        <h2>{t.doctors.title}</h2>
        {realDoctors.length === 0 ? (
          <p className="muted">{t.doctors.empty}</p>
        ) : (
          <ul className="rows">
            {realDoctors.map((d) => (
              <li key={d.id}>
                <Link href={`/admin/doctors/${d.id}`} className="row row-link">
                  <span>
                    <strong>{lang === "en" ? d.name_en : d.name_ar}</strong>
                    <small className="muted">
                      {" "}
                      · {lang === "en" ? d.specialties?.name_en : d.specialties?.name_ar} ·{" "}
                      {d.fee_sdg === null ? t.doctors.noFee : formatMoney(d.fee_sdg, lang)}
                    </small>
                  </span>
                  <span className={d.is_active ? "chip" : "chip chip-muted"}>
                    {d.is_active ? t.shown : t.hidden}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <details className="add-more">
          <summary className="button">{t.doctors.add}</summary>
          <DoctorForm t={t} lang={lang} placeId={place.id} specialties={specialties} />
        </details>
      </section>
      )}

      <ConfirmDelete t={t} action={deletePlace}>
        <input type="hidden" name="id" value={place.id} />
        <input type="hidden" name="back" value={back} />
      </ConfirmDelete>
    </>
  );
}
