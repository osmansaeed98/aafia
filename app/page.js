import Link from "next/link";
import { getDictionary, getLang } from "@/lib/i18n";

export default async function Home({ searchParams }) {
  const t = getDictionary(await getLang()).home;
  const { deleted } = await searchParams;

  return (
    <>
      <section className="hero">
        <h1>{t.title}</h1>
        <p>{t.subtitle}</p>
      </section>

      {deleted && (
        <p className="alert alert-ok" role="status">
          {t.accountDeleted}
        </p>
      )}

      <div className="actions">
        <Link href="/book" className="action action-primary">
          <span>
            <span className="action-title">{t.book}</span>
            <span className="action-hint">{t.bookHint}</span>
          </span>
        </Link>

        <div className="actions-grid">
          {[
            ["/labs", t.labs, t.labsHint],
            ["/pharmacies", t.pharmacy, t.pharmacyHint],
            ["/home-visits", t.visits, t.visitsHint],
            ["/records", t.records, t.recordsHint],
          ].map(([href, title, hint]) => (
            <Link key={href} href={href} className="action action-small">
              <span>
                <span className="action-title">{title}</span>
                <span className="action-hint">{hint}</span>
              </span>
            </Link>
          ))}
        </div>

        <Link href="/emergency" className="action action-danger">
          <span>
            <span className="action-title">{t.emergency}</span>
            <span className="action-hint">{t.emergencyHint}</span>
          </span>
        </Link>
      </div>
    </>
  );
}
