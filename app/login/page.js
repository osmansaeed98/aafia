import { formatSudanPhone } from "@/lib/phone";
import { getDictionary, getLang } from "@/lib/i18n";
import { safeNext } from "@/lib/patient/auth";
import { phoneWaitingForCode } from "@/lib/patient/login-cookie";
import { sendCode, verifyCode } from "./actions";

export const metadata = { robots: { index: false } };

export default async function Login({ searchParams }) {
  const t = getDictionary(await getLang()).patient.login;
  const { step, error, reason, next: rawNext } = await searchParams;
  const next = safeNext(rawNext);
  const phone = step === "code" ? await phoneWaitingForCode() : null;

  const alert = error && (
    <p className="alert alert-error" role="alert">
      {t.errors[error] ?? t.errors.send}
      {/^[a-z0-9_]{1,40}$/.test(reason ?? "") && (
        <small className="error-reason" dir="ltr">
          {reason}
        </small>
      )}
    </p>
  );

  if (phone) {
    return (
      <div className="admin narrow">
        <h1>{t.codeTitle}</h1>
        {alert}
        <form action={verifyCode} className="form">
          <p>
            {t.codeSent} <strong dir="ltr">{formatSudanPhone(phone)}</strong>
          </p>
          <input type="hidden" name="next" value={next} />
          <label className="field">
            <span>{t.code}</span>
            <input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9٠-٩ ]{4,12}"
              maxLength={12}
              required
              dir="ltr"
              autoFocus
              className="code-input"
            />
          </label>
          <button className="button button-solid">{t.verify}</button>
        </form>
        <form action={sendCode} className="form resend">
          <input type="hidden" name="next" value={next} />
          <input type="hidden" name="resend" value="1" />
          <button className="button">{t.resend}</button>
        </form>
        <a href={`/login?next=${encodeURIComponent(next)}`} className="back-link">
          {t.otherPhone}
        </a>
      </div>
    );
  }

  return (
    <div className="admin narrow">
      <h1>{t.title}</h1>
      <p className="muted">{t.subtitle}</p>
      {alert}
      <form action={sendCode} className="form">
        <input type="hidden" name="next" value={next} />
        <label className="field">
          <span>{t.phone}</span>
          <input
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder={t.phoneExample}
            required
            dir="ltr"
          />
          <small className="hint">{t.phoneHint}</small>
        </label>
        <button className="button button-solid">{t.sendCode}</button>
      </form>
      <p className="footnote">{t.privacy}</p>
    </div>
  );
}
