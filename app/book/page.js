import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { getDictionary, getLang } from "@/lib/i18n";
import { createSupabasePublic } from "@/lib/supabase/server";

export const metadata = { title: "احجز | Aafia" };

// Clinics and hospitals only for now (labs, pharmacies and home visits
// come in a later milestone).
const BOOKABLE = ["clinic", "hospital"];

export default async function BookList({ searchParams }) {
  const lang = await getLang();
  const t = getDictionary(lang).book;
  const { q = "", specialty = "" } = await searchParams;
  const supabase = createSupabasePublic();

  const [{ data: doctorsData }, { data: specialtiesData }] = await Promise.all([
    supabase
      .from("doctors")
      .select("id, name_ar, name_en, fee_sdg, specialty_id, specialties(name_ar, name_en), places!inner(name_ar, name_en, area_ar, area_en, kind)")
      .in("places.kind", BOOKABLE)
      .eq("is_lab_desk", false)
      .order("name_ar")
      .limit(500),
    supabase.from("specialties").select("id, name_ar, name_en").order("name_ar"),
  ]);
  const specialties = specialtiesData ?? [];
  const term = q.trim().toLowerCase();
  const doctors = (doctorsData ?? []).filter(
    (d) =>
      (!specialty || String(d.specialty_id) === specialty) &&
      (!term ||
        [d.name_ar, d.name_en, d.places.name_ar, d.places.name_en, d.places.area_ar, d.places.area_en]
          .some((v) => String(v ?? "").toLowerCase().includes(term))),
  );

  return (
    <div className="admin">
      <h1>{t.title}</h1>
      <p className="muted">{t.subtitle}</p>
      <form className="search" role="search">
        <input name="q" defaultValue={q} placeholder={t.search} aria-label={t.search} />
        <select name="specialty" defaultValue={specialty} aria-label={t.allSpecialties}>
          <option value="">{t.allSpecialties}</option>
          {specialties.map((s) => (
            <option key={s.id} value={s.id}>
              {lang === "en" ? s.name_en : `${s.name_ar} – ${s.name_en}`}
            </option>
          ))}
        </select>
        <button className="button">{t.searchButton}</button>
      </form>

      {doctors.length === 0 ? (
        <p className="muted">{t.empty}</p>
      ) : (
        <ul className="rows">
          {doctors.map((d) => (
            <li key={d.id}>
              <Link href={`/book/${d.id}`} className="row row-link doctor-row">
                <span>
                  <strong>{lang === "en" ? d.name_en : d.name_ar}</strong>
                  <span className="specialty">
                    {lang === "en" ? (
                      d.specialties?.name_en
                    ) : (
                      <>
                        {d.specialties?.name_ar}
                        <small>{d.specialties?.name_en}</small>
                      </>
                    )}
                  </span>
                  <small className="muted">
                    {lang === "en" ? d.places.name_en : d.places.name_ar} ·{" "}
                    {lang === "en" ? d.places.area_en : d.places.area_ar}
                  </small>
                </span>
                <span className="chip">{d.fee_sdg === null ? t.noFee : formatMoney(d.fee_sdg, lang)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
