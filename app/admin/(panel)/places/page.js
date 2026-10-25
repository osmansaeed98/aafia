import Link from "next/link";
import Alerts from "@/components/admin/Alerts";
import { getAdminSession } from "@/lib/admin/auth";
import { getDictionary, getLang } from "@/lib/i18n";

const KINDS = ["clinic", "hospital", "lab", "pharmacy"];

export default async function PlacesList({ searchParams }) {
  const lang = await getLang();
  const t = getDictionary(lang).admin;
  const { supabase } = await getAdminSession();
  const { q = "", kind = "", ok, error } = await searchParams;

  let query = supabase
    .from("places")
    .select("id, kind, name_ar, name_en, area_ar, area_en, is_active, doctors(count)")
    .order("name_ar");
  if (KINDS.includes(kind)) query = query.eq("kind", kind);
  const term = q.trim().replace(/[%,()]/g, " ");
  if (term) {
    query = query.or(
      ["name_ar", "name_en", "area_ar", "area_en"].map((c) => `${c}.ilike.%${term}%`).join(","),
    );
  }
  const { data: places = [] } = await query;

  return (
    <>
      <div className="title-row">
        <h1>{t.places.title}</h1>
        <Link href="/admin/places/new" className="button button-solid">
          {t.places.add}
        </Link>
      </div>
      <Alerts t={t} ok={ok} error={error} />

      <form className="search" role="search">
        <input name="q" defaultValue={q} placeholder={t.places.search} aria-label={t.places.search} />
        <select name="kind" defaultValue={kind} aria-label={t.fields.kind}>
          <option value="">{t.places.all}</option>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {t.kinds[k]}
            </option>
          ))}
        </select>
        <button className="button">{t.places.searchButton}</button>
      </form>

      {places.length === 0 ? (
        <p className="muted">{t.places.empty}</p>
      ) : (
        <ul className="rows">
          {places.map((p) => (
            <li key={p.id}>
              <Link href={`/admin/places/${p.id}`} className="row row-link">
                <span>
                  <strong>{lang === "en" ? p.name_en : p.name_ar}</strong>
                  <small className="muted">
                    {" "}
                    · {t.kinds[p.kind]} · {lang === "en" ? p.area_en : p.area_ar}
                  </small>
                </span>
                <span className={p.is_active ? "chip" : "chip chip-muted"}>
                  {p.is_active ? t.shown : t.hidden}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
