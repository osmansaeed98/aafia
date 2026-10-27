import { formatDay } from "@/lib/booking";
import { formatSudanPhone } from "@/lib/phone";
import { getDictionary, getLang } from "@/lib/i18n";
import { requirePatient } from "@/lib/patient/auth";
import { RELATIONS } from "@/lib/patient/relations";
import {
  addFamilyMember,
  deleteFamilyMember,
  deleteMyAccount,
  saveProfile,
  signOutPatient,
  updateFamilyMember,
} from "./actions";

export const metadata = { robots: { index: false } };


// Name, year of birth and sex: shared by the profile and family forms.
function PersonFields({ t, person = {} }) {
  return (
    <>
      <label className="field">
        <span>{t.name}</span>
        <input name="full_name" defaultValue={person.full_name ?? ""} placeholder={t.examples.name} required minLength={2} maxLength={100} />
      </label>
      <div className="pair">
        <label className="field">
          <span>
            {t.birthYear} <small>({t.optional})</small>
          </span>
          <input name="birth_year" inputMode="numeric" defaultValue={person.birth_year ?? ""} placeholder={t.examples.birthYear} dir="ltr" />
        </label>
        <label className="field">
          <span>
            {t.sex} <small>({t.optional})</small>
          </span>
          <select name="sex" defaultValue={person.sex ?? ""}>
            <option value="">{t.notSaid}</option>
            <option value="male">{t.sexes.male}</option>
            <option value="female">{t.sexes.female}</option>
          </select>
        </label>
      </div>
    </>
  );
}

function RelationField({ t, value = "" }) {
  return (
    <label className="field">
      <span>{t.relation}</span>
      <select name="relation" defaultValue={value} required>
        <option value="" disabled />
        {RELATIONS.map((r) => (
          <option key={r} value={r}>
            {t.relations[r]}
          </option>
        ))}
      </select>
    </label>
  );
}

