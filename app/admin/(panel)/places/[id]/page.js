import Link from "next/link";
import { notFound } from "next/navigation";
import { deletePlace } from "@/app/admin/(panel)/actions";
import Alerts from "@/components/admin/Alerts";
import DoctorForm from "@/components/admin/DoctorForm";
import { ConfirmDelete } from "@/components/admin/Field";
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

  const [{ data: place }, { data: doctors = [] }, { data: hours = [] }, { data: specialties = [] }] =
    await Promise.all([
      supabase.from("places").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("doctors")
        .select("id, name_ar, name_en, fee_sdg, is_active, specialties(name_ar, name_en)")
        .eq("place_id", id)
        .order("name_ar"),
      supabase.from("opening_hours").select("*").eq("place_id", id),
      supabase.from("specialties").select("id, name_ar, name_en").order("name_ar"),
    ]);
  if (!place) notFound();
  const back = `/admin/places/${place.id}`;

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

      <section className="card">
        <h2>{t.doctors.title}</h2>
        {doctors.length === 0 ? (
          <p className="muted">{t.doctors.empty}</p>
        ) : (
          <ul className="rows">
            {doctors.map((d) => (
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

      <ConfirmDelete t={t} action={deletePlace}>
        <input type="hidden" name="id" value={place.id} />
        <input type="hidden" name="back" value={back} />
      </ConfirmDelete>
    </>
  );
}
