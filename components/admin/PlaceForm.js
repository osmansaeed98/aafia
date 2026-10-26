import { savePlace } from "@/app/admin/(panel)/actions";
import { Check, Field } from "./Field";

const KINDS = ["clinic", "hospital", "lab", "pharmacy"];

export default function PlaceForm({ t, place }) {
  const f = t.fields;
  const p = place ?? {};
  return (
    <form action={savePlace} className="form">
      {p.id && <input type="hidden" name="id" value={p.id} />}
      <label className="field">
        <span>{f.kind}</span>
        <select name="kind" defaultValue={p.kind ?? "clinic"} required>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {t.kinds[k]}
            </option>
          ))}
        </select>
      </label>
      <Field label={f.nameAr} name="name_ar" defaultValue={p.name_ar} required dir="rtl" />
      <Field label={f.nameEn} name="name_en" defaultValue={p.name_en} required dir="ltr" />
      <Field label={f.areaAr} name="area_ar" defaultValue={p.area_ar} required dir="rtl" />
      <Field label={f.areaEn} name="area_en" defaultValue={p.area_en} required dir="ltr" />
      <Field label={f.addressAr} optional={f.optional} name="address_ar" defaultValue={p.address_ar ?? ""} dir="rtl" />
      <Field label={f.addressEn} optional={f.optional} name="address_en" defaultValue={p.address_en ?? ""} dir="ltr" />
      <Field label={f.phone} optional={f.optional} name="phone" type="tel" defaultValue={p.phone ?? ""} dir="ltr" />
      <div className="pair">
        <Field label={f.latitude} optional={f.optional} name="latitude" inputMode="decimal" defaultValue={p.latitude ?? ""} dir="ltr" />
        <Field label={f.longitude} optional={f.optional} name="longitude" inputMode="decimal" defaultValue={p.longitude ?? ""} dir="ltr" />
      </div>
      <small className="hint">{f.mapsHint}</small>
      <Check label={f.homeVisits} name="home_visits" defaultChecked={p.home_visits} />
      <Check label={f.open24h} name="open_24h" defaultChecked={p.open_24h} />
      <Check label={f.isActive} name="is_active" defaultChecked={p.is_active} />
      <button className="button button-solid">{t.save}</button>
    </form>
  );
}
