import { emergencyDepartments } from "@/lib/emergency-departments";
import { telHref } from "@/lib/format";
import { getDictionary, getLang } from "@/lib/i18n";

// Must work with no JavaScript and no internet: plain links only.
export default async function EmergencyPage() {
  const lang = await getLang();
  const t = getDictionary(lang).emergency;

  return (
    <div className="emergency">
      <h1>{t.title}</h1>
      <p className="lead">{t.lead}</p>
      <a href="tel:999" className="call-999">
        {t.call999}
      </a>

      <h2 className="section-title">{t.departments}</h2>
      {emergencyDepartments.length === 0 ? (
        <p className="notice">{t.empty}</p>
      ) : (
        <ul className="dept-list">
          {emergencyDepartments.map((dept) => (
            <li key={dept.nameEn} className="dept">
              <p className="dept-name">{lang === "ar" ? dept.nameAr : dept.nameEn}</p>
              <p className="dept-meta">
                <span>{lang === "ar" ? dept.areaAr : dept.areaEn}</span>
                {dept.open24h && <span className="chip">{t.open24h}</span>}
              </p>
              <div className="dept-actions">
                <a href={telHref(dept.phone)} className="button button-solid">
                  {t.call}
                </a>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dept.mapsQuery)}`}
                  className="button"
                >
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
