import Link from "next/link";
import { getDictionary, getLang } from "@/lib/i18n";
import { createSupabasePublic } from "@/lib/supabase/server";

export const metadata = { title: "زيارة منزلية | Aafia" };

export default async function HomeVisits() {
  const lang = await getLang();
  const t = getDictionary(lang).visits;
  const kinds = getDictionary(lang).admin.kinds;
  const { data } = await createSupabasePublic()
    .from("places")
    .select("id, kind, name_ar, name_en, area_ar, area_en")
    .eq("home_visits", true)
    .order("name_ar");
  const places = data ?? [];

  return (
    <div className="admin">
      <h1>{t.title}</h1>
      <p className="muted">{t.subtitle}</p>
      <p className="notice">{t.emergencyNote}</p>
      {places.length === 0 ? (
        <p className="muted">{t.empty}</p>
      ) : (
        <ul className="rows">
          {places.map((p) => (
            <li key={p.id}>
              <Link href={`/home-visits/${p.id}`} className="row row-link">
                <span>
                  <strong>{lang === "en" ? p.name_en : p.name_ar}</strong>
                  <small className="muted">
                    {" "}
                    · {kinds[p.kind]} · {lang === "en" ? p.area_en : p.area_ar}
                  </small>
                </span>
                <span className="chip">{t.open}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
