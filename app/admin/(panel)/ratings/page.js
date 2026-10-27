import { formatDateTime } from "@/lib/datetime";
import { getAdminSession } from "@/lib/admin/auth";
import { getDictionary, getLang } from "@/lib/i18n";

// Every rating with its private comment, newest first: for the Aafia team
// to follow up on complaints. Patients' names aren't shown.
export default async function Ratings() {
  const lang = await getLang();
  const t = getDictionary(lang).admin.ratings;
  const { supabase } = await getAdminSession();
  const { data } = await supabase
    .from("ratings")
    .select("id, stars, comment, created_at, booking_id, pharmacy_request_id, places(name_ar, name_en), doctors(name_ar, name_en, is_lab_desk)")
    .order("created_at", { ascending: false })
    .limit(100);
  const ratings = data ?? [];
  const kind = (r) => (r.booking_id ? "booking" : r.pharmacy_request_id ? "medicines" : "visit");

  return (
    <>
      <h1>{t.title}</h1>
      <p className="muted">{t.subtitle}</p>
      {ratings.length === 0 ? (
        <p className="muted">{t.empty}</p>
      ) : (
        <ul className="rows">
          {ratings.map((r) => (
            <li key={r.id} className="card">
              <div className="row">
                <span>
                  <strong>{lang === "en" ? r.places?.name_en : r.places?.name_ar}</strong>
                  <small className="muted">
                    {r.doctors && !r.doctors.is_lab_desk && ` · ${lang === "en" ? r.doctors.name_en : r.doctors.name_ar}`} ·{" "}
                    {t.kinds[kind(r)]} · {formatDateTime(r.created_at, lang)}
                  </small>
                </span>
                <span className="stars">
                  <span aria-hidden="true">★</span> {r.stars}
                </span>
              </div>
              {r.comment && <p className="pre">{r.comment}</p>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
