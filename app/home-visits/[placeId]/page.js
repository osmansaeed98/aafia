import { notFound } from "next/navigation";
import LocationButton from "@/components/LocationButton";
import PersonChoice from "@/components/PersonChoice";
import { formatDay } from "@/lib/booking";
import { khartoumDate } from "@/lib/datetime";
import { getDictionary, getLang } from "@/lib/i18n";
import { patientContext } from "@/lib/patient/context";
import { createSupabasePublic } from "@/lib/supabase/server";
import { requestHomeVisit } from "../actions";

export default async function HomeVisit({ params, searchParams }) {
  const lang = await getLang();
  const t = getDictionary(lang).visits;
  const { placeId } = await params;
  const { error } = await searchParams;
  if (!/^\d+$/.test(placeId)) notFound();
  const { data: place } = await createSupabasePublic()
    .from("places")
    .select("id, name_ar, name_en, area_ar, area_en")
    .eq("id", placeId)
    .eq("home_visits", true)
    .maybeSingle();
  if (!place) notFound();
  const { user, profile, family } = await patientContext();
  const login = getDictionary(lang).book;
  const days = Array.from({ length: 14 }, (_, i) => khartoumDate(i));

  return (
    <div className="admin narrow">
      <h1>{t.title}</h1>
      <p>
        <strong>{lang === "en" ? place.name_en : place.name_ar}</strong>
        <span className="muted"> · {lang === "en" ? place.area_en : place.area_ar}</span>
      </p>
      <p className="muted">{t.subtitle}</p>
      <p className="notice">{t.emergencyNote}</p>
      {error && (
        <p className="alert alert-error" role="alert">
          {t.errors[error] ?? t.errors.generic}
        </p>
      )}
      {!user ? (
        <a href={`/login?next=${encodeURIComponent(`/home-visits/${place.id}`)}`} className="button button-solid">
          {login.signInToBook}
        </a>
      ) : !profile ? (
        <a href="/account" className="button button-solid">
          {login.setupFirst}
        </a>
      ) : (
        <form action={requestHomeVisit} className="form">
          <input type="hidden" name="place_id" value={place.id} />
          <PersonChoice title={t.forWhom} meLabel={t.me} profile={profile} family={family} />
          <label className="field">
            <span>{t.reason}</span>
            <textarea name="reason" rows={3} required minLength={3} maxLength={300} placeholder={t.reasonExample} />
          </label>
          <div className="pair">
            <label className="field">
              <span>{t.day}</span>
              <select name="date" defaultValue={days[1]} required>
                {days.map((d) => (
                  <option key={d} value={d}>
                    {formatDay(d, lang)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{t.time}</span>
              <select name="time" defaultValue="evening" required>
                {["morning", "afternoon", "evening"].map((k) => (
                  <option key={k} value={k}>
                    {t.times[k]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            <span>{t.area}</span>
            <input name="area" required minLength={2} maxLength={100} placeholder={t.areaExample} />
          </label>
          <label className="field">
            <span>{t.address}</span>
            <textarea name="address" rows={2} required minLength={5} maxLength={300} placeholder={t.addressExample} />
          </label>
          <LocationButton label={t.location} hint={t.locationHint} savedLabel={t.locationSaved} failedLabel={t.locationFailed} />
          <p className="muted">{t.cash}</p>
          <button className="button button-solid">{t.send}</button>
        </form>
      )}
    </div>
  );
}
