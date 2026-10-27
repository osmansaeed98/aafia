import Link from "next/link";
import { getDictionary, getLang } from "@/lib/i18n";
import { createSupabasePublic } from "@/lib/supabase/server";

export const metadata = { title: "المعامل | Aafia" };

export default async function Labs() {
  const lang = await getLang();
  const t = getDictionary(lang).labs;
  const { data } = await createSupabasePublic()
    .from("places")
    .select("id, name_ar, name_en, area_ar, area_en, doctors!inner(id, is_lab_desk)")
    .eq("kind", "lab")
    .eq("doctors.is_lab_desk", true)
    .order("name_ar");
  const labs = data ?? [];

  return (
    <div className="admin">
      <h1>{t.title}</h1>
      <p className="muted">{t.subtitle}</p>
      {labs.length === 0 ? (
        <p className="muted">{t.empty}</p>
      ) : (
        <ul className="rows">
          {labs.map((lab) => (
            <li key={lab.id}>
              <Link href={`/book/${lab.doctors[0].id}`} className="row row-link">
                <span>
                  <strong>{lang === "en" ? lab.name_en : lab.name_ar}</strong>
                  <small className="muted"> · {lang === "en" ? lab.area_en : lab.area_ar}</small>
                </span>
                <span className="chip">{t.book}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
