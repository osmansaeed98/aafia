// Shows the "saved" / error note after an admin change.
export default function Alerts({ t, ok, error }) {
  if (error) {
    const message =
      error === "notFound" ? t.team.notFound : (t.errors[error] ?? t.errors.generic);
    return (
      <p className="alert alert-error" role="alert">
        {message}
      </p>
    );
  }
  if (ok) {
    const message = { deleted: t.deleted, added: t.team.added, updated: t.team.updated }[ok] ?? t.saved;
    return (
      <p className="alert alert-ok" role="status">
        {message}
      </p>
    );
  }
  return null;
}
