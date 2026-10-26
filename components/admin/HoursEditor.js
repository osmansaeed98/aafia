import { addHours, deleteHours } from "@/app/admin/(panel)/actions";
import { formatClock } from "@/lib/format";

// Saturday first, as the Sudanese week runs.
const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5];

export default function HoursEditor({ t, lang, title, owner, ownerId, hours, back }) {
  const h = t.hours;
  const sorted = [...hours].sort(
    (a, b) => WEEK_ORDER.indexOf(a.weekday) - WEEK_ORDER.indexOf(b.weekday) || a.opens.localeCompare(b.opens),
  );
  return (
    <section className="card">
      <h2>{title}</h2>
      {sorted.length === 0 ? (
        <p className="muted">{h.empty}</p>
      ) : (
        <ul className="rows">
          {sorted.map((row) => (
            <li key={row.id} className="row">
              <span>
                <strong>{h.days[row.weekday]}</strong> {formatClock(row.opens, lang)} – {formatClock(row.closes, lang)}
                {row.closes < row.opens && <small className="muted"> ({h.overnight})</small>}
              </span>
              <form action={deleteHours}>
                <input type="hidden" name="id" value={row.id} />
                <input type="hidden" name="back" value={back} />
                <button className="button button-small">{t.delete}</button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <form action={addHours} className="form hours-form">
        <input type="hidden" name="owner" value={owner} />
        <input type="hidden" name="owner_id" value={ownerId} />
        <input type="hidden" name="back" value={back} />
        <label className="field">
          <span>{h.weekday}</span>
          <select name="weekday" required defaultValue="6">
            {WEEK_ORDER.map((d) => (
              <option key={d} value={d}>
                {h.days[d]}
              </option>
            ))}
          </select>
        </label>
        <div className="pair">
          <label className="field">
            <span>{h.opens}</span>
            <input type="time" name="opens" required defaultValue="09:00" dir="ltr" />
          </label>
          <label className="field">
            <span>{h.closes}</span>
            <input type="time" name="closes" required defaultValue="17:00" dir="ltr" />
          </label>
        </div>
        <button className="button">{h.add}</button>
      </form>
    </section>
  );
}
