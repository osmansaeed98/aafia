import { telHref } from "@/lib/format";
import { getDictionary, getLang } from "@/lib/i18n";
import { createSupabasePublic } from "@/lib/supabase/server";

// The 999 button must show even if the list can't be loaded.
async function loadDepartments() {
  try {
    const { data, error } = await createSupabasePublic()
      .from("emergency_departments")
      .select("id, name_ar, name_en, area_ar, area_en, phone, latitude, longitude, open_24h")
      .eq("is_active", true)
      .order("sort_order")
      .order("name_ar")
      .abortSignal(AbortSignal.timeout(4000));
    if (error) throw error;
    return { departments: data, failed: false };
  } catch {
    return { departments: [], failed: true };
  }
}

function mapsHref(dept) {
  const query =
    dept.latitude !== null ? `${dept.latitude},${dept.longitude}` : `${dept.name_en}, ${dept.area_en}, Khartoum`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

// Must work with no JavaScript and no internet: plain links only.
export default async function EmergencyPage() {
  const lang = await getLang();
  const t = getDictionary(lang).emergency;
  const { departments, failed } = await loadDepartments();

  return (
    <div className="emergency">
      <h1>{t.title}</h1>
      <p className="lead">{t.lead}</p>
      <a href="tel:999" className="call-999">
        {t.call999}
      </a>

      <h2 className="section-title">{t.departments}</h2>
      {departments.length === 0 ? (
        <p className="notice">{failed ? t.loadFailed : t.empty}</p>
      ) : (
        <ul className="dept-list">
          {departments.map((dept) => (
            <li key={dept.id} className="dept">
              <p className="dept-name">{lang === "ar" ? dept.name_ar : dept.name_en}</p>
              <p className="dept-meta">
                <span>{lang === "ar" ? dept.area_ar : dept.area_en}</span>
                {dept.open_24h && <span className="chip">{t.open24h}</span>}
              </p>
              <div className="dept-actions">
                <a href={telHref(dept.phone)} className="button button-solid">
                  {t.call}
                </a>
                <a href={mapsHref(dept)} className="button">
                  {t.directions}
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="footnote">{t.offlineNote}</p>
      <a href="/" className="back-link">
        {t.back}
      </a>
    </div>
  );
}
