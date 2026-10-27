// "★ 4.3 (12 ratings)" — shown only when the database shared an average.
export default function Stars({ summary, t }) {
  if (!summary) return null;
  const average = Number(summary.average).toFixed(1);
  return (
    <span className="stars" aria-label={`${average} ${t.outOf} · ${summary.ratings} ${t.count}`}>
      <span aria-hidden="true">★</span> {average} <small>({summary.ratings})</small>
    </span>
  );
}
