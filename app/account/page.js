import { formatSudanPhone } from "@/lib/phone";
import { getDictionary, getLang } from "@/lib/i18n";
import { requirePatient } from "@/lib/patient/auth";
import { RELATIONS } from "@/lib/patient/relations";
import {
  addFamilyMember,
  deleteFamilyMember,
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
  const t = getDictionary(await getLang()).patient.account;
  const { supabase, user } = await requirePatient();
  const { ok, error } = await searchParams;
  const [{ data: profile }, { data: familyData }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("family_members").select("*").order("created_at"),
  ]);
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
    </div>
  );
}
