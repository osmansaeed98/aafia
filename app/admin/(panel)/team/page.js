import Alerts from "@/components/admin/Alerts";
import { Field } from "@/components/admin/Field";
import { getAdminSession } from "@/lib/admin/auth";
import { formatSudanPhone } from "@/lib/phone";
import { getDictionary, getLang } from "@/lib/i18n";
import { addTeamMember, removeTeamMember } from "../actions";

export default async function Team({ searchParams }) {
  const lang = await getLang();
  const t = getDictionary(lang).admin;
  const { supabase, user } = await getAdminSession();
  const { ok, error } = await searchParams;
  const x = t.examples;
  const [{ data: membersData }, { data: placesData }] = await Promise.all([
    supabase.rpc("list_team_members"),
    supabase.from("places").select("id, name_ar, name_en").order("name_ar"),
  ]);
  const places = placesData ?? [];
  const members = membersData ?? [];
  const placeName = (id) => {
    const p = places.find((x) => x.id === id);
    return p ? (lang === "en" ? p.name_en : p.name_ar) : "";
  };

  return (
    <>
      <h1>{t.team.title}</h1>
      <Alerts t={t} ok={ok} error={error} />

      <ul className="rows">
        {members.map((m) => (
          <li key={m.user_id} className="row card">
            <span>
              <strong dir="ltr">{m.email || formatSudanPhone(m.phone)}</strong>
              <small className="muted">
                {" "}
                · {t.team.roles[m.role]}
                {m.place_id && ` · ${placeName(m.place_id)}`}
                {m.user_id === user.id && ` · ${t.team.you}`}
              </small>
            </span>
            {m.user_id !== user.id && (
              <form action={removeTeamMember}>
                <input type="hidden" name="user_id" value={m.user_id} />
                <button className="button button-small">{t.team.remove}</button>
              </form>
            )}
          </li>
        ))}
      </ul>

      <section className="card">
        <h2>{t.team.add}</h2>
        <p className="muted">{t.team.hint}</p>
        <form action={addTeamMember} className="form">
          <Field label={t.team.email} placeholder={x.contact} name="email" required dir="ltr" />
          <label className="field">
            <span>{t.team.role}</span>
            <select name="role" defaultValue="admin">
              <option value="admin">{t.team.roles.admin}</option>
              <option value="reception">{t.team.roles.reception}</option>
            </select>
          </label>
          <label className="field">
            <span>{t.team.place}</span>
            <select name="place_id" defaultValue="">
              <option value="">–</option>
              {places.map((p) => (
                <option key={p.id} value={p.id}>
                  {lang === "en" ? p.name_en : p.name_ar}
                </option>
              ))}
            </select>
          </label>
          <button className="button button-solid">{t.team.add}</button>
        </form>
      </section>
    </>
  );
}
