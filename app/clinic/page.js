import { fill } from "@/lib/booking";
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
    const { data } = await supabase.from("places").select("id, name_ar, name_en").in("kind", ["clinic", "hospital"]).order("name_ar");
    places = data ?? [];
    placeId = Number(placeParam) || places[0]?.id || null;
  }
  const today = khartoumToday();

  const { data: todayData } = placeId ? await supabase.rpc("clinic_today", { p_place_id: placeId }) : { data: [] };
  const cards = todayData ?? [];

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
    </div>
  );
}
