import Alerts from "@/components/admin/Alerts";
import { Check, ConfirmDelete, Field } from "@/components/admin/Field";
import { getAdminSession } from "@/lib/admin/auth";
import { getDictionary, getLang } from "@/lib/i18n";
import { deleteEmergency, saveEmergency } from "../actions";

function EmergencyForm({ t, dept }) {
  const f = t.fields;
  const d = dept ?? { open_24h: true, is_active: true, sort_order: 0 };
  return (
    <form action={saveEmergency} className="form">
      {d.id && <input type="hidden" name="id" value={d.id} />}
      <Field label={f.nameAr} name="name_ar" defaultValue={d.name_ar} required dir="rtl" />
      <Field label={f.nameEn} name="name_en" defaultValue={d.name_en} required dir="ltr" />
      <Field label={f.areaAr} name="area_ar" defaultValue={d.area_ar} required dir="rtl" />
      <Field label={f.areaEn} name="area_en" defaultValue={d.area_en} required dir="ltr" />
      <Field label={f.phone} name="phone" type="tel" defaultValue={d.phone} required dir="ltr" />
      <div className="pair">
        <Field label={f.latitude} optional={f.optional} name="latitude" inputMode="decimal" defaultValue={d.latitude ?? ""} dir="ltr" />
        <Field label={f.longitude} optional={f.optional} name="longitude" inputMode="decimal" defaultValue={d.longitude ?? ""} dir="ltr" />
      </div>
      <small className="hint">{f.mapsHint}</small>
      <Field label={f.sortOrder} name="sort_order" inputMode="numeric" defaultValue={d.sort_order} dir="ltr" />
      <Check label={f.open24h} name="open_24h" defaultChecked={d.open_24h} />
      <Check label={f.isActive} name="is_active" defaultChecked={d.is_active} />
      <button className="button button-solid">{t.save}</button>
    </form>
  );
}

export default async function EmergencyAdmin({ searchParams }) {
  const lang = await getLang();
  const t = getDictionary(lang).admin;
  const { supabase } = await getAdminSession();
  const { ok, error } = await searchParams;
  const { data: depts = [] } = await supabase
    .from("emergency_departments")
    .select("*")
    .order("sort_order")
    .order("name_ar");

  return (
    <>
      <h1>{t.emergency.title}</h1>
      <p className="alert alert-warn">{t.emergency.hint}</p>
      <Alerts t={t} ok={ok} error={error} />

      <details className="add-more card">
        <summary className="button button-solid">{t.emergency.add}</summary>
        <EmergencyForm t={t} />
      </details>

      {depts.length === 0 && <p className="muted">{t.emergency.empty}</p>}
      <ul className="rows">
        {depts.map((d) => (
          <li key={d.id} className="card">
            <details>
              <summary className="row">
                <span>
                  <strong>{lang === "en" ? d.name_en : d.name_ar}</strong>
                  <small className="muted" dir="ltr">
                    {" "}
                    · {d.phone}
                  </small>
                </span>
                <span className={d.is_active ? "chip" : "chip chip-muted"}>
                  {d.is_active ? t.shown : t.hidden}
                </span>
              </summary>
              <EmergencyForm t={t} dept={d} />
              <ConfirmDelete t={t} action={deleteEmergency}>
                <input type="hidden" name="id" value={d.id} />
              </ConfirmDelete>
            </details>
          </li>
        ))}
      </ul>
    </>
  );
}
