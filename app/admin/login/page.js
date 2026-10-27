import { getDictionary, getLang } from "@/lib/i18n";
import { sendLink, verifyEmailCode } from "./actions";

export const metadata = { robots: { index: false } };

export default async function AdminLogin({ searchParams }) {
  const t = getDictionary(await getLang()).admin.login;
  const { email, error, reason } = await searchParams;

  return (
    <div className="admin narrow">
      <h1>{t.title}</h1>

      {error && (
        <p className="alert alert-error" role="alert">
          {{ link: t.errorLink, rate: t.errorRate, notAuthorized: t.errorNotAuthorized, code: t.errorCode }[error] ?? t.errorSend}
          {/^[a-z0-9_]{1,40}$/.test(reason ?? "") && (
            <small className="error-reason" dir="ltr">
              {reason}
            </small>
          )}
        </p>
      )}

      {email && (!error || error === "code") ? (
        <div className="form">
          <p className="alert alert-ok" role="status">
            {t.linkSent} <strong dir="ltr">{email}</strong>
          </p>
          <p>{t.openLink}</p>
          <p className="muted">{t.sameBrowser}</p>
          <form action={verifyEmailCode} className="form">
            <input type="hidden" name="email" value={email} />
            <label className="field">
              <span>{t.orCode}</span>
              <input
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9٠-٩۰-۹ ]{6,12}"
                maxLength={12}
                required
                dir="ltr"
                className="code-input"
                aria-label={t.code}
              />
            </label>
            <button className="button button-solid">{t.verify}</button>
          </form>
          <a href="/admin/login" className="back-link">
            {t.otherEmail}
          </a>
        </div>
      ) : (
        <form action={sendLink} className="form">
          <label className="field">
            <span>{t.email}</span>
            <input name="email" type="email" autoComplete="email" required dir="ltr" defaultValue={email} />
          </label>
          <button className="button button-solid">{t.sendLink}</button>
        </form>
      )}
    </div>
  );
}
