import { notFound } from "next/navigation";
import { fill, formatDay } from "@/lib/booking";
import { formatClock, formatMoney, telHref } from "@/lib/format";
import { getDictionary, getLang } from "@/lib/i18n";
import { createSupabasePublic, createSupabaseServer } from "@/lib/supabase/server";
import { bookNumber } from "../actions";

export default async function BookDoctor({ params, searchParams }) {
  const lang = await getLang();
  const t = getDictionary(lang).book;
  const { doctorId } = await params;
  const { error } = await searchParams;
  if (!/^\d+$/.test(doctorId)) notFound();

  const publicDb = createSupabasePublic();
  const [{ data: doctor }, { data: sessionsData }] = await Promise.all([
    publicDb
      .from("doctors")
      .select("id, name_ar, name_en, fee_sdg, specialties(name_ar, name_en), places(name_ar, name_en, area_ar, area_en, address_ar, address_en, phone, latitude, longitude)")
      .eq("id", doctorId)
      .maybeSingle(),
    publicDb.rpc("available_sessions", { p_doctor_id: Number(doctorId), p_days: 7 }),
  ]);
  if (!doctor) notFound();
  const sessions = sessionsData ?? [];
  const place = doctor.places;

  // Who's signed in, and who they can book for.
  const db = await createSupabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  let profile = null;
  let family = [];
  if (user) {
    const [{ data: p }, { data: f }] = await Promise.all([
      db.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle(),
      db.from("family_members").select("id, full_name, relation").order("created_at"),
    ]);
    profile = p;
    family = f ?? [];
  }

  const mapsQuery = place.latitude !== null ? `${place.latitude},${place.longitude}` : `${place.name_en}, ${place.area_en}, Khartoum`;
  const bookable = (s) => s.status !== "cancelled" && s.status !== "closed" && s.numbers_taken < s.daily_limit;

  return (
    <div className="admin">
      <h1>{lang === "en" ? doctor.name_en : doctor.name_ar}</h1>
      <p className="specialty">
        {lang === "en" ? (
          doctor.specialties?.name_en
        ) : (
          <>
            {doctor.specialties?.name_ar}
            <small>{doctor.specialties?.name_en}</small>
          </>
        )}
      </p>

      <section className="card">
        <p>
          <strong>{lang === "en" ? place.name_en : place.name_ar}</strong>
          <br />
          <span className="muted">
            {lang === "en" ? place.area_en : place.area_ar}
            {(lang === "en" ? place.address_en : place.address_ar) && ` · ${lang === "en" ? place.address_en : place.address_ar}`}
          </span>
        </p>
        <p className="fee-line">
          {t.fee}: <strong>{doctor.fee_sdg === null ? t.noFee : formatMoney(doctor.fee_sdg, lang)}</strong>
          <br />
          <span className="muted">{t.cash}</span>
        </p>
        <div className="dept-actions">
          <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`} className="button">
            {t.directions}
          </a>
          {place.phone && (
            <a href={telHref(place.phone)} className="button">
              {t.call}
            </a>
          )}
        </div>
      </section>

      {error && (
        <p className="alert alert-error" role="alert">
          {t.errors[error] ?? t.errors.generic}
        </p>
      )}

      <form action={bookNumber} className="form">
        <input type="hidden" name="doctor_id" value={doctor.id} />
        <h2>{t.choose}</h2>
        {sessions.length === 0 ? (
          <p className="muted">{t.noSessions}</p>
        ) : (
          <div className="slots">
            {sessions.map((s, i) => {
              const open = bookable(s);
              const label =
                s.status === "cancelled"
                  ? t.cancelled
                  : !open
                    ? t.full
                    : s.status === "delayed"
                      ? fill(t.delayed, { n: s.delay_minutes })
                      : fill(t.numbersLeft, { n: s.daily_limit - s.numbers_taken });
              return (
                <label key={`${s.session_date}-${s.starts_at}`} className={open ? "slot" : "slot slot-off"}>
                  <input
                    type="radio"
                    name="session"
                    value={`${s.session_date}|${s.starts_at}`}
                    disabled={!open}
                    defaultChecked={open && i === sessions.findIndex(bookable)}
                    required
                  />
                  <span>
                    <strong>{formatDay(s.session_date, lang)}</strong>
                    <span>
                      {formatClock(s.starts_at, lang)} – {formatClock(s.ends_at, lang)}
                    </span>
                    <small>{label}</small>
                  </span>
                </label>
              );
            })}
          </div>
        )}

        {sessions.some(bookable) &&
          (!user ? (
            <a href={`/login?next=${encodeURIComponent(`/book/${doctor.id}`)}`} className="button button-solid">
              {t.signInToBook}
            </a>
          ) : !profile ? (
            <a href="/account" className="button button-solid">
              {t.setupFirst}
            </a>
          ) : (
            <>
              <h2>{t.forWhom}</h2>
              <div className="slots">
                <label className="slot">
                  <input type="radio" name="who" value="me" defaultChecked />
                  <span>
                    <strong>{t.me}</strong>
                    <small>{profile.full_name}</small>
                  </span>
                </label>
                {family.map((m) => (
                  <label key={m.id} className="slot">
                    <input type="radio" name="who" value={m.id} />
                    <span>
                      <strong>{m.full_name}</strong>
                    </span>
                  </label>
                ))}
              </div>
              <button className="button button-solid">{t.book}</button>
            </>
          ))}
      </form>
    </div>
  );
}
