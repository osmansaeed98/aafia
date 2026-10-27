import { rate } from "@/app/ratings/actions";

// Stars and an optional private comment, after a completed visit.
// Once rated, shows the patient's own rating instead.
export default function RatingForm({ kind, id, existing, title, note, t }) {
  const alert =
    note === "thanks" ? (
      <p className="alert alert-ok" role="status">
        {t.thanks}
      </p>
    ) : note ? (
      <p className="alert alert-error" role="alert">
        {t.errors[note] ?? t.errors.generic}
      </p>
    ) : null;
  if (existing) {
    return (
      <section className="card">
        {alert}
        <h2>{t.yours}</h2>
        <p className="stars stars-big">
          {"★".repeat(existing.stars)}
          <span className="stars-off">{"★".repeat(5 - existing.stars)}</span> {existing.stars} {t.outOf}
        </p>
        {existing.comment && <p className="muted pre">{existing.comment}</p>}
      </section>
    );
  }
  return (
    <form action={rate} className="form card rating-form">
      <h2>{title}</h2>
      {alert}
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <div className="slots star-choice">
        {[5, 4, 3, 2, 1].map((n) => (
          <label key={n} className="slot">
            <input type="radio" name="stars" value={n} required />
            <span>
              <strong>
                {n} <span aria-hidden="true">★</span>
              </strong>
              <small>{t.stars[n]}</small>
            </span>
          </label>
        ))}
      </div>
      <label className="field">
        <span>
          {t.comment} <small>({t.optional})</small>
        </span>
        <textarea name="comment" rows={3} maxLength={500} />
        <small className="hint">{t.commentHint}</small>
      </label>
      <button className="button button-solid">{t.send}</button>
    </form>
  );
}
