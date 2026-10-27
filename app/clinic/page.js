import AutoRefresh from "@/components/AutoRefresh";
import { fill, formatDay } from "@/lib/booking";
import { formatDateTime } from "@/lib/datetime";
import { getStaff, khartoumToday } from "@/lib/clinic/auth";
import { formatClock } from "@/lib/format";
import { getDictionary, getLang } from "@/lib/i18n";
import { openSession } from "./actions";

export const metadata = { robots: { index: false } };

export default async function Clinic({ searchParams }) {
  const lang = await getLang();
  const t = getDictionary(lang).clinic;
  const { supabase, team } = await getStaff();
  const { place: placeParam, error } = await searchParams;

  if (!team) {
    return (
      <div className="admin narrow">
        <h1>{t.title}</h1>
        <p className="alert alert-warn">{t.noAccess}</p>
      </div>
    );
  }

  // Reception: their clinic. Admins: choose any place.
  let places = [];
  let placeId = team.place_id;
  if (team.role === "admin") {
    const { data } = await supabase.from("places").select("id, name_ar, name_en").order("name_ar");
    places = data ?? [];
    placeId = Number(placeParam) || places[0]?.id || null;
  }
  const today = khartoumToday();

  const { data: place } = placeId
    ? await supabase.from("places").select("kind, home_visits").eq("id", placeId).maybeSingle()
    : { data: null };
  const isPharmacy = place?.kind === "pharmacy";
  const [{ data: todayData }, { data: medicinesData }, { data: visitsData }] = await Promise.all([
    placeId && !isPharmacy ? supabase.rpc("clinic_today", { p_place_id: placeId }) : { data: [] },
    isPharmacy
      ? supabase
          .from("pharmacy_requests")
          .select("id, status, patient_name, created_at")
          .eq("place_id", placeId)
          .in("status", ["sent", "available", "partial"])
          .order("created_at")
      : { data: [] },
    place?.home_visits
      ? supabase
          .from("home_visit_requests")
          .select("id, status, patient_name, preferred_date, preferred_time, area")
          .eq("place_id", placeId)
          .in("status", ["requested", "confirmed"])
          .order("preferred_date")
      : { data: [] },
  ]);
  const cards = todayData ?? [];
  const medicines = medicinesData ?? [];
  const visits = visitsData ?? [];
  const dict = getDictionary(lang);

  return (
    <div className="admin">
      <h1>{t.title}</h1>
      {team.role === "admin" && places.length > 0 && (
        <form className="search">
          <select name="place" defaultValue={placeId ?? ""} aria-label={t.choosePlace}>
            {places.map((p) => (
              <option key={p.id} value={p.id}>
                {lang === "en" ? p.name_en : p.name_ar}
              </option>
            ))}
          </select>
          <button className="button">{t.choosePlace}</button>
        </form>
      )}
      {error && <p className="alert alert-error">{t.error}</p>}
      {(isPharmacy || place?.home_visits) && <AutoRefresh seconds={60} />}

      {isPharmacy && (
        <section>
          <h2>{t.medicines}</h2>
          {medicines.length === 0 ? (
            <p className="muted">{t.noRequests}</p>
          ) : (
            <ul className="rows">
              {medicines.map((m) => (
                <li key={m.id}>
                  <a href={`/clinic/medicines/${m.id}`} className="row row-link">
                    <span>
                      <strong>{m.patient_name}</strong>
                      <small className="muted"> · {formatDateTime(m.created_at, lang)}</small>
                    </span>
                    <span className={m.status === "sent" ? "chip chip-new" : "chip"}>{dict.pharmacy.statuses[m.status]}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {place?.home_visits && (
        <section>
          <h2>{t.visits}</h2>
          {visits.length === 0 ? (
            <p className="muted">{t.noRequests}</p>
          ) : (
            <ul className="rows">
              {visits.map((v) => (
                <li key={v.id}>
                  <a href={`/clinic/visits/${v.id}`} className="row row-link">
                    <span>
                      <strong>{v.patient_name}</strong>
                      <small className="muted">
                        {" "}
                        · {formatDay(v.preferred_date, lang)} · {dict.visits.times[v.preferred_time]} · {v.area}
                      </small>
                    </span>
                    <span className={v.status === "requested" ? "chip chip-new" : "chip"}>{dict.visits.statuses[v.status]}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {!isPharmacy && (
      <>
      <h2>{t.today}</h2>
      {cards.length === 0 ? (
        <p className="muted">{t.noSessions}</p>
      ) : (
        <ul className="rows">
          {cards.map((c) => (
            <li key={`${c.doctor_id}-${c.starts_at}`} className="card session-card">
              <div className="row">
                <span>
                  <strong>{lang === "en" ? c.doctor_name_en : c.doctor_name_ar}</strong>
                  <small className="muted">
                    {" "}
                    · {formatClock(c.starts_at, lang)} – {formatClock(c.ends_at, lang)}
                    {c.session_id && ` · ${fill(t.numbers, { n: c.numbers_taken })}`}
                  </small>
                </span>
                {c.session_id && <span className="chip">{t.statuses[c.status]}</span>}
              </div>
              {c.session_id ? (
                <a href={`/clinic/sessions/${c.session_id}`} className="button button-solid">
                  {t.open}
                </a>
              ) : (
                <form action={openSession}>
                  <input type="hidden" name="doctor_id" value={c.doctor_id} />
                  <input type="hidden" name="date" value={today} />
                  <input type="hidden" name="starts" value={c.starts_at} />
                  <button className="button button-solid">{t.open}</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      </>
      )}
    </div>
  );
}
