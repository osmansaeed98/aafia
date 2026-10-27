import { saveLabTest } from "@/app/admin/(panel)/actions";
import { Check, Field } from "./Field";

export default function LabTestForm({ t, placeId, back, test }) {
  const l = t.labTests;
  const v = test ?? { is_active: true, sort_order: 0 };
  return (
    <form action={saveLabTest} className="form">
      {v.id && <input type="hidden" name="id" value={v.id} />}
      <input type="hidden" name="place_id" value={placeId} />
      <input type="hidden" name="back" value={back} />
      <Field label={t.fields.nameAr} name="name_ar" defaultValue={v.name_ar} placeholder={l.nameExampleAr} required dir="rtl" />
      <Field label={t.fields.nameEn} name="name_en" defaultValue={v.name_en} placeholder={l.nameExampleEn} required dir="ltr" />
      <Field label={l.price} optional={t.fields.optional} name="price_sdg" inputMode="numeric" defaultValue={v.price_sdg ?? ""} placeholder="8000" dir="ltr" />
      <Field label={l.notesAr} optional={t.fields.optional} name="notes_ar" defaultValue={v.notes_ar ?? ""} placeholder={l.notesExample} dir="rtl" />
      <Field label={l.notesEn} optional={t.fields.optional} name="notes_en" defaultValue={v.notes_en ?? ""} dir="ltr" />
      <Field label={t.fields.sortOrder} name="sort_order" inputMode="numeric" defaultValue={v.sort_order} dir="ltr" />
      <Check label={t.fields.isActive} name="is_active" defaultChecked={v.is_active} />
      <button className="button button-solid">{t.save}</button>
    </form>
  );
}