export default async function Account({ searchParams }) {
  const lang = await getLang();
  const dict = getDictionary(lang);
  const t = dict.patient.account;
  const tb = dict.booking;
  const { supabase, user } = await requirePatient();
  const { ok, error } = await searchParams;
  const [{ data: profile }, { data: familyData }, { data: bookingsData }, { data: team }, { data: medicinesData }, { data: visitsData }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("family_members").select("*").order("created_at"),
    supabase
      .from("bookings")
      .select("id, queue_number, status, patient_name, sessions(session_date, starts_at, doctors(name_ar, name_en))")
      .eq("booked_by", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("team_members").select("role").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("pharmacy_requests")
      .select("id, status, patient_name, created_at, places(name_ar, name_en)")
      .eq("requested_by", user.id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("home_visit_requests")
      .select("id, status, patient_name, preferred_date, places(name_ar, name_en)")
      .eq("requested_by", user.id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  const bookings = bookingsData ?? [];
  const medicines = medicinesData ?? [];
  const visits = visitsData ?? [];
  const tp = dict.pharmacy;
  const tv = dict.visits;
  const family = familyData ?? [];

  const alert = error ? (
    <p className="alert alert-error" role="alert">
      {t.errors[error] ?? t.errors.generic}
    </p>
  ) : ok ? (
    <p className="alert alert-ok" role="status">
      {ok === "deleted" ? t.deleted : t.saved}
    </p>
  ) : null;

  // First visit: just ask for a name.
  if (!profile) {
    return (
      <div className="admin narrow">
        {team && (
          <a href="/clinic" className="button button-solid clinic-link">
            {tb.clinicDashboard}
          </a>
        )}
        <h1>{t.setupTitle}</h1>
        <p className="muted">{t.setupHint}</p>
        {alert}
        <form action={saveProfile} className="form">
          <PersonFields t={t} />
          <button className="button button-solid">{t.save}</button>
        </form>
      </div>
    );
  }

  return (
    <div className="admin">
      <h1>
        {t.hello} {profile.full_name}
      </h1>
      {alert}

      {team && (
        <a href="/clinic" className="button button-solid clinic-link">
          {tb.clinicDashboard}
        </a>
      )}

      <a href="/records" className="button records-link">
        {dict.records.title}
      </a>

      <section className="card">
        <div className="title-row">
          <h2>{tb.myBookings}</h2>
          <a href="/book" className="button button-small">
            {tb.bookNew}
          </a>
        </div>
        {bookings.length === 0 ? (
          <p className="muted">{tb.noBookings}</p>
        ) : (
          <ul className="rows">
            {bookings.map((b) => (
              <li key={b.id}>
                <a href={`/bookings/${b.id}`} className="row row-link">
                  <span>
                    <strong>
                      {tb.yourNumber} {b.queue_number}
                    </strong>
                    <small className="muted">
                      {" "}
                      · {lang === "en" ? b.sessions?.doctors?.name_en : b.sessions?.doctors?.name_ar} ·{" "}
                      {formatDay(b.sessions?.session_date, lang)} · {b.patient_name}
                    </small>
                  </span>
                  <span className={["booked", "arrived"].includes(b.status) ? "chip" : "chip chip-muted"}>
                    {tb.statuses[b.status]}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {medicines.length > 0 && (
        <section className="card">
          <h2>{tp.myRequests}</h2>
          <ul className="rows">
            {medicines.map((m) => (
              <li key={m.id}>
                <a href={`/requests/medicines/${m.id}`} className="row row-link">
                  <span>
                    <strong>{lang === "en" ? m.places?.name_en : m.places?.name_ar}</strong>
                    <small className="muted"> · {m.patient_name}</small>
                  </span>
                  <span className={["sent", "available", "partial"].includes(m.status) ? "chip" : "chip chip-muted"}>
                    {tp.statuses[m.status]}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {visits.length > 0 && (
        <section className="card">
          <h2>{tv.myRequests}</h2>
          <ul className="rows">
            {visits.map((v) => (
              <li key={v.id}>
                <a href={`/requests/visits/${v.id}`} className="row row-link">
                  <span>
                    <strong>{lang === "en" ? v.places?.name_en : v.places?.name_ar}</strong>
                    <small className="muted">
                      {" "}
                      · {formatDay(v.preferred_date, lang)} · {v.patient_name}
                    </small>
                  </span>
                  <span className={["requested", "confirmed"].includes(v.status) ? "chip" : "chip chip-muted"}>
                    {tv.statuses[v.status]}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <details>
          <summary className="row">
            <span>
              <strong>{t.details}</strong>
              {user.phone && (
                <small className="muted" dir="ltr">
                  {" "}
                  · {formatSudanPhone(user.phone)}
                </small>
              )}
            </span>
            <span className="button button-small">{t.edit}</span>
          </summary>
          <form action={saveProfile} className="form">
            <PersonFields t={t} person={profile} />
            <button className="button button-solid">{t.save}</button>
          </form>
        </details>
      </section>

      <section className="card">
        <h2>{t.family}</h2>
        <p className="muted">{t.familyHint}</p>
        {family.length === 0 ? (
          <p className="muted">{t.noFamily}</p>
        ) : (
          <ul className="rows">
            {family.map((m) => (
              <li key={m.id} className="card">
                <details>
                  <summary className="row">
                    <span>
                      <strong>{m.full_name}</strong>
                      <small className="muted">
                        {" "}
                        · {t.relations[m.relation]}
                        {m.birth_year && ` · ${m.birth_year}`}
                      </small>
                    </span>
                    <span className="button button-small">{t.edit}</span>
                  </summary>
                  <form action={updateFamilyMember} className="form">
                    <input type="hidden" name="id" value={m.id} />
                    <RelationField t={t} value={m.relation} />
                    <PersonFields t={t} person={m} />
                    <button className="button button-solid">{t.save}</button>
                  </form>
                  <details className="confirm-delete">
                    <summary>{t.delete}</summary>
                    <form action={deleteFamilyMember}>
                      <input type="hidden" name="id" value={m.id} />
                      <p>{t.confirmDelete}</p>
                      <button className="button button-danger">{t.delete}</button>
                    </form>
                  </details>
                </details>
              </li>
            ))}
          </ul>
        )}
        <details className="add-more">
          <summary className="button button-solid">{t.addFamily}</summary>
          <form action={addFamilyMember} className="form">
            <RelationField t={t} />
            <PersonFields t={t} />
            <button className="button button-solid">{t.addFamily}</button>
          </form>
        </details>
      </section>

      <form action={signOutPatient}>
        <button className="button">{t.signOut}</button>
      </form>

      <details className="confirm-delete delete-account">
        <summary>{t.deleteAccount}</summary>
        <form action={deleteMyAccount}>
          <p>{t.deleteAccountHint}</p>
          <p>
            <strong>{t.confirmDeleteAccount}</strong>
          </p>
          <button className="button button-danger">{t.deleteAccount}</button>
        </form>
      </details>
    </div>
  );
}
