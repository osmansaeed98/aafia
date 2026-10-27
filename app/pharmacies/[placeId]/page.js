import { notFound } from "next/navigation";
import PersonChoice from "@/components/PersonChoice";
import PrescriptionPhoto from "@/components/PrescriptionPhoto";
import { telHref } from "@/lib/format";
import { getDictionary, getLang } from "@/lib/i18n";
import { patientContext } from "@/lib/patient/context";
import { createSupabasePublic } from "@/lib/supabase/server";
import { requestMedicines } from "../actions";

export default async function Pharmacy({ params, searchParams }) {
  const lang = await getLang();
  const t = getDictionary(lang).pharmacy;
  const { placeId } = await params;
  const { error } = await searchParams;
  if (!/^\d+$/.test(placeId)) notFound();
  const { data: place } = await createSupabasePublic()
    .from("places")
    .select("id, name_ar, name_en, area_ar, area_en, address_ar, address_en, phone, kind")
    .eq("id", placeId)
    .eq("kind", "pharmacy")
    .maybeSingle();
  if (!place) notFound();
  const { supabase, user, profile, family } = await patientContext();
  const { count: prescriptions } = user
    ? await supabase.from("medical_records").select("id", { count: "exact", head: true }).eq("owner_id", user.id).eq("kind", "prescription")
    : { count: 0 };
  const login = getDictionary(lang).book;

  return (
    <div className="admin narrow">
      <h1>{lang === "en" ? place.name_en : place.name_ar}</h1>
      <p className="muted">
        {lang === "en" ? place.area_en : place.area_ar}
        {(lang === "en" ? place.address_en : place.address_ar) && ` · ${lang === "en" ? place.address_en : place.address_ar}`}
      </p>
      {place.phone && (
        <a href={telHref(place.phone)} className="button">
          {getDictionary(lang).clinic.call}
        </a>
      )}
      <p className="muted">{t.subtitle}</p>
      {error && (
        <p className="alert alert-error" role="alert">
          {t.errors[error] ?? t.errors.generic}
        </p>
      )}
      {!user ? (
        <a href={`/login?next=${encodeURIComponent(`/pharmacies/${place.id}`)}`} className="button button-solid">
          {login.signInToBook}
        </a>
      ) : !profile ? (
        <a href="/account" className="button button-solid">
          {login.setupFirst}
        </a>
      ) : (
        <form action={requestMedicines} className="form">
          {prescriptions > 0 && (
            <a href="/records" className="notice">
              {getDictionary(lang).records.haveRecord}
            </a>
          )}
          <input type="hidden" name="place_id" value={place.id} />
          <PersonChoice title={t.forWhom} meLabel={t.me} profile={profile} family={family} />
          <PrescriptionPhoto label={t.photo} hint={t.photoHint} readyLabel={t.photoReady} tooBigLabel={t.errors.photo} />
          <label className="field">
            <span>{t.items}</span>
            <textarea name="items" rows={4} maxLength={1000} placeholder={t.itemsExample} />
          </label>
          <p className="notice">{t.noAdvice}</p>
          <button className="button button-solid">{t.send}</button>
        </form>
      )}
    </div>
  );
}
