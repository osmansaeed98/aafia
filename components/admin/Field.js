// A labelled input, at least 48px tall.
export function Field({ label, hint, optional, ...input }) {
  return (
    <label className="field">
      <span>
        {label}
        {optional && <small> ({optional})</small>}
      </span>
      <input {...input} />
      {hint && <small className="hint">{hint}</small>}
    </label>
  );
}

export function Check({ label, ...input }) {
  return (
    <label className="check">
      <input type="checkbox" {...input} />
      <span>{label}</span>
    </label>
  );
}

// No-JavaScript confirmation: tap "Delete", then confirm.
export function ConfirmDelete({ t, action, children }) {
  return (
    <details className="confirm-delete">
      <summary>{t.delete}</summary>
      <form action={action}>
        {children}
        <p>{t.confirmDelete}</p>
        <button className="button button-danger">{t.delete}</button>
      </form>
    </details>
  );
}
