import { saveDoctor } from "@/app/admin/(panel)/actions";
import { Check, Field } from "./Field";

export default function DoctorForm({ t, lang, doctor, placeId, specialties }) {
  const f = t.fields;
  const d = doctor ?? { is_active: true };
  return (
    <form action={saveDoctor} className="form">
      {d.id && <input type="hidden" name="id" value={d.id} />}
      <input type="hidden" name="place_id" value={d.place_id ?? placeId} />
      <input type="hidden" name="back" value={d.id ? `/admin/doctors/${d.id}` : `/admin/places/${placeId}`} />
      <Field label={f.nameAr} name="name_ar" defaultValue={d.name_ar} required dir="rtl" />
      <Field label={f.nameEn} name="name_en" defaultValue={d.name_en} required dir="ltr" />
      <label className="field">
        <span>{f.specialty}</span>
        <select name="specialty_id" defaultValue={d.specialty_id ?? ""} required>
          <option value="" disabled />
          {specialties.map((s) => (
            <option key={s.id} value={s.id}>
              {lang === "en" ? s.name_en : `${s.name_ar} – ${s.name_en}`}
            </option>
          ))}
        </select>
      </label>
      <Field label={f.fee} optional={f.optional} name="fee_sdg" inputMode="numeric" defaultValue={d.fee_sdg ?? ""} dir="ltr" />
      <Check label={f.isActive} name="is_active" defaultChecked={d.is_active} />
      <button className="button button-solid">{d.id ? t.save : t.doctors.add}</button>
    </form>
  );
}
