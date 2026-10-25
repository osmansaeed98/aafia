import { getDictionary, getLang } from "@/lib/i18n";
import { sendCode, verifyCode } from "./actions";

export const metadata = { robots: { index: false } };

export default async function AdminLogin({ searchParams }) {
  const t = getDictionary(await getLang()).admin.login;
  const { email, error } = await searchParams;

  return (
    <div className="admin narrow">
      <h1>{t.title}</h1>

      {error && (
        <p className="alert alert-error" role="alert">
          {error === "code" ? t.errorCode : t.errorSend}
        </p>
      )}

      {email ? (
        <form action={verifyCode} className="form">
          <p>
            {t.codeSent} <strong dir="ltr">{email}</strong>
          </p>
          <input type="hidden" name="email" value={email} />
          <label className="field">
            <span>{t.code}</span>
            <input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9٠-٩ ]{6,12}"
              required
              dir="ltr"
              autoFocus
            />
          </label>
          <button className="button button-solid">{t.verify}</button>
          <a href="/admin/login" className="back-link">
            {t.otherEmail}
          </a>
        </form>
      ) : (
        <form action={sendCode} className="form">
          <label className="field">
            <span>{t.email}</span>
            <input name="email" type="email" autoComplete="email" required dir="ltr" />
          </label>
          <button className="button button-solid">{t.sendCode}</button>
        </form>
      )}
    </div>
  );
}
