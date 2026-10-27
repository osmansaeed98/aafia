import Link from "next/link";
import Stars from "@/components/Stars";
import { getDictionary, getLang } from "@/lib/i18n";
import { ratingSummary } from "@/lib/ratings";
import { createSupabasePublic } from "@/lib/supabase/server";

export const metadata = { title: "الصيدليات | Aafia" };

export default async function Pharmacies() {
  const lang = await getLang();
  const t = getDictionary(lang).pharmacy;
  const db = createSupabasePublic();
  const [{ data }, ratings] = await Promise.all([db
    .from("places")
    .select("id, name_ar, name_en, area_ar, area_en, open_24h")
    .eq("kind", "pharmacy")
    .order("name_ar"), ratingSummary(db)]);
  const pharmacies = data ?? [];
  const tr = getDictionary(lang).ratings;
  const open24 = getDictionary(lang).emergency.open24h;

  return (
    <div className="admin">
      <h1>{t.title}</h1>
      <p className="muted">{t.subtitle}</p>
      {pharmacies.length === 0 ? (
        <p className="muted">{t.empty}</p>
      ) : (
        <ul className="rows">
          {pharmacies.map((p) => (
            <li key={p.id}>
              <Link href={`/pharmacies/${p.id}`} className="row row-link">
                <span>
                  <strong>{lang === "en" ? p.name_en : p.name_ar}</strong>
                  <small className="muted">
                    {" "}
                    · {lang === "en" ? p.area_en : p.area_ar}
                    {p.open_24h && ` · ${open24}`}
                  </small>{" "}
                  <Stars summary={ratings.places.get(p.id)} t={tr} />
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
