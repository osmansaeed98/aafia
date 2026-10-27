// "Who is it for?": me, or one of my family members.
export default function PersonChoice({ title, meLabel, profile, family }) {
  return (
    <>
      <h2>{title}</h2>
      <div className="slots">
        <label className="slot">
          <input type="radio" name="who" value="me" defaultChecked />
          <span>
            <strong>{meLabel}</strong>
            <small>{profile.full_name}</small>
          </span>
        </label>
        {family.map((m) => (
          <label key={m.id} className="slot">
            <input type="radio" name="who" value={m.id} />
            <span>
              <strong>{m.full_name}</strong>
            </span>
          </label>
        ))}
      </div>
    </>
  );
}
