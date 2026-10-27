import Alerts from "@/components/admin/Alerts";
import { ConfirmDelete, Field } from "@/components/admin/Field";
import { getAdminSession } from "@/lib/admin/auth";
import { getDictionary, getLang } from "@/lib/i18n";
import { deleteSpecialty, saveSpecialty } from "../actions";

export default async function Specialties({ searchParams }) {
  const t = getDictionary(await getLang()).admin;
  const { supabase } = await getAdminSession();
  const { ok, error } = await searchParams;
  const x = t.examples;
  const { data: specialties = [] } = await supabase
    .from("specialties")
    .select("id, name_ar, name_en")
    .order("name_ar");

  return (
    <>
      <h1>{t.specialties.title}</h1>
      <p className="muted">{t.specialties.hint}</p>
      <Alerts t={t} ok={ok} error={error} />

      <details className="add-more card">
        <summary className="button button-solid">{t.specialties.add}</summary>
        <form action={saveSpecialty} className="form">
          <Field label={t.fields.nameAr} placeholder={x.specialtyAr} name="name_ar" required dir="rtl" />
          <Field label={t.fields.nameEn} placeholder={x.specialtyEn} name="name_en" required dir="ltr" />
          <button className="button button-solid">{t.save}</button>
        </form>
      </details>

      <ul className="rows">
        {specialties.map((s) => (
          <li key={s.id} className="card">
            <details>
              <summary className="row">
                <span>
                  <strong>{s.name_ar}</strong>
                  <br />
                  <small className="muted" dir="ltr">
                    {s.name_en}
                  </small>
                </span>
                <span className="button button-small">{t.edit}</span>
              </summary>
              <form action={saveSpecialty} className="form">
                <input type="hidden" name="id" value={s.id} />
                <Field label={t.fields.nameAr} name="name_ar" defaultValue={s.name_ar} required dir="rtl" />
                <Field label={t.fields.nameEn} name="name_en" defaultValue={s.name_en} required dir="ltr" />
                <button className="button button-solid">{t.save}</button>
              </form>
              <ConfirmDelete t={t} action={deleteSpecialty}>
                <input type="hidden" name="id" value={s.id} />
              </ConfirmDelete>
            </details>
          </li>
        ))}
      </ul>
    </>
  );
}
