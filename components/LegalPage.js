import { LEGAL_UPDATED, legal } from "@/lib/legal";

// Privacy or terms, in the visitor's language. The contact email is set
// in Vercel (NEXT_PUBLIC_CONTACT_EMAIL) once the owner has chosen one.
export default function LegalPage({ lang, page }) {
  const t = legal[lang][page];
  const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
  const updated = new Intl.DateTimeFormat(lang === "en" ? "en-GB-u-nu-latn" : "ar-SD-u-nu-latn", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${LEGAL_UPDATED}T00:00:00Z`));
  return (
    <article className="admin narrow legal">
      <h1>{t.title}</h1>
      <p>{t.intro}</p>
      {t.sections.map((s) => (
        <section key={s.heading}>
          <h2>{s.heading}</h2>
          <ul>
            {s.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ))}
      {contact && (
        <p>
          {t.contact}{" "}
          <a href={`mailto:${contact}`} dir="ltr">
            {contact}
          </a>
        </p>
      )}
      <p className="footnote">
        {t.updated}: {updated}
      </p>
    </article>
  );
}
